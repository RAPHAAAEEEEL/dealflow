import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/db";
import { entryNamed, runShabDay } from "@/jobs/shab-job.testing";
import { createRadar } from "@/radar/radar";
import { fakeJudge, inLane, nearMiss, outOfScope } from "@/screening/judge.testing";
import { createNearMisses, NearMissError } from "./near-misses";
import { createTriage } from "./triage";

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

// Screens the named entries in one SHAB run at `screenedAt`, judged as `byName` says.
async function screen(byName: NonNullable<Parameters<typeof fakeJudge>[0]>["byName"], screenedAt = "2026-10-16T05:30:00Z") {
  const date = screenedAt.slice(0, 10);
  const entries = Object.keys(byName ?? {}).map(entryNamed);
  await runShabDay(db, date, { entries, judge: fakeJudge({ byName }), at: screenedAt, criteriaVersion: 2 });
}

const nearMissesOn = (isoDate: string) => createNearMisses(db, { now: () => new Date(isoDate) });
const SUNDAY = "2026-10-18T17:00:00Z";

describe("Near Misses", () => {
  test("shows the week's five closest discards, closest first", async () => {
    const closeness = { "Beispiel A AG": 30, "Beispiel B AG": 90, "Beispiel C AG": 55, "Beispiel D AG": 20, "Beispiel E AG": 75, "Beispiel F AG": 40 };
    await screen(Object.fromEntries(Object.entries(closeness).map(([name, c]) => [name, nearMiss("agents", c, `${name} tests AI agents.`)])));

    const shown = await nearMissesOn(SUNDAY).list();

    expect(shown.map((m) => [m.name, m.closeness])).toEqual([
      ["Beispiel B AG", 90],
      ["Beispiel E AG", 75],
      ["Beispiel C AG", 55],
      ["Beispiel F AG", 40],
      ["Beispiel A AG", 30],
    ]);
  });

  test("shows what the Owner needs to decide on one", async () => {
    await screen({ "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents for banks.") });

    expect(await nearMissesOn(SUNDAY).list()).toEqual([
      {
        sightingId: expect.any(String),
        name: "Beispiel Prüf AG",
        nearestLane: "agents",
        closeness: 70,
        oneLiner: "Audits AI agents for banks.",
        reason: "Close to agents, but out.",
        publishedOn: "2026-10-16",
        registration: expect.stringMatching(/^New registration: Beispiel Prüf AG, Zürich \(ZH\)\. Purpose: /),
      },
    ]);
  });

  test("leaves out discards below 20, ones nowhere near a Lane, and ones older than a week", async () => {
    await screen({ "Beispiel Alt AG": nearMiss("robotics", 80, "Old news.") }, "2026-10-10T05:30:00Z");
    await screen({
      "Beispiel Fern AG": nearMiss("robotics", 15, "Sells garden tools."),
      "Beispiel Treuhand AG": outOfScope("Accounting services."),
      "Beispiel Nah AG": nearMiss("robotics", 20, "Builds inspection rigs for others."),
    });

    expect((await nearMissesOn(SUNDAY).list()).map((m) => m.name)).toEqual(["Beispiel Nah AG"]);
  });

  test("leaves out a discarded entry of a startup the radar already has, since it already had its Triage", async () => {
    const kran = entryNamed("Beispiel Kran AG");
    const days = { "2026-10-12": [kran], "2026-10-15": [{ ...kran, id: "pub-kran-correction" }] };
    await runShabDay(db, "2026-10-12", { days, judge: fakeJudge({ otherwise: inLane("robotics", 90, "Crane robots.") }) });
    await runShabDay(db, "2026-10-15", { days, judge: fakeJudge({ otherwise: nearMiss("robotics", 60, "Cranes again.") }) });

    expect(await nearMissesOn(SUNDAY).list()).toEqual([]);
  });

  test("pulling one into Triage makes it a Candidate at the front of the queue", async () => {
    await screen({
      "Beispiel Kran AG": inLane("robotics", 90, "Crane robots."),
      "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents for banks."),
    });
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();

    await nearMisses.decide(prüf.sightingId, "Pulled In");

    const queue = await createTriage(db, { now: () => new Date(SUNDAY) }).queue();
    expect({
      queue: queue.map((c) => [c.name, c.lane, c.oneLiner, c.status]),
      nearMisses: await nearMisses.list(),
    }).toEqual({
      queue: [
        ["Beispiel Prüf AG", "agents", "Audits AI agents for banks.", "Candidate"],
        ["Beispiel Kran AG", "robotics", "Crane robots.", "Candidate"],
      ],
      nearMisses: [],
    });
  });

  test("a pulled-in Candidate gets four weeks from the day it was pulled in", async () => {
    await screen({ "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents.") });
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();
    await nearMisses.decide(prüf.sightingId, "Pulled In");

    // 2026-11-14 is four weeks after the run that discarded it, but less than four weeks after the pull-in.
    const queue = await createTriage(db, { now: () => new Date("2026-11-14T09:00:00Z") }).queue();

    expect(queue.map((c) => c.name)).toEqual(["Beispiel Prüf AG"]);
  });

  test("confirming one as rightly out takes it off the list and keeps it off the radar", async () => {
    await screen({ "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents.") });
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();

    await nearMisses.decide(prüf.sightingId, "Rightly Out");

    expect({ nearMisses: await nearMisses.list(), radar: await createRadar(db).list() }).toEqual({ nearMisses: [], radar: [] });
  });

  test("records each decision with Claude's judgement, as evidence for Proposals to the Screening Criteria", async () => {
    await screen({
      "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents."),
      "Beispiel Labor AG": nearMiss("manufacturing", 45, "Lab services for others."),
    });
    const [prüf, labor] = await nearMissesOn(SUNDAY).list();

    await nearMissesOn(SUNDAY).decide(prüf.sightingId, "Pulled In");
    await nearMissesOn("2026-10-19T07:00:00Z").decide(labor.sightingId, "Rightly Out");

    expect(await nearMissesOn(SUNDAY).decided()).toEqual([
      {
        name: "Beispiel Labor AG",
        decision: "Rightly Out",
        decidedOn: "2026-10-19",
        nearestLane: "manufacturing",
        closeness: 45,
        reason: "Close to manufacturing, but out.",
        criteriaVersion: 2,
      },
      {
        name: "Beispiel Prüf AG",
        decision: "Pulled In",
        decidedOn: "2026-10-18",
        nearestLane: "agents",
        closeness: 70,
        reason: "Close to agents, but out.",
        criteriaVersion: 2,
      },
    ]);
  });

  test.each([
    ["Rightly Out", "Pulled In"],
    ["Pulled In", "Rightly Out"],
  ] as const)("refuses a second decision on the same entry (%s, then %s)", async (first, second) => {
    await screen({ "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents.") });
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();
    await nearMisses.decide(prüf.sightingId, first);

    await expect(nearMisses.decide(prüf.sightingId, second)).rejects.toThrow(NearMissError);
  });
});
