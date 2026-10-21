import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import { dayOf, daysBefore } from "@/dates";
import type { Db } from "@/db";
import { nearMissDecisions, sightings } from "@/db/schema";
import { knownStartups, putOnRadar } from "@/radar/radar";
import type { Lane } from "@/screening/types";
import { shabPayload, type Sighting } from "@/sighting";
import { registrationText, shabDiscovery } from "@/sources/shab";

// The Owner's two answers to a Near Miss: Screening should have kept it, or was right to discard it.
export const NEAR_MISS_DECISIONS = ["Pulled In", "Rightly Out"] as const;
export type NearMissDecision = (typeof NEAR_MISS_DECISIONS)[number];

// A decision the Owner can't make, for example a second one on the same entry. The UI shows its message as is.
export class NearMissError extends Error {}

export type NearMiss = {
  sightingId: string;
  name: string;
  nearestLane: Lane;
  closeness: number;
  oneLiner: string;
  reason: string;
  publishedOn: string;
  registration: string; // quoted from the register, shown apart from Claude's words
};

export type DecidedNearMiss = {
  name: string;
  decision: NearMissDecision;
  decidedOn: string;
  nearestLane: Lane;
  closeness: number;
  reason: string;
  criteriaVersion: number;
};

const SHOWN = 5;
const WINDOW_DAYS = 7;
const MIN_CLOSENESS = 20; // below this a discard is noise, never a Near Miss
const PULLED_IN_PRIORITY = 100; // the Owner asked for it, so it comes first in the Triage queue

// Discarded by Claude with a nearest Lane, and not decided yet.
const waitingForDecision = and(
  eq(sightings.source, "SHAB"),
  eq(sightings.screening, "discarded"),
  isNotNull(sightings.nearestLane),
  isNotNull(sightings.payload),
  isNull(nearMissDecisions.id),
);

// A startup the radar already knows had its Triage, so its new Sighting is no Near Miss of Screening.
async function unknownToRadar<T extends { payload: Sighting | null }>(db: Db, rows: T[]) {
  const known = await knownStartups(db);
  return rows.filter(({ payload }) => !known.match(identityOf(shabDiscovery(shabPayload(payload)))));
}

const identityOf = ({ name, website, legalEntity }: ReturnType<typeof shabDiscovery>) => ({
  name,
  website,
  uid: legalEntity?.uid ?? null,
  legalName: legalEntity?.name ?? null,
});

export function createNearMisses(db: Db, { now }: { now: () => Date }) {
  return {
    // The week's closest discards, closest first, at most five.
    async list(): Promise<NearMiss[]> {
      const rows = await db
        .select({ sighting: sightings })
        .from(sightings)
        .leftJoin(nearMissDecisions, eq(nearMissDecisions.sightingId, sightings.id))
        .where(and(waitingForDecision, gte(sightings.closeness, MIN_CLOSENESS), gte(sightings.screenedAt, daysBefore(now(), WINDOW_DAYS))))
        .orderBy(desc(sightings.closeness), desc(sightings.publishedOn));
      const unknown = await unknownToRadar(db, rows.map((r) => r.sighting));
      return unknown.slice(0, SHOWN).map((s) => ({
        sightingId: s.id,
        name: shabPayload(s.payload).legalEntity.name,
        nearestLane: s.nearestLane!,
        closeness: s.closeness!,
        oneLiner: s.oneLiner ?? "",
        reason: s.screeningReason ?? "",
        publishedOn: s.publishedOn,
        registration: registrationText(shabPayload(s.payload)),
      }));
    },

    // "Pulled In" makes the Near Miss a Candidate for this week's Triage; "Rightly Out" confirms the discard.
    async decide(sightingId: string, decision: NearMissDecision) {
      const at = now();
      await db.transaction(async (tx) => {
        const found = await tx
          .select({ sighting: sightings })
          .from(sightings)
          .leftJoin(nearMissDecisions, eq(nearMissDecisions.sightingId, sightings.id))
          .where(and(eq(sightings.id, sightingId), waitingForDecision));
        const [nearMiss] = await unknownToRadar(tx, found.map((r) => r.sighting));
        if (!nearMiss) throw new NearMissError("This entry is no longer a Near Miss waiting for a decision.");
        const { payload, nearestLane, oneLiner } = nearMiss;

        const inserted = await tx
          .insert(nearMissDecisions)
          .values({ sightingId, decision, decidedAt: at })
          .onConflictDoNothing()
          .returning({ id: nearMissDecisions.id });
        if (!inserted.length) throw new NearMissError("This Near Miss already has a decision.");

        if (decision === "Pulled In") {
          // Claude's record on the Sighting stays; the decision says the Owner overruled it.
          await putOnRadar(tx, {
            sightingId,
            discovery: shabDiscovery(shabPayload(payload)),
            placement: { lane: nearestLane!, secondaryLane: null, oneLiner: oneLiner ?? "", priority: PULLED_IN_PRIORITY },
            at,
          });
        }
      });
    },

    // Every decision, newest first, with what Claude said: evidence for Proposals to the Screening Criteria.
    async decided(): Promise<DecidedNearMiss[]> {
      const rows = await db
        .select()
        .from(nearMissDecisions)
        .innerJoin(sightings, eq(sightings.id, nearMissDecisions.sightingId))
        .orderBy(desc(nearMissDecisions.decidedAt));
      return rows.map(({ near_miss_decisions: d, sightings: s }) => ({
        name: shabPayload(s.payload).legalEntity.name,
        decision: d.decision,
        decidedOn: dayOf(d.decidedAt),
        nearestLane: s.nearestLane!,
        closeness: s.closeness!,
        reason: s.screeningReason ?? "",
        criteriaVersion: s.criteriaVersion!,
      }));
    },
  };
}
