import { and, count, eq, gte, lte } from "drizzle-orm";
import { dayOf, daysBefore } from "@/dates";
import type { Db } from "@/db";
import { calls, signals, startups, triageDecisions } from "@/db/schema";
import { createRadar, type RadarRow } from "@/radar/radar";
import { CLAIMS, OWNER_FACTORS, type Claim, type OwnerFactor, type TriageInput } from "./types";

// A decision the Owner can correct, such as a missing rationale. The UI shows its message as is.
export class TriageError extends Error {}

const QUEUE_SIZE = 15;
const EXPIRY_DAYS = 28;
const MOMENTUM_WINDOW_DAYS = 90;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Candidates that waited four weeks without Triage expire: archived, not deleted, and without a Call (CONTEXT.md).
function expireOverdue(db: Db, at: Date) {
  return db
    .update(startups)
    .set({ status: "Expired", statusChangedAt: at })
    .where(and(eq(startups.status, "Candidate"), lte(startups.statusChangedAt, daysBefore(at, EXPIRY_DAYS))));
}

export function createTriage(db: Db, { now }: { now: () => Date }) {
  const radar = createRadar(db);
  return {
    // The Candidates for this week's Triage, highest Priority first, at most 15 at a time.
    async queue(): Promise<RadarRow[]> {
      await expireOverdue(db, now());
      return (await radar.list()).filter((r) => r.status === "Candidate").slice(0, QUEUE_SIZE);
    },

    // Records the Owner's decision on a Candidate. Track and Pass carry the Scorecard and both Calls;
    // Out of Scope says Screening was wrong and carries neither.
    async decide(startupId: string, input: TriageInput) {
      if (input.decision !== "Out of Scope") validate(input);
      const at = now();
      await expireOverdue(db, at);
      await db.transaction(async (tx) => {
        const [startup] = await tx.select({ status: startups.status }).from(startups).where(eq(startups.id, startupId));
        if (startup?.status !== "Candidate") {
          throw new TriageError(`Triage decides only a Candidate; this startup is ${startup?.status ?? "unknown"}.`);
        }
        if (input.decision === "Out of Scope") {
          await tx
            .insert(triageDecisions)
            .values({ startupId, decision: input.decision, rationale: input.rationale?.trim() || null, decidedAt: at });
        } else {
          const momentum = await momentumOf(tx, startupId, at);
          const [decision] = await tx
            .insert(triageDecisions)
            .values({ startupId, decision: input.decision, rationale: input.rationale, decidedAt: at, ...input.scorecard, momentum })
            .returning({ id: triageDecisions.id });
          await tx.insert(calls).values(
            (Object.entries(input.calls) as [Claim, number][]).map(([claim, probability]) => ({
              startupId,
              decisionId: decision.id,
              claim,
              probability,
              rationale: input.rationale,
              madeAt: at,
            })),
          );
        }
        await tx.update(startups).set({ status: input.decision, statusChangedAt: at }).where(eq(startups.id, startupId));
      });
    },
  };
}

function validate(input: Extract<TriageInput, { decision: "Track" | "Pass" }>) {
  if (!input.rationale.trim()) throw new TriageError("A Call needs a one-line rationale.");
  // Nothing is filled in for the Owner (docs/adr/0004), so a missing value is refused, never defaulted.
  if (Object.keys(OWNER_FACTORS).some((f) => input.scorecard?.[f as OwnerFactor] === undefined)) {
    throw new TriageError("Track and Pass need every Factor of the Scorecard.");
  }
  if (Object.keys(CLAIMS).some((c) => input.calls?.[c as Claim] === undefined)) {
    throw new TriageError("Track and Pass need both Calls.");
  }
  for (const [factor, value] of Object.entries(input.scorecard)) {
    if (!Number.isInteger(value) || value < 1 || value > 5) throw new TriageError(`${factor} must be a whole number from 1 to 5.`);
  }
  for (const [claim, probability] of Object.entries(input.calls)) {
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
      throw new TriageError(`The ${claim} Call must be a whole percentage from 0 to 100.`);
    }
  }
}

// Momentum is the one Factor the radar sets: the startup's Signals in the last 90 days, from 1 to 5.
async function momentumOf(tx: Tx, startupId: string, at: Date) {
  const since = dayOf(daysBefore(at, MOMENTUM_WINDOW_DAYS));
  const [{ recent }] = await tx
    .select({ recent: count() })
    .from(signals)
    .where(and(eq(signals.startupId, startupId), gte(signals.date, since)));
  return Math.min(5, Math.max(1, recent));
}
