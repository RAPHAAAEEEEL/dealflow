import { asc, eq, gte, isNull, max, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { llmUsage, sightings } from "@/db/schema";
import { putOnRadar } from "@/radar/radar";
import { stageRuleRejects } from "@/screening/stage-rule";
import { assertShabTermsAccepted } from "@/sources/shab-terms";
import { JudgeError, type Criteria, type Judge, type Judgement, type Usage } from "@/screening/types";
import type { Sighting } from "@/sighting";
import { recordRun } from "./runs";

export type ShabJobDeps = {
  db: Db;
  shab: { fetchSightings(date: string): Promise<Sighting[]> };
  judge: Judge;
  criteria: Criteria;
  monthlyCapUsd: number;
  shabTermsAcceptedOn: string | undefined;
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

// A recorded run's report. A run that broke off, or was refused, also carries the reason.
export type ShabRunReport = Partial<ShabJobReport> & { error?: string };

// Fetches one day's new entries, then screens every Sighting still waiting, including ones an
// earlier run left behind because the month's budget was used up (docs/adr/0005). Every run is
// recorded with its report, also one that breaks off or is refused for lack of the SHAB terms,
// before the error is passed on.
export async function runShabJob(deps: ShabJobDeps, date: string): Promise<ShabJobReport> {
  const report: ShabJobReport = {
    fetched: 0,
    candidates: 0,
    discarded: 0,
    waitingForBudget: 0,
    failed: 0,
    errors: [],
    spentUsd: 0,
  };
  const startedAt = deps.now();
  const record = (error?: unknown) =>
    recordRun(deps.db, {
      job: "shab",
      publicationDate: date,
      startedAt,
      finishedAt: deps.now(),
      report: error === undefined ? report : { ...report, error: error instanceof Error ? error.message : String(error) },
    });
  try {
    assertShabTermsAccepted(deps.shabTermsAcceptedOn, startedAt);
    await screenDay(deps, date, report);
  } catch (error) {
    await record(error).catch(() => {}); // a failing record must not hide the original error
    throw error;
  }
  await record();
  return report;
}

async function screenDay(deps: ShabJobDeps, date: string, report: ShabJobReport) {
  const { db, judge, criteria } = deps;
  const stamp = () => ({ screenedAt: deps.now(), criteriaVersion: criteria.version });

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

    const screened = { ...stamp(), screeningReason: judgement.reason, screenedBy: judgement.usage.model };
    if (judgement.inLane) {
      await putOnRadar(db, { sightingId: id, sighting, placement: judgement, at: screened.screenedAt, screening: screened });
      report.candidates++;
    } else {
      const { nearestLane, closeness, oneLiner } = judgement;
      await db
        .update(sightings)
        .set({ ...screened, screening: "discarded", nearestLane, closeness, oneLiner })
        .where(eq(sightings.id, id));
      report.discarded++;
    }
  }
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

// What may appear in a public CI log: counts only, no names and no error texts.
export function publicSummary(report: ShabJobReport): string {
  return [
    `fetched ${report.fetched}`,
    `candidates ${report.candidates}`,
    `discarded ${report.discarded}`,
    `waiting for budget ${report.waitingForBudget}`,
    `failed ${report.failed}`,
    `spent $${report.spentUsd.toFixed(4)}`,
  ].join(" · ");
}
