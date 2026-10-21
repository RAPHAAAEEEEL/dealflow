import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { dayOf } from "@/dates";
import type { Db } from "@/db";
import { sightings } from "@/db/schema";
import { putOnRadar, type Discovery } from "@/radar/radar";
import { monthlyBudget } from "@/screening/budget";
import { JudgeError, type ArticleJudge, type ArticleMention, type Criteria } from "@/screening/types";
import { articlePayload, type ArticleSighting } from "@/sighting";
import { ARTICLE_SOURCES, FEED_IDS, FEEDS, type FeedId } from "@/sources/feeds";
import type { PageFetcher } from "@/sources/quick-add";
import { recordRun } from "./runs";

export type FeedsJobDeps = {
  db: Db;
  feeds: { fetchSightings(feed: FeedId): Promise<ArticleSighting[]> };
  pages: PageFetcher;
  judge: ArticleJudge;
  criteria: Criteria;
  monthlyCapUsd: number;
  now: () => Date;
};

export type FeedsJobReport = {
  fetched: number;
  new: number;
  screened: number; // articles Claude judged
  candidates: number; // new startups on the radar
  known: number; // Signals for startups the radar already had
  discarded: number; // startups Screening judged out of scope
  waitingForBudget: number;
  failed: number;
  unreadFeeds: string[]; // feeds that couldn't be read, with the reason
  errors: string[]; // articles that couldn't be screened; the next run tries them again
  spentUsd: number;
};

// A recorded run's report. A run that broke off also carries the reason.
export type FeedsRunReport = Partial<FeedsJobReport> & { error?: string };

const ARTICLE_CHARS = 12_000; // an article page's text, navigation included, holds five #Brandneu startups

// Reads the startup news feeds, then screens every article still waiting, including ones an earlier
// run left behind (the budget ran out, or the article page couldn't be read). A feed that can't be read
// doesn't stop the others. Every run is recorded with its report, also one that breaks off.
export async function runFeedsJob(deps: FeedsJobDeps, feedIds: FeedId[] = FEED_IDS): Promise<FeedsJobReport> {
  const report: FeedsJobReport = {
    fetched: 0,
    new: 0,
    screened: 0,
    candidates: 0,
    known: 0,
    discarded: 0,
    waitingForBudget: 0,
    failed: 0,
    unreadFeeds: [],
    errors: [],
    spentUsd: 0,
  };
  const startedAt = deps.now();
  const record = (error?: unknown) =>
    recordRun(deps.db, {
      job: "feeds",
      publicationDate: dayOf(startedAt),
      startedAt,
      finishedAt: deps.now(),
      report: error === undefined ? report : { ...report, error: error instanceof Error ? error.message : String(error) },
    });
  try {
    await readFeeds(deps, feedIds, report);
    await screenArticles(deps, report);
  } catch (error) {
    await record(error).catch(() => {}); // a failing record must not hide the original error
    throw error;
  }
  await record();
  return report;
}

async function readFeeds({ db, feeds }: FeedsJobDeps, feedIds: FeedId[], report: FeedsJobReport) {
  for (const feed of feedIds) {
    let items: ArticleSighting[];
    try {
      items = await feeds.fetchSightings(feed);
    } catch (error) {
      report.unreadFeeds.push(`${FEEDS[feed].label}: ${messageOf(error)}`);
      continue;
    }
    for (const item of items) {
      report.fetched++;
      const inserted = await db
        .insert(sightings)
        .values({ source: item.source, externalId: item.externalId, publishedOn: item.publishedOn, url: item.url, payload: item })
        .onConflictDoNothing()
        .returning({ id: sightings.id });
      report.new += inserted.length;
    }
  }
}

async function screenArticles(deps: FeedsJobDeps, report: FeedsJobReport) {
  const { db, pages, judge, criteria, now } = deps;
  const budget = await monthlyBudget(db, deps);
  const waiting = await db
    .select({ id: sightings.id, payload: sightings.payload })
    .from(sightings)
    .where(and(inArray(sightings.source, ARTICLE_SOURCES), isNull(sightings.screenedAt)))
    .orderBy(asc(sightings.publishedOn), asc(sightings.fetchedAt));

  for (const { id, payload } of waiting) {
    const article = articlePayload(payload);
    if (!budget.allows()) {
      report.waitingForBudget++;
      continue;
    }
    let mentions: ArticleMention[];
    let model: string;
    let refused: boolean;
    try {
      // The page text is only passed to Claude; it is never stored (docs/adr/0009).
      const text = FEEDS[article.feed].readArticle ? (await pages.fetchText(article.url)).slice(0, ARTICLE_CHARS) : article.teaser;
      const judged = await judge.judgeArticle({ source: article.source, title: article.title, text, url: article.url }, criteria);
      await budget.record("screening", judged.usage);
      report.spentUsd += judged.usage.costUsd;
      ({ mentions, refused } = judged);
      model = judged.usage.model;
    } catch (error) {
      // A billed call without a usable answer still counts against the cap (docs/adr/0005).
      if (error instanceof JudgeError) {
        await budget.record("screening", error.usage);
        report.spentUsd += error.usage.costUsd;
      }
      // The article stays unscreened, so the next run tries it again.
      report.failed++;
      report.errors.push(`${article.title}: ${messageOf(error)}`);
      continue;
    }
    report.screened++;

    // All of an article's startups and its screening record land together, or none of them.
    const at = now();
    await db.transaction(async (tx) => {
      for (const m of mentions) {
        if (!m.inLane || !m.lane) {
          report.discarded++;
          continue;
        }
        const { known } = await putOnRadar(tx, {
          sightingId: id,
          discovery: articleDiscovery(article, m, mentions.length),
          placement: { lane: m.lane, secondaryLane: m.secondaryLane, oneLiner: m.oneLiner, priority: m.priority },
          at,
        });
        if (known) report.known++;
        else report.candidates++;
      }
      await tx
        .update(sightings)
        .set({
          screenedAt: at,
          criteriaVersion: criteria.version,
          screenedBy: model,
          screening: mentions.some((m) => m.inLane && m.lane) ? "signal" : "discarded",
          screeningReason: refused
            ? "Claude declined to judge this article."
            : mentions.length
              ? mentions.map((m) => `${m.name}: ${m.reason}`).join(" · ")
              : "Names no startup.",
          mentions: mentions.map(({ name, inLane, lane, closeness, reason }) => ({ name, inLane, lane, closeness, reason })),
          // Publisher text can name founders, so once screened only the link and the facts remain (docs/adr/0003).
          payload: { ...article, title: "", teaser: "" },
        })
        .where(eq(sightings.id, id));
    });
  }
}

// What an article tells the radar about one startup. The Swiss company number a feed gives is meant for
// the article's company, so it only helps find a known startup, and only when the article names just one.
function articleDiscovery(article: ArticleSighting, m: ArticleMention, startupsInArticle: number): Discovery {
  return {
    name: m.name,
    hq: m.city,
    country: m.country,
    stage: m.stage,
    website: m.website,
    firstSeen: article.publishedOn,
    legalEntity: null,
    matchUid: startupsInArticle === 1 ? article.uid : null,
    signal: { date: article.publishedOn, source: article.source, text: m.signal, url: article.url },
  };
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// What may appear in a public CI log: counts only, no names and no error texts.
export function publicFeedsSummary(report: FeedsJobReport): string {
  return [
    `fetched ${report.fetched}`,
    `new ${report.new}`,
    `screened ${report.screened}`,
    `candidates ${report.candidates}`,
    `known ${report.known}`,
    `discarded ${report.discarded}`,
    `waiting for budget ${report.waitingForBudget}`,
    `failed ${report.failed}`,
    `unread feeds ${report.unreadFeeds.length}`,
    `spent $${report.spentUsd.toFixed(4)}`,
  ].join(" · ");
}
