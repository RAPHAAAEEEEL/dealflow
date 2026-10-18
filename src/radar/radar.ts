import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { dayOf } from "@/dates";
import type { Db } from "@/db";
import { calls, legalEntities, signals, sightings, startups, triageDecisions } from "@/db/schema";
import type { Lane } from "@/screening/types";
import type { Sighting } from "@/sighting";
import { CLAIMS, scorecardFrom, type Claim, type Scorecard, type TriageDecision } from "@/triage/types";

export type Stage = "Pre-round" | "Pre-seed" | "Seed";

export const STARTUP_STATUSES = ["Candidate", "Track", "Pass", "Out of Scope", "Expired"] as const satisfies readonly (
  | "Candidate"
  | "Expired"
  | TriageDecision
)[];
export type StartupStatus = (typeof STARTUP_STATUSES)[number];

export type RadarRow = {
  id: string;
  name: string;
  lane: Lane;
  secondaryLane: Lane | null;
  stage: Stage;
  status: StartupStatus;
  priority: number;
  hq: string;
  country: string;
  firstSeen: string;
  oneLiner: string;
  latestSignal: { date: string; source: string; text: string } | null;
  roundCall: number | null; // the Round Call: the first Call on an Institutional Round within 12 months
};

export type TimelineEntry =
  | { date: string; kind: "signal"; source: string; text: string }
  | { date: string; kind: "triage" | "call"; text: string };

export type StartupProfile = RadarRow & {
  scorecard: Scorecard | null;
  calls: { claim: Claim; probability: number; rationale: string; madeOn: string }[];
  timeline: TimelineEntry[]; // newest first
};

const CLAIM_ORDER = Object.keys(CLAIMS);
const SAME_DAY_ORDER = { triage: 0, call: 1, signal: 2 };

export function createRadar(db: Db) {
  return {
    async list(): Promise<RadarRow[]> {
      const rows = await db.select().from(startups).orderBy(desc(startups.priority), startups.name);
      if (!rows.length) return [];
      const ids = rows.map((r) => r.id);
      const latestFirst = await db.select().from(signals).where(inArray(signals.startupId, ids)).orderBy(desc(signals.date));
      const roundCalls = await db
        .select({ startupId: calls.startupId, probability: calls.probability })
        .from(calls)
        .where(and(inArray(calls.startupId, ids), eq(calls.claim, "institutional-round-12m")))
        .orderBy(asc(calls.madeAt));
      return rows.map((r) => {
        const s = latestFirst.find((x) => x.startupId === r.id);
        return {
          id: r.id,
          name: r.name,
          lane: r.lane,
          secondaryLane: r.secondaryLane,
          stage: r.stage,
          status: r.status,
          priority: r.priority,
          hq: r.hq,
          country: r.country,
          firstSeen: r.firstSeen,
          oneLiner: r.oneLiner,
          latestSignal: s ? { date: s.date, source: s.source, text: s.text } : null,
          roundCall: roundCalls.find((c) => c.startupId === r.id)?.probability ?? null,
        };
      });
    },

    // Everything the radar knows about one startup.
    async profile(id: string): Promise<StartupProfile | null> {
      const row = (await this.list()).find((r) => r.id === id);
      if (!row) return null;
      const [decision] = await db.select().from(triageDecisions).where(eq(triageDecisions.startupId, id));
      const callsMade = (await db.select().from(calls).where(eq(calls.startupId, id))).sort(
        (a, b) => a.madeAt.getTime() - b.madeAt.getTime() || CLAIM_ORDER.indexOf(a.claim) - CLAIM_ORDER.indexOf(b.claim),
      );
      const startupSignals = await db.select().from(signals).where(eq(signals.startupId, id));

      const timeline: TimelineEntry[] = [
        ...startupSignals.map((s) => ({ date: s.date, kind: "signal" as const, source: s.source, text: s.text })),
        ...(decision
          ? [{ date: dayOf(decision.decidedAt), kind: "triage" as const, text: [decision.decision, decision.rationale].filter(Boolean).join(": ") }]
          : []),
        ...callsMade.map((c) => ({ date: dayOf(c.madeAt), kind: "call" as const, text: `${CLAIMS[c.claim]}: ${c.probability}%` })),
      ];
      timeline.sort((a, b) => b.date.localeCompare(a.date) || SAME_DAY_ORDER[a.kind] - SAME_DAY_ORDER[b.kind]);

      return {
        ...row,
        scorecard: decision ? scorecardFrom(decision) : null,
        calls: callsMade.map((c) => ({ claim: c.claim, probability: c.probability, rationale: c.rationale, madeOn: dayOf(c.madeAt) })),
        timeline,
      };
    },
  };
}

// Where a startup goes on the radar: from Screening, or from the Owner pulling in a Near Miss.
export type Placement = { lane: Lane; secondaryLane: Lane | null; oneLiner: string; priority: number };

// Screening's record on the Sighting. A pulled-in Near Miss keeps Claude's original record.
export type ScreeningRecord = { screenedAt: Date; criteriaVersion: number; screeningReason: string; screenedBy: string };

// Puts a Sighting on the radar. A Legal Entity the radar already knows gets the new Signal on its
// Startup; otherwise a new Candidate is created with its Legal Entity and first Signal. `at` starts
// the Candidate's four weeks. The Sighting is marked in the same transaction, so if anything fails it
// stays as it was instead of becoming a Signal without a Startup.
export async function putOnRadar(
  db: Db,
  {
    sightingId,
    sighting,
    placement,
    at,
    screening,
  }: { sightingId: string; sighting: Sighting; placement: Placement; at: Date; screening?: ScreeningRecord },
) {
  const entity = sighting.legalEntity;
  await db.transaction(async (tx) => {
    const [known] = entity.uid
      ? await tx
          .select({ startupId: legalEntities.startupId, status: startups.status })
          .from(legalEntities)
          .innerJoin(startups, eq(startups.id, legalEntities.startupId))
          .where(eq(legalEntities.uid, entity.uid))
      : [];
    let startupId = known?.startupId;
    if (startupId) {
      // Something new happened: a waiting or Expired startup goes back into Triage with a fresh four weeks.
      if (known.status === "Candidate" || known.status === "Expired") {
        await tx.update(startups).set({ status: "Candidate", statusChangedAt: at }).where(eq(startups.id, startupId));
      }
    } else {
      const [startup] = await tx
        .insert(startups)
        .values({
          name: entity.name,
          lane: placement.lane,
          secondaryLane: placement.secondaryLane,
          stage: "Pre-round",
          status: "Candidate",
          statusChangedAt: at,
          priority: placement.priority,
          hq: entity.seat.replace(/\s*\([A-Z]{2}\)$/, ""),
          country: "CH",
          oneLiner: placement.oneLiner,
          firstSeen: sighting.publishedOn,
        })
        .returning({ id: startups.id });
      startupId = startup.id;
      await tx.insert(legalEntities).values({
        startupId,
        name: entity.name,
        uid: entity.uid,
        legalForm: entity.legalForm,
        seat: entity.seat,
        registeredOn: sighting.publishedOn,
      });
    }
    await tx.insert(signals).values({
      startupId,
      sightingId,
      date: sighting.publishedOn,
      source: sighting.source,
      text: registrationText(sighting),
    });
    await tx
      .update(sightings)
      .set({ ...screening, screening: "signal", startupId })
      .where(eq(sightings.id, sightingId));
  });
}

// The Signal text for a new registration. It quotes the register, so it is shown apart from the radar's own words (SHAB terms).
export function registrationText({ legalEntity: e }: Sighting) {
  const capital = e.capitalChf === null ? "" : ` Share capital CHF ${e.capitalChf.toLocaleString("en-US")}.`;
  return `New registration: ${e.name}, ${e.seat}. Purpose: ${e.purpose || "none given."}${capital}`;
}
