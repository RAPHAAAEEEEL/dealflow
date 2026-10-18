import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { nearMissReviews, sightings } from "@/db/schema";
import { putOnRadar, registrationText } from "@/radar/radar";
import type { Lane } from "@/screening/types";

export type NearMissVerdict = "Pulled In" | "Rightly Out";

// A verdict the Owner can't give, for example a second one on the same entry. The UI shows its message as is.
export class NearMissError extends Error {}

export type NearMiss = {
  sightingId: string;
  name: string;
  nearestLane: Lane;
  closeness: number;
  oneLiner: string;
  reason: string;
  publishedOn: string;
  url: string;
  registration: string; // quoted from the register, shown apart from Claude's words
};

export type NearMissReview = {
  name: string;
  verdict: NearMissVerdict;
  reviewedOn: string;
  nearestLane: Lane;
  closeness: number;
  reason: string;
  criteriaVersion: number;
};

const SHOWN = 5;
const WINDOW_DAYS = 7;
const MIN_CLOSENESS = 20; // below this a discard is noise, never a Near Miss
const PULLED_IN_PRIORITY = 100; // the Owner asked for it, so it comes first in the Triage queue

// Discarded by Claude with a nearest Lane, and no verdict from the Owner yet.
const waitingForVerdict = and(
  eq(sightings.screening, "discarded"),
  isNotNull(sightings.nearestLane),
  isNotNull(sightings.payload),
  isNull(nearMissReviews.id),
);

export function createNearMisses(db: Db, { now }: { now: () => Date }) {
  async function review(sightingId: string, verdict: NearMissVerdict) {
    const at = now();
    await db.transaction(async (tx) => {
      const [nearMiss] = await tx
        .select()
        .from(sightings)
        .leftJoin(nearMissReviews, eq(nearMissReviews.sightingId, sightings.id))
        .where(and(eq(sightings.id, sightingId), waitingForVerdict));
      if (!nearMiss) throw new NearMissError("This entry is no longer a Near Miss waiting for a verdict.");
      const { payload, nearestLane, oneLiner } = nearMiss.sightings;

      const inserted = await tx
        .insert(nearMissReviews)
        .values({ sightingId, verdict, reviewedAt: at })
        .onConflictDoNothing()
        .returning({ id: nearMissReviews.id });
      if (!inserted.length) throw new NearMissError("This Near Miss already has a verdict.");

      if (verdict === "Pulled In") {
        // Claude's record on the Sighting stays; the review says the Owner overruled it.
        await putOnRadar(tx, {
          sightingId,
          sighting: payload!,
          placement: { lane: nearestLane!, secondaryLane: null, oneLiner: oneLiner ?? "", priority: PULLED_IN_PRIORITY },
          at,
        });
      }
    });
  }

  return {
    // The week's closest discards, closest first, at most five.
    async list(): Promise<NearMiss[]> {
      const since = new Date(now().getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ sighting: sightings })
        .from(sightings)
        .leftJoin(nearMissReviews, eq(nearMissReviews.sightingId, sightings.id))
        .where(and(waitingForVerdict, gte(sightings.closeness, MIN_CLOSENESS), gte(sightings.screenedAt, since)))
        .orderBy(desc(sightings.closeness), desc(sightings.publishedOn))
        .limit(SHOWN);
      return rows.map(({ sighting: s }) => ({
        sightingId: s.id,
        name: s.payload!.legalEntity.name,
        nearestLane: s.nearestLane!,
        closeness: s.closeness!,
        oneLiner: s.oneLiner ?? "",
        reason: s.screeningReason ?? "",
        publishedOn: s.publishedOn,
        url: s.url,
        registration: registrationText(s.payload!),
      }));
    },

    // Screening should have kept it: it becomes a Candidate for this week's Triage.
    pullIn: (sightingId: string) => review(sightingId, "Pulled In"),

    // Screening was right to discard it.
    rightlyOut: (sightingId: string) => review(sightingId, "Rightly Out"),

    // Every verdict, newest first, with what Claude said: evidence for Proposals to the Screening Criteria.
    async reviewed(): Promise<NearMissReview[]> {
      const rows = await db
        .select()
        .from(nearMissReviews)
        .innerJoin(sightings, eq(sightings.id, nearMissReviews.sightingId))
        .orderBy(desc(nearMissReviews.reviewedAt));
      return rows.map(({ near_miss_reviews: r, sightings: s }) => ({
        name: s.payload!.legalEntity.name,
        verdict: r.verdict,
        reviewedOn: r.reviewedAt.toISOString().slice(0, 10),
        nearestLane: s.nearestLane!,
        closeness: s.closeness!,
        reason: s.screeningReason ?? "",
        criteriaVersion: s.criteriaVersion!,
      }));
    },
  };
}
