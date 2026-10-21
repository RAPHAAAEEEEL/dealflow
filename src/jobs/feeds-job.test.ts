import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/db";
import { createRadar } from "@/radar/radar";
import { fakeArticleJudge, fakeJudge, inLane, mention } from "@/screening/judge.testing";
import type { ArticleJudge } from "@/screening/types";
import { createFeedSource, FEEDS, type FeedId } from "@/sources/feeds";
import { atomFeed, fakeFeedHttp, rssFeed, type AtomEntry, type RssItem } from "@/sources/feeds.testing";
import { fakePages } from "@/sources/quick-add.testing";
import { exampleEntry } from "@/sources/shab.testing";
import { runFeedsJob } from "./feeds-job";
import { latestRuns } from "./runs";
import { entryNamed, runShabDay } from "./shab-job.testing";

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

const NOW = "2026-10-21T06:00:00Z";

// An invented #Brandneu post: the feed only names the startups, the article page describes them.
const brandneu = (n: number, names: string): RssItem => ({
  title: `#Brandneu – neue Startups: ${names}`,
  link: `https://news.example/2026/10/brandneu-${n}/`,
  guid: `https://news.example/?p=${n}`,
  pubDate: "Tue, 20 Oct 2026 11:55:00 +0000",
  description: `Wir präsentieren frische Startups: ${names}.`,
});

const tickerEntry = (title: string, overrides: Partial<AtomEntry> = {}): AtomEntry => ({
  title,
  link: `https://ticker.example/en/news/${encodeURIComponent(title)}`,
  id: `https://ticker.example/en/news/${encodeURIComponent(title)}`,
  published: "2026-10-19CEST09:00:00+02:00",
  summary: `${title}, in a short teaser.`,
  ...overrides,
});

type Feeds = Partial<Record<FeedId, string>>;

function run(
  feeds: Feeds,
  { judge = fakeArticleJudge().judge, pages = fakePages().fetcher, monthlyCapUsd = 10, now = NOW }: { judge?: ArticleJudge; pages?: ReturnType<typeof fakePages>["fetcher"]; monthlyCapUsd?: number; now?: string } = {},
) {
  const http = fakeFeedHttp(Object.fromEntries(Object.entries(feeds).map(([id, body]) => [FEEDS[id as FeedId].url, body!])));
  return runFeedsJob(
    { db, feeds: createFeedSource(http), pages, judge, criteria: { version: 2, text: "Lanes." }, monthlyCapUsd, now: () => new Date(now) },
    Object.keys(feeds) as FeedId[],
  );
}

describe("Feeds job", () => {
  test("puts the startups an article reports on the radar, with the article as the Signal's source", async () => {
    const { judge } = fakeArticleJudge({
      byTitle: {
        "Beispiel Labor raises a pre-seed round": [
          mention("Beispiel Labor", "manufacturing", {
            country: "CH",
            city: "Basel",
            stage: "Pre-seed",
            priority: 80,
            oneLiner: "A self-driving lab for battery materials.",
            signal: "Raised a pre-seed round to build its first lab.",
          }),
        ],
      },
    });

    await run({ startupticker: atomFeed([tickerEntry("Beispiel Labor raises a pre-seed round")]) }, { judge });

    expect(await createRadar(db).list()).toMatchObject([
      {
        name: "Beispiel Labor",
        lane: "manufacturing",
        stage: "Pre-seed",
        status: "Candidate",
        priority: 80,
        hq: "Basel",
        country: "CH",
        firstSeen: "2026-10-19",
        oneLiner: "A self-driving lab for battery materials.",
        latestSignal: {
          date: "2026-10-19",
          source: "startupticker.ch",
          text: "Raised a pre-seed round to build its first lab.",
          url: "https://ticker.example/en/news/Beispiel%20Labor%20raises%20a%20pre-seed%20round",
        },
      },
    ]);
  });

  test("reads the article page when the feed only names the startups, and the teaser otherwise", async () => {
    const { judge, texts } = fakeArticleJudge();
    const { fetcher, fetched } = fakePages({ "https://news.example/2026/10/brandneu-1/": "Beispiel Kran aus Berlin baut Kranroboter." });

    await run(
      {
        "deutsche-startups": rssFeed([brandneu(1, "Beispiel Kran, Beispiel Prüf")]),
        startupticker: atomFeed([tickerEntry("Beispiel Labor launches")]),
      },
      { judge, pages: fetcher },
    );

    expect({ fetched, texts }).toEqual({
      fetched: ["https://news.example/2026/10/brandneu-1/"],
      // Oldest article first: the ticker's is from 19 October, the #Brandneu post from the 20th.
      texts: ["Beispiel Labor launches, in a short teaser.", "Beispiel Kran aus Berlin baut Kranroboter."],
    });
  });

  test("keeps startups that Screening judges out of scope off the radar", async () => {
    const { judge } = fakeArticleJudge({
      byTitle: {
        "#Brandneu – neue Startups: Beispiel Kran, Beispiel Shop, Beispiel Agentur": [
          mention("Beispiel Kran", "robotics"),
          mention("Beispiel Shop", null),
          mention("Beispiel Agentur", "agents", { inLane: false, closeness: 60, reason: "An agency building for clients." }),
        ],
      },
    });
    const { fetcher } = fakePages({ "https://news.example/2026/10/brandneu-1/": "Drei neue Startups." });

    const report = await run({ "deutsche-startups": rssFeed([brandneu(1, "Beispiel Kran, Beispiel Shop, Beispiel Agentur")]) }, { judge, pages: fetcher });

    expect({ radar: (await createRadar(db).list()).map((r) => r.name), candidates: report.candidates, discarded: report.discarded }).toEqual({
      radar: ["Beispiel Kran"],
      candidates: 1,
      discarded: 2,
    });
  });

  test("gives a startup the radar already knows a new Signal, matched by its name or its Swiss company number", async () => {
    await runShabDay(db, "2026-10-16", {
      entries: [exampleEntry, entryNamed("Beispiel Kran AG")],
      judge: fakeJudge({ otherwise: inLane("robotics", 70, "Robots.") }),
    });
    const { judge } = fakeArticleJudge({
      byTitle: {
        "Rebar robots raise a seed round": [mention("RebarBot", "robotics", { signal: "Raised a seed round." })],
        "#Brandneu – neue Startups: Beispiel Kran": [mention("Beispiel Kran", "robotics", { signal: "Presented as a new startup." })],
      },
    });
    const { fetcher } = fakePages({ "https://news.example/2026/10/brandneu-1/": "Beispiel Kran baut Kranroboter." });

    const report = await run(
      {
        // The ticker names the company by its brand, but gives the register's company number.
        startupticker: atomFeed([tickerEntry("Rebar robots raise a seed round", { cuid: exampleEntry.uid })]),
        "deutsche-startups": rssFeed([brandneu(1, "Beispiel Kran")]),
      },
      { judge, pages: fetcher },
    );

    const rows = await createRadar(db).list();
    expect({
      known: report.known,
      radar: rows.map((r) => [r.name, r.latestSignal?.source, r.latestSignal?.text]).sort(),
    }).toEqual({
      known: 2,
      radar: [
        ["Beispiel Kran AG", "deutsche-startups.de", "Presented as a new startup."],
        ["Beispiel Robotik AG", "startupticker.ch", "Raised a seed round."],
      ],
    });
  });

  test("reads each article only once", async () => {
    const feeds = { startupticker: atomFeed([tickerEntry("Beispiel Labor launches")]) };

    await run(feeds);
    const second = await run(feeds);

    expect({ new: second.new, spentUsd: second.spentUsd }).toEqual({ new: 0, spentUsd: 0 });
  });

  test("leaves an article waiting when its page can't be read, and carries on with the rest", async () => {
    const feeds = { "deutsche-startups": rssFeed([brandneu(1, "Beispiel Kran"), brandneu(2, "Beispiel Prüf")]) };
    const { judge } = fakeArticleJudge({
      byTitle: {
        "#Brandneu – neue Startups: Beispiel Kran": [mention("Beispiel Kran", "robotics")],
        "#Brandneu – neue Startups: Beispiel Prüf": [mention("Beispiel Prüf", "agents")],
      },
    });
    const onlyFirst = fakePages({ "https://news.example/2026/10/brandneu-1/": "Beispiel Kran baut Kranroboter." }).fetcher;
    const both = fakePages({
      "https://news.example/2026/10/brandneu-1/": "Beispiel Kran baut Kranroboter.",
      "https://news.example/2026/10/brandneu-2/": "Beispiel Prüf prüft KI-Agenten.",
    }).fetcher;

    const first = await run(feeds, { judge, pages: onlyFirst });
    await run(feeds, { judge, pages: both });

    expect({ failedFirstTime: first.failed, radar: (await createRadar(db).list()).map((r) => r.name).sort() }).toEqual({
      failedFirstTime: 1,
      radar: ["Beispiel Kran", "Beispiel Prüf"],
    });
  });

  test("goes on with the other feeds when one can't be read, and records the run", async () => {
    const http = fakeFeedHttp({ [FEEDS.startupticker.url]: atomFeed([tickerEntry("Beispiel Labor launches")]) });

    await runFeedsJob(
      {
        db,
        feeds: createFeedSource(http),
        pages: fakePages().fetcher,
        judge: fakeArticleJudge().judge,
        criteria: { version: 2, text: "Lanes." },
        monthlyCapUsd: 10,
        now: () => new Date(NOW),
      },
      ["eu-startups-de", "startupticker"],
    );

    expect(await latestRuns(db)).toMatchObject([
      {
        job: "feeds",
        publicationDate: "2026-10-21",
        report: { fetched: 1, new: 1, failed: 0, unreadFeeds: [`EU-Startups: fetch failed for ${FEEDS["eu-startups-de"].url}`] },
      },
    ]);
  });

  test("never starts a Claude call that would push the month over the cap", async () => {
    const { judge } = fakeArticleJudge({ costUsd: 0.001 });

    const report = await run(
      { startupticker: atomFeed([tickerEntry("Beispiel A launches"), tickerEntry("Beispiel B launches")]) },
      { judge, monthlyCapUsd: 0.0015 },
    );

    expect({ screened: report.screened, waiting: report.waitingForBudget }).toEqual({ screened: 1, waiting: 1 });
  });
});
