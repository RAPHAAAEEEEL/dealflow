import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/db";
import { createRadar } from "@/radar/radar";
import { fakeJudge, inLane, outOfScope, usageCosting } from "@/screening/judge.testing";
import { JudgeError, type Judge } from "@/screening/types";
import { createShabSource } from "@/sources/shab";
import { exampleEntry, fakeShabHttp, type FakeRegistration } from "@/sources/shab.testing";
import { runShabJob } from "./shab-job";

const criteria = { version: 1, text: "Lane definitions for the test." };

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

function run(days: Record<string, FakeRegistration[]>, date: string, judge: Judge, opts: { monthlyCapUsd?: number; now?: string } = {}) {
  return runShabJob(
    {
      db,
      shab: createShabSource(fakeShabHttp(days)),
      judge,
      criteria,
      monthlyCapUsd: opts.monthlyCapUsd ?? 10,
      now: () => new Date(opts.now ?? "2026-10-17T06:00:00Z"),
    },
    date,
  );
}

const radarNames = async () => (await createRadar(db).list()).map((r) => r.name).sort();

describe("SHAB job", () => {
  test("puts a new entry that fits a Lane on the radar as a Candidate", async () => {
    const judge = fakeJudge({
      byName: { "Beispiel Robotik AG": inLane("robotics", 82, "Robots that lay rebar on construction sites.") },
    });

    await run({ "2026-10-16": [exampleEntry] }, "2026-10-16", judge);

    expect(await createRadar(db).list()).toEqual([
      {
        id: expect.any(String),
        name: "Beispiel Robotik AG",
        lane: "robotics",
        secondaryLane: null,
        stage: "Pre-round",
        status: "Candidate",
        priority: 82,
        hq: "Zürich",
        country: "CH",
        firstSeen: "2026-10-16",
        oneLiner: "Robots that lay rebar on construction sites.",
        latestSignal: {
          date: "2026-10-16",
          source: "SHAB",
          text: "New registration: Beispiel Robotik AG, Zürich (ZH). Purpose: Entwicklung und Vertrieb von Robotern, die auf Baustellen Bewehrungseisen verlegen. Share capital CHF 100,000.",
        },
      },
    ]);
  });

  test("discards an entry that is not an AG or GmbH for free, whatever Claude would say", async () => {
    const soleProprietorship = { ...exampleEntry, id: "pub-sole", name: "Robotik Werkstatt Beispiel", legalFormCode: "0101" };
    const acceptsEverything = fakeJudge({ otherwise: inLane("robotics", 90, "Anything.") });

    const report = await run({ "2026-10-16": [soleProprietorship] }, "2026-10-16", acceptsEverything);

    expect({ radar: await radarNames(), spentUsd: report.spentUsd }).toEqual({ radar: [], spentUsd: 0 });
  });

  test("keeps an entry that Screening judges out of scope off the radar", async () => {
    const trader = { ...exampleEntry, id: "pub-trader", name: "Beispiel Handels GmbH", legalFormCode: "0107" };
    const judge = fakeJudge({ byName: { "Beispiel Handels GmbH": outOfScope("Trading company.") } });

    await run({ "2026-10-16": [trader] }, "2026-10-16", judge);

    expect(await radarNames()).toEqual([]);
  });

  test("adds nothing new when the same day runs twice", async () => {
    const judge = fakeJudge({ byName: { "Beispiel Robotik AG": inLane("robotics", 82, "Rebar robots.") } });

    await run({ "2026-10-16": [exampleEntry] }, "2026-10-16", judge);
    const second = await run({ "2026-10-16": [exampleEntry] }, "2026-10-16", judge);

    expect({ onRadar: await radarNames(), spentOnSecondRun: second.spentUsd }).toEqual({
      onRadar: ["Beispiel Robotik AG"],
      spentOnSecondRun: 0,
    });
  });

  test("adds a later entry for a known Legal Entity to its Startup instead of creating a second one", async () => {
    const judge = fakeJudge({ otherwise: inLane("robotics", 82, "Rebar robots.") });
    const correction = { ...exampleEntry, id: "pub-robotik-correction" };
    const days = { "2026-10-16": [exampleEntry], "2026-10-20": [correction] };

    await run(days, "2026-10-16", judge);
    await run(days, "2026-10-20", judge);

    expect((await createRadar(db).list()).map((r) => [r.name, r.latestSignal?.date])).toEqual([["Beispiel Robotik AG", "2026-10-20"]]);
  });

  test("leaves an entry waiting when Claude fails on it, and carries on with the rest", async () => {
    const flaky = { ...exampleEntry, id: "pub-flaky", name: "Beispiel Wackel AG", uid: "CHE-100.000.020" };
    const good = fakeJudge({ otherwise: inLane("robotics", 70, "Robots.") });
    const failsOnFlaky: Judge = {
      judge: (s, c) => (s.legalEntity.name === "Beispiel Wackel AG" ? Promise.reject(new Error("overloaded")) : good.judge(s, c)),
    };

    const first = await run({ "2026-10-16": [flaky, exampleEntry] }, "2026-10-16", failsOnFlaky);
    await run({ "2026-10-16": [flaky, exampleEntry] }, "2026-10-16", good);

    expect({ failedFirstTime: first.failed, onRadar: await radarNames() }).toEqual({
      failedFirstTime: 1,
      onRadar: ["Beispiel Robotik AG", "Beispiel Wackel AG"],
    });
  });

  describe("monthly budget", () => {
    const three = ["a", "b", "c"].map((k, i) => ({ ...exampleEntry, id: `pub-${k}`, name: `Beispiel ${k} AG`, uid: `CHE-100.000.01${i}` }));
    const judge = fakeJudge({ otherwise: inLane("robotics", 70, "Robots."), costUsd: 0.004 });

    test("never starts a Claude call that would push the month over the cap", async () => {
      const report = await run({ "2026-10-16": three }, "2026-10-16", judge, { monthlyCapUsd: 0.01 });

      expect({ onRadar: (await radarNames()).length, waiting: report.waitingForBudget }).toEqual({ onRadar: 2, waiting: 1 });
    });

    test("counts a billed Claude call against the cap even when its answer was unusable", async () => {
      const unreadable: Judge = { judge: () => Promise.reject(new JudgeError("No readable answer", usageCosting(0.004))) };

      const report = await run({ "2026-10-16": three }, "2026-10-16", unreadable, { monthlyCapUsd: 0.01 });

      expect({ failed: report.failed, waiting: report.waitingForBudget, spentUsd: report.spentUsd }).toEqual({
        failed: 2,
        waiting: 1,
        spentUsd: 0.008,
      });
    });

    test("screens what was left waiting once the next month's budget is available", async () => {
      await run({ "2026-10-16": three }, "2026-10-16", judge, { monthlyCapUsd: 0.01, now: "2026-10-17T06:00:00Z" });
      await run({}, "2026-11-02", judge, { monthlyCapUsd: 0.01, now: "2026-11-03T06:00:00Z" });

      expect(await radarNames()).toEqual(["Beispiel a AG", "Beispiel b AG", "Beispiel c AG"]);
    });
  });
});
