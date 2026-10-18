import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { legalEntities, signals, sightings, startups } from "@/db/schema";
import type { Judgement, Lane } from "@/screening/types";
import type { Sighting } from "@/sighting";

export type Stage = "Pre-round" | "Pre-seed" | "Seed";
export type StartupStatus = "Candidate" | "Track" | "Pass" | "Out of Scope" | "Expired";

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
};

export function createRadar(db: Db) {
  return {
    async list(): Promise<RadarRow[]> {
      const rows = await db.select().from(startups).orderBy(desc(startups.priority), startups.name);
      if (!rows.length) return [];
      const latestFirst = await db
        .select()
        .from(signals)
        .where(inArray(signals.startupId, rows.map((r) => r.id)))
        .orderBy(desc(signals.date));
      return rows.map(({ createdAt, ...startup }) => {
        const s = latestFirst.find((x) => x.startupId === startup.id);
        return { ...startup, latestSignal: s ? { date: s.date, source: s.source, text: s.text } : null };
      });
    },
  };
}

export type ScreeningStamp = { screenedAt: Date; criteriaVersion: number };

// Puts a Sighting that Screening placed in a Lane on the radar. A Legal Entity the radar already knows
// gets the new Signal on its Startup; otherwise a new Candidate is created with its Legal Entity and
// first Signal. The Sighting is marked screened in the same transaction, so if anything fails it stays
// waiting for the next run instead of becoming a Signal without a Startup.
export async function putOnRadar(
  db: Db,
  sightingId: string,
  sighting: Sighting,
  judgement: Extract<Judgement, { inLane: true }>,
  stamp: ScreeningStamp,
) {
  const entity = sighting.legalEntity;
  await db.transaction(async (tx) => {
    const [known] = entity.uid
      ? await tx.select({ startupId: legalEntities.startupId }).from(legalEntities).where(eq(legalEntities.uid, entity.uid))
      : [];
    let startupId = known?.startupId;
    if (!startupId) {
      const [startup] = await tx
        .insert(startups)
        .values({
          name: entity.name,
          lane: judgement.lane,
          secondaryLane: judgement.secondaryLane,
          stage: "Pre-round",
          status: "Candidate",
          priority: judgement.priority,
          hq: entity.seat.replace(/\s*\([A-Z]{2}\)$/, ""),
          country: "CH",
          oneLiner: judgement.oneLiner,
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
      .set({
        ...stamp,
        screening: "signal",
        screeningReason: judgement.reason,
        screenedBy: judgement.usage.model,
        startupId,
      })
      .where(eq(sightings.id, sightingId));
  });
}

function registrationText({ legalEntity: e }: Sighting) {
  const capital = e.capitalChf === null ? "" : ` Share capital CHF ${e.capitalChf.toLocaleString("en-US")}.`;
  return `New registration: ${e.name}, ${e.seat}. Purpose: ${e.purpose || "none given."}${capital}`;
}
