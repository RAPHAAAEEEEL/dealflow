import { asc, eq, gte, isNull, max, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { llmUsage, sightings } from "@/db/schema";
import { putOnRadar, type ScreeningStamp } from "@/radar/radar";
import { stageRuleRejects } from "@/screening/stage-rule";
import { JudgeError, type Criteria, type Judge, type Judgement, type Usage } from "@/screening/types";
import type { Sighting } from "@/sighting";

export type ShabJobDeps = {
  db: Db;
  shab: { fetchSightings(date: string): Promise<Sighting[]> };
  judge: Judge;
  criteria: Criteria;
  monthlyCapUsd: number;
  now: () => Date;
};

export type ShabJobReport = {
  fetched: number;
  candidates: number;
  discarded: number;
  waitingForBudget: number;
  failed: number;
  errors: string[];
  spentUsd: number;
};

// Fetches one day's new entries, then screens every Sighting still waiting, including ones an
// earlier run left behind because the month's budget was used up (docs/adr/0005).
export async function runShabJob(deps: ShabJobDeps, date: string): Promise<ShabJobReport> {
  const { db, judge, criteria } = deps;
  const report: ShabJobReport = {
    fetched: 0,
    candidates: 0,
    discarded: 0,
    waitingForBudget: 0,
    failed: 0,
    errors: [],
    spentUsd: 0,
  };
  const stamp = (): ScreeningStamp => ({ screenedAt: deps.now(), criteriaVersion: criteria.version });

  for (const sighting of await deps.shab.fetchSightings(date)) {
    report.fetched++;
    const rejected = stageRuleRejects(sighting);
    const inserted = await db
      .insert(sightings)
      .values({
        source: sighting.source,
        externalId: sighting.externalId,
        publishedOn: sighting.publishedOn,
        url: sighting.url,
        // A Sighting the Stage Rule discards keeps no content: a sole proprietorship's name contains
        // its owner's surname (docs/adr/0003). The row remains so the next run doesn't fetch it again.
        ...(rejected
          ? { payload: null, ...stamp(), screening: "discarded", screeningReason: rejected, screenedBy: "stage-rule" }
          : { payload: sighting }),
      })
      .onConflictDoNothing()
      .returning({ id: sightings.id });
    if (rejected && inserted.length) report.discarded++;
  }

  const budget = await monthlyBudget(deps);
  const waiting = await db
    .select({ id: sightings.id, payload: sightings.payload })
    .from(sightings)
    .where(isNull(sightings.screenedAt))
    .orderBy(asc(sightings.publishedOn), asc(sightings.fetchedAt));

  for (const { id, payload: sighting } of waiting) {
    if (!sighting) continue;
    if (!budget.allows()) {
      report.waitingForBudget++;
      continue;
    }

    const recordCost = async (usage: Usage) => {
      await db.insert(llmUsage).values({ at: deps.now(), purpose: "screening", ...usage });
      budget.spend(usage.costUsd);
      report.spentUsd += usage.costUsd;
    };

    let judgement: Judgement;
    try {
      judgement = await judge.judge(sighting, criteria);
    } catch (error) {
      // A billed call without a usable answer still counts against the cap (docs/adr/0005).
      if (error instanceof JudgeError) await recordCost(error.usage);
      // The Sighting stays unscreened, so the next run tries it again.
      report.failed++;
      report.errors.push(`${sighting.legalEntity.name}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    await recordCost(judgement.usage);

    if (judgement.inLane) {
      await putOnRadar(db, id, sighting, judgement, stamp());
      report.candidates++;
    } else {
      await db
        .update(sightings)
        .set({ ...stamp(), screening: "discarded", screeningReason: judgement.reason, screenedBy: judgement.usage.model })
        .where(eq(sightings.id, id));
      report.discarded++;
    }
  }
  return report;
}

// A call is allowed only if the month's spend plus the priciest call seen so far stays within the cap,
// so a run stops before it overspends rather than after.
async function monthlyBudget({ db, monthlyCapUsd, now }: ShabJobDeps) {
  const t = now();
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const [{ spent }] = await db.select({ spent: sum(llmUsage.costUsd) }).from(llmUsage).where(gte(llmUsage.at, monthStart));
  const [{ priciest }] = await db.select({ priciest: max(llmUsage.costUsd) }).from(llmUsage);
  let spentThisMonth = Number(spent ?? 0);
  let callEstimate = Number(priciest ?? 0);
  return {
    allows: () => spentThisMonth + callEstimate <= monthlyCapUsd,
    spend(costUsd: number) {
      spentThisMonth += costUsd;
      callEstimate = Math.max(callEstimate, costUsd);
    },
  };
}
