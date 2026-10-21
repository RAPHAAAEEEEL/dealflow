import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { dayOf } from "@/dates";
import type { Db } from "@/db";
import { calls, legalEntities, signals, sightings, startups, triageDecisions } from "@/db/schema";
import type { Lane } from "@/screening/types";
import { CLAIMS, scorecardFrom, type Claim, type Scorecard, type TriageDecision } from "@/triage/types";
import { nameKey, websiteDomain } from "./identity";

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
  signal: { date: string; source: string; text: string; url: string | null };
};

// Screening's record on the Sighting. A pulled-in Near Miss keeps Claude's original record.
export type ScreeningRecord = { screenedAt: Date; criteriaVersion: number | null; screeningReason: string; screenedBy: string };

// Puts a Sighting on the radar. A startup the radar already knows (docs: identity.ts) gets the new
// Signal; a waiting or Expired one goes back into Triage with a fresh four weeks from `at`. Otherwise a
// new Candidate is created. The Sighting is marked in the same transaction, so if anything fails it
// stays as it was instead of becoming a Signal without a Startup.
export async function putOnRadar(
  db: Db,
  {
    sightingId,
    discovery: d,
    placement,
    at,
    screening,
  }: { sightingId: string; discovery: Discovery; placement: Placement; at: Date; screening?: ScreeningRecord },
): Promise<{ startupId: string; known: boolean }> {
  return db.transaction(async (tx) => {
    const known = await findStartup(tx, d);
    let startupId: string;
    if (known) {
      startupId = known.id;
      if (known.status === "Candidate" || known.status === "Expired") {
        await tx
          .update(startups)
          .set({ status: "Candidate", statusChangedAt: at, priority: Math.max(known.priority, placement.priority) })
          .where(eq(startups.id, startupId));
      }
      if (!known.website && websiteDomain(d.website)) await tx.update(startups).set({ website: d.website }).where(eq(startups.id, startupId));
    } else {
      const [startup] = await tx
        .insert(startups)
        .values({
          name: d.name,
          lane: placement.lane,
          secondaryLane: placement.secondaryLane,
          stage: d.stage,
          status: "Candidate",
          statusChangedAt: at,
          priority: placement.priority,
          hq: d.hq,
          country: d.country,
          oneLiner: placement.oneLiner,
          website: websiteDomain(d.website) ? d.website : null,
          firstSeen: d.firstSeen,
        })
        .returning({ id: startups.id });
      startupId = startup.id;
    }
    if (d.legalEntity && !(known && d.legalEntity.uid && known.uids.includes(d.legalEntity.uid))) {
      await tx.insert(legalEntities).values({ startupId, ...d.legalEntity }).onConflictDoNothing();
    }
    await tx.insert(signals).values({ startupId, sightingId, ...d.signal });
    await tx
      .update(sightings)
      .set({ ...screening, screening: "signal", startupId })
      .where(eq(sightings.id, sightingId));
    return { startupId, known: Boolean(known) };
  });
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// The radar holds hundreds of startups, not millions, so matching in memory keeps the rule in one place.
async function findStartup(tx: Tx, d: Discovery) {
  const all = await tx
    .select({ id: startups.id, name: startups.name, website: startups.website, status: startups.status, priority: startups.priority })
    .from(startups);
  const entities = await tx.select({ startupId: legalEntities.startupId, name: legalEntities.name, uid: legalEntities.uid }).from(legalEntities);
  const withEntities = all.map((s) => ({ ...s, entities: entities.filter((e) => e.startupId === s.id) }));

  const uid = d.legalEntity?.uid;
  const domain = websiteDomain(d.website);
  const keys = new Set([nameKey(d.name), ...(d.legalEntity ? [nameKey(d.legalEntity.name)] : [])]);
  const match =
    (uid && withEntities.find((s) => s.entities.some((e) => e.uid === uid))) ||
    (domain && withEntities.find((s) => websiteDomain(s.website) === domain)) ||
    withEntities.find((s) => keys.has(nameKey(s.name)) || s.entities.some((e) => keys.has(nameKey(e.name))));
  return match ? { ...match, uids: match.entities.map((e) => e.uid).filter(Boolean) as string[] } : null;
}
