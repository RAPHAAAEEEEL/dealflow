import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/db";
import { runFeedsJob } from "@/jobs/feeds-job";
import { entryNamed as entry, runShabDay } from "@/jobs/shab-job.testing";
import { fakeArticleJudge, fakeJudge, inLane, nearMiss, outOfScope } from "@/screening/judge.testing";
import type { Judge } from "@/screening/types";
import { createFeedSource, FEEDS, type FeedId } from "@/sources/feeds";
import { fakeFeedHttp } from "@/sources/feeds.testing";
import { fakePages } from "@/sources/quick-add.testing";
import type { ShabHttp } from "@/sources/shab";
import { buildDigest } from "./digest";

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

const SUNDAY = "2026-10-18T17:00:00Z";
const WEEK = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]; // Mon to Fri

const shabDown: ShabHttp = {
  fetchNewRegistrations: () => Promise.reject(new Error("SHAB answered 503")),
  fetchPublicationXml: () => Promise.reject(new Error("not reached")),
};

// A SHAB run, the morning after the register day, as scheduled.
const runDay = (date: string, opts: Parameters<typeof runShabDay>[2] = {}) => runShabDay(db, date, opts);

// A run that breaks off because SHAB is down. It is recorded with the reason before the error passes on.
const brokenDay = (date: string) => runShabDay(db, date, { http: shabDown }).catch(() => {});

// A feeds run at `at`. Feeds the fake doesn't serve count as unreadable.
const feedsRun = (at: string, feeds: FeedId[] = []) =>
  runFeedsJob(
    {
      db,
      feeds: createFeedSource(fakeFeedHttp({})),
      pages: fakePages().fetcher,
      judge: fakeArticleJudge().judge,
      criteria: { version: 2, text: "Lanes." },
      monthlyCapUsd: 10,
      now: () => new Date(at),
    },
    feeds,
  );

const digest = (opts: { monthlyCapUsd?: number; shabTermsAcceptedOn?: string } = {}) =>
  buildDigest({
    db,
    now: () => new Date(SUNDAY),
    monthlyCapUsd: opts.monthlyCapUsd ?? 10,
    shabTermsAcceptedOn: opts.shabTermsAcceptedOn ?? "2026-10-17",
    appUrl: "https://dealflow.example",
  });

describe("Sunday digest", () => {
  beforeEach(() => feedsRun("2026-10-18T06:00:00Z"));

  test("brings the waiting Candidates, the week's Near Misses and a clean status check", async () => {
    for (const date of WEEK) {
      const entries = date === "2026-10-14" ? [entry("Beispiel Kran AG"), entry("Beispiel Prüf AG"), entry("Beispiel Treuhand AG")] : [];
      const judge = fakeJudge({
        byName: {
          "Beispiel Kran AG": inLane("robotics", 90, "Crane robots."),
          "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents for banks."),
          "Beispiel Treuhand AG": outOfScope("Accounting services."),
        },
        costUsd: 0.01,
      });
      await runDay(date, { entries, judge });
    }

    expect(await digest()).toEqual({
      subject: "Dealflow: 1 Candidate, 1 Near Miss · all clear",
      warnings: 0,
      text: `Dealflow · week to Sun 18 Oct 2026

TRIAGE
1 Candidate waiting: https://dealflow.example/feed
- Beispiel Kran AG · Specialised Robotics · Priority 90
  Crane robots.

NEAR MISSES
Discarded, but close to a Lane. In the Feed, pull one into Triage or confirm it was rightly out.
- Beispiel Prüf AG · nearest Enterprise Agents · closeness 70
  Audits AI agents for banks.
  Out because: Close to agents, but out.

STATUS CHECK
✓ SHAB: every register day screened, Mon 12 Oct to Fri 16 Oct
✓ Feeds: read on Sun 18 Oct
✓ Nothing waiting for screening
✓ Claude spend in October: $0.03 of $10.00
✓ SHAB terms accepted on 2026-10-17, run out on 2027-01-15 (in 89 days)

Register data from SHAB, the Swiss Official Gazette of Commerce (Amtsblattportal), www.shab.ch. Not an official publication.
`,
    });
  });

  test("says so when there is nothing to triage", async () => {
    for (const date of WEEK) await runDay(date);

    const { subject, text } = await digest();

    expect({ subject, text }).toMatchObject({
      subject: "Dealflow: 0 Candidates, 0 Near Misses · all clear",
      text: expect.stringContaining("TRIAGE\nNo Candidates waiting.\n\nNEAR MISSES\nNone this week.\n"),
    });
  });

  test("flags a register day whose run broke off, with the reason", async () => {
    for (const date of WEEK) await (date === "2026-10-15" ? brokenDay(date) : runDay(date));

    const { subject, warnings, text } = await digest();

    expect({ subject, warnings }).toEqual({ subject: "Dealflow: 0 Candidates, 0 Near Misses · 1 warning", warnings: 1 });
    expect(text).toContain("⚠ SHAB Thu 15 Oct: the run broke off (SHAB answered 503). Run it again in GitHub Actions with the date 2026-10-15.\n");
  });

  test("counts a day as screened once a later run for it went through", async () => {
    for (const date of WEEK) await (date === "2026-10-15" ? brokenDay(date) : runDay(date));
    await runDay("2026-10-15", { at: "2026-10-16T09:00:00Z" });

    expect((await digest()).warnings).toBe(0);
  });

  test("names lapsed SHAB terms as the reason a day wasn't screened", async () => {
    for (const date of WEEK.slice(0, 4)) await runDay(date);
    await runDay("2026-10-16", { shabTermsAcceptedOn: "2026-07-19" }).catch(() => {}); // refused on 2026-10-17

    expect((await digest({ shabTermsAcceptedOn: "2026-07-19" })).text).toContain(
      "⚠ SHAB Fri 16 Oct: the run broke off (The SHAB terms, accepted on 2026-07-19, ran out on 2026-10-17). Run it again in GitHub Actions with the date 2026-10-16.\n",
    );
  });

  test("flags a register day without a run", async () => {
    for (const date of WEEK) if (date !== "2026-10-13") await runDay(date);

    const { warnings, text } = await digest();

    expect({ warnings, text }).toMatchObject({ warnings: 1, text: expect.stringContaining("⚠ SHAB Tue 13 Oct: no run.\n") });
    expect(text).not.toContain("GitHub stops");
  });

  test("points to GitHub's schedule stop when the last two register days have no run", async () => {
    for (const date of WEEK.slice(0, 3)) await runDay(date);

    const { warnings, text } = await digest();

    expect(warnings).toBe(2);
    expect(text).toContain(
      "⚠ SHAB Thu 15 Oct: no run.\n⚠ SHAB Fri 16 Oct: no run.\n  GitHub stops scheduled workflows after 60 days without activity in the repository. Check Actions → SHAB job, and enable it again if it says disabled.\n",
    );
  });

  test("counts entries still waiting for screening, with the latest error", async () => {
    const keyRejected: Judge = { judge: () => Promise.reject(new Error("401 invalid x-api-key")) };
    for (const date of WEEK) {
      await runDay(date, date === "2026-10-16" ? { entries: [entry("Beispiel A AG"), entry("Beispiel B AG")], judge: keyRejected } : {});
    }

    const { warnings, text } = await digest();

    expect(warnings).toBe(1);
    expect(text).toContain("⚠ 2 entries wait for screening. Latest error: Beispiel B AG: 401 invalid x-api-key\n");
  });

  test("warns when the month's Claude spend reaches 80% of the cap", async () => {
    for (const date of WEEK) {
      const entries = date === "2026-10-16" ? [entry("Beispiel A AG"), entry("Beispiel B AG")] : [];
      await runDay(date, { entries, judge: fakeJudge({ costUsd: 0.004 }) });
    }

    const { warnings, text } = await digest({ monthlyCapUsd: 0.01 });

    expect(warnings).toBe(1);
    expect(text).toContain(
      "⚠ Claude spend in October: $0.01 of $0.01, 80% of the cap. Screening stops at the cap; what waits is screened next month.\n",
    );
  });

  test.each([
    ["2026-08-04", "✓ SHAB terms accepted on 2026-08-04, run out on 2026-11-02 (in 15 days)"],
    ["2026-08-03", "⚠ SHAB terms accepted on 2026-08-03, run out on 2026-11-01 (in 14 days). Read and accept them again on www.shab.ch, then run the setup wizard: ONLY=2"],
    ["2026-07-01", "⚠ SHAB terms ran out on 2026-09-29. SHAB runs refuse to start until you accept them again on www.shab.ch and run the setup wizard: ONLY=2"],
    ["", "⚠ SHAB terms: no acceptance date set. SHAB runs refuse to start until you accept them on www.shab.ch and run the setup wizard: ONLY=2"],
  ])("reminds to accept the SHAB terms again from 14 days before they run out (accepted on '%s')", async (acceptedOn, line) => {
    for (const date of WEEK) await runDay(date);

    expect((await digest({ shabTermsAcceptedOn: acceptedOn })).text).toContain(`${line}\n`);
  });
});

describe("Feeds in the Status Check", () => {
  beforeEach(async () => {
    for (const date of WEEK) await runDay(date);
  });

  test("warns before the feeds have ever run", async () => {
    expect((await digest()).text).toContain("⚠ Feeds: no run yet. Check Actions → Feeds job.\n");
  });

  test("warns when the feeds haven't run for two days", async () => {
    await feedsRun("2026-10-15T06:00:00Z");

    expect((await digest()).text).toContain(
      "⚠ Feeds: no run since Thu 15 Oct. GitHub stops scheduled workflows after 60 days without activity in the repository; check Actions → Feeds job.\n",
    );
  });

  test("names a feed that couldn't be read", async () => {
    await feedsRun("2026-10-18T06:00:00Z", ["eu-startups-de"]);

    const { warnings, text } = await digest();

    expect({ warnings, text }).toMatchObject({
      warnings: 1,
      text: expect.stringContaining(`⚠ Feeds: couldn't read EU-Startups: fetch failed for ${FEEDS["eu-startups-de"].url}\n`),
    });
  });
});
