import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { dayOf } from "@/dates";
import type { Db } from "@/db";
import { calls, legalEntities, signals, sightings, startups, triageDecisions } from "@/db/schema";
import type { Lane } from "@/screening/types";
import { CLAIMS, scorecardFrom, type Claim, type Scorecard, type TriageDecision } from "@/triage/types";
import { matchStartup, ownWebsite, type Identity } from "./identity";

export const STAGES = ["Pre-round", "Pre-seed", "Seed"] as const;
export type Stage = (typeof STAGES)[number];

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
  website: string | null;
  latestSignal: { date: string; source: string; text: string; url: string | null } | null;
  roundCall: number | null; // the Round Call: the first Call on an Institutional Round within 12 months
};

export type TimelineEntry =
  | { date: string; kind: "signal"; source: string; text: string; url: string | null }
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
          website: r.website,
          latestSignal: s ? { date: s.date, source: s.source, text: s.text, url: s.url } : null,
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
        ...startupSignals.map((s) => ({ date: s.date, kind: "signal" as const, source: s.source, text: s.text, url: s.url })),
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

// Where a startup goes on the radar: from Screening, from the Owner pulling in a Near Miss, or from Quick Add.
export type Placement = { lane: Lane; secondaryLane: Lane | null; oneLiner: string; priority: number };

// What a Source tells the radar about a startup, and the Signal it brings.
export type Discovery = {
  name: string;
  hq: string;
  country: string; // ISO 3166 code, such as CH or DE
  stage: Stage;
  website: string | null;
  firstSeen: string;
  legalEntity: { name: string; uid: string | null; legalForm: string; seat: string; registeredOn: string | null } | null;
  // A Swiss UID a Source gives without the rest of a Legal Entity: it finds a known startup, never makes one.
  matchUid?: string | null;
  signal: { date: string; source: string; text: string; url: string | null };
};

// Screening's record on the Sighting. A pulled-in Near Miss keeps Claude's original record.
export type ScreeningRecord = { screenedAt: Date; criteriaVersion: number | null; screeningReason: string; screenedBy: string };

// Puts a Sighting on the radar. A startup the radar already knows (identity.ts) gets the new Signal; a
// waiting or Expired one goes back into Triage with a fresh four weeks from `at`. Otherwise a new
// Candidate is created. The Sighting is marked in the same transaction, so if anything fails it stays as
// it was instead of becoming a Signal without a Startup. An article naming several startups points to
// the first of them; each Signal points back to the Sighting.
export async function putOnRadar(
  db: Db,
  {
    sightingId,
    discovery,
    placement,
    at,
    screening,
  }: { sightingId: string; discovery: Discovery; placement: Placement; at: Date; screening?: ScreeningRecord },
): Promise<{ startupId: string; known: boolean }> {
  return db.transaction(async (tx) => {
    const known = (await knownStartups(tx)).match(identityOf(discovery));
    let startupId: string;
    if (known) {
      startupId = known.id;
      if (known.status === "Candidate" || known.status === "Expired") {
        await tx
          .update(startups)
          .set({ status: "Candidate", statusChangedAt: at, priority: Math.max(known.priority, placement.priority) })
          .where(eq(startups.id, startupId));
      }
      const website = ownWebsite(discovery.website);
      if (!known.website && website) await tx.update(startups).set({ website }).where(eq(startups.id, startupId));
    } else {
      const [startup] = await tx
        .insert(startups)
        .values({
          name: discovery.name,
          lane: placement.lane,
          secondaryLane: placement.secondaryLane,
          stage: discovery.stage,
          status: "Candidate",
          statusChangedAt: at,
          priority: placement.priority,
          hq: discovery.hq,
          country: discovery.country,
          oneLiner: placement.oneLiner,
          website: ownWebsite(discovery.website),
          firstSeen: discovery.firstSeen,
        })
        .returning({ id: startups.id });
      startupId = startup.id;
    }
    const entity = discovery.legalEntity;
    if (entity && !(known && entity.uid && known.entities.some((e) => e.uid === entity.uid))) {
      await tx.insert(legalEntities).values({ startupId, ...entity }).onConflictDoNothing();
    }
    await tx.insert(signals).values({ startupId, sightingId, ...discovery.signal });
    await tx
      .update(sightings)
      .set({ ...screening, screening: "signal", startupId: sql`coalesce(${sightings.startupId}, ${startupId})` })
      .where(eq(sightings.id, sightingId));
    return { startupId, known: Boolean(known) };
  });
}

const identityOf = (d: Discovery): Identity => ({
  name: d.name,
  website: d.website,
  uid: d.legalEntity?.uid ?? d.matchUid ?? null,
  legalName: d.legalEntity?.name ?? null,
});

// Every startup the radar knows, to match against the identity rule (identity.ts). The radar holds
// hundreds of startups, not millions, so matching in memory keeps the rule in one place.
export async function knownStartups(db: Db) {
  const all = await db
    .select({ id: startups.id, name: startups.name, website: startups.website, status: startups.status, priority: startups.priority })
    .from(startups);
  const entities = await db.select({ startupId: legalEntities.startupId, name: legalEntities.name, uid: legalEntities.uid }).from(legalEntities);
  const known = all.map((s) => ({ ...s, entities: entities.filter((e) => e.startupId === s.id) }));
  return { match: (identity: Identity) => matchStartup(known, identity) };
}
