import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/db";
import { runShabJob } from "@/jobs/shab-job";
import { createRadar } from "@/radar/radar";
import { fakeJudge, inLane, nearMiss, outOfScope } from "@/screening/judge.testing";
import type { Judge } from "@/screening/types";
import { createShabSource } from "@/sources/shab";
import { exampleEntry, fakeShabHttp } from "@/sources/shab.testing";
import { createNearMisses, NearMissError } from "./near-misses";
import { createTriage } from "./triage";

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

// Discards reach the radar's database the way production does: through a SHAB run screened at `screenedAt`.
async function screen(judgeByName: Parameters<typeof fakeJudge>[0], names: string[], screenedAt = "2026-10-16T05:30:00Z") {
  const date = screenedAt.slice(0, 10);
  const entries = names.map((name) => ({ ...exampleEntry, id: `pub-${name}`, name, uid: `CHE-${name}` }));
  const judge: Judge = fakeJudge(judgeByName);
  await runShabJob(
    {
      db,
      shab: createShabSource(fakeShabHttp({ [date]: entries })),
      judge,
      criteria: { version: 2, text: "Lanes." },
      monthlyCapUsd: 10,
      now: () => new Date(screenedAt),
    },
    date,
  );
}

const nearMissesOn = (isoDate: string) => createNearMisses(db, { now: () => new Date(isoDate) });
const SUNDAY = "2026-10-18T17:00:00Z";

describe("Near Misses", () => {
  test("shows the week's five closest discards, closest first", async () => {
    const closeness = { "Beispiel A AG": 30, "Beispiel B AG": 90, "Beispiel C AG": 55, "Beispiel D AG": 20, "Beispiel E AG": 75, "Beispiel F AG": 40 };
    await screen(
      { byName: Object.fromEntries(Object.entries(closeness).map(([name, c]) => [name, nearMiss("agents", c, `${name} tests AI agents.`)])) },
      Object.keys(closeness),
    );

    const shown = await nearMissesOn(SUNDAY).list();

    expect(shown.map((m) => [m.name, m.closeness])).toEqual([
      ["Beispiel B AG", 90],
      ["Beispiel E AG", 75],
      ["Beispiel C AG", 55],
      ["Beispiel F AG", 40],
      ["Beispiel A AG", 30],
    ]);
  });

  test("shows what the Owner needs to judge one", async () => {
    await screen({ byName: { "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents for banks.") } }, ["Beispiel Prüf AG"]);

    expect(await nearMissesOn(SUNDAY).list()).toEqual([
      {
        sightingId: expect.any(String),
        name: "Beispiel Prüf AG",
        nearestLane: "agents",
        closeness: 70,
        oneLiner: "Audits AI agents for banks.",
        reason: "Close to agents, but out.",
        publishedOn: "2026-10-16",
        url: expect.stringContaining("pub-Beispiel Prüf AG"),
        registration: expect.stringMatching(/^New registration: Beispiel Prüf AG, Zürich \(ZH\)\. Purpose: /),
      },
    ]);
  });

  test("leaves out discards below 20, ones nowhere near a Lane, and ones older than a week", async () => {
    await screen({ byName: { "Beispiel Alt AG": nearMiss("robotics", 80, "Old news.") } }, ["Beispiel Alt AG"], "2026-10-10T05:30:00Z");
    await screen(
      {
        byName: {
          "Beispiel Fern AG": nearMiss("robotics", 15, "Sells garden tools."),
          "Beispiel Treuhand AG": outOfScope("Accounting services."),
          "Beispiel Nah AG": nearMiss("robotics", 20, "Builds inspection rigs for others."),
        },
      },
      ["Beispiel Fern AG", "Beispiel Treuhand AG", "Beispiel Nah AG"],
    );

    expect((await nearMissesOn(SUNDAY).list()).map((m) => m.name)).toEqual(["Beispiel Nah AG"]);
  });

  test("pulling one into Triage makes it a Candidate at the front of the queue", async () => {
    await screen(
      {
        byName: {
          "Beispiel Kran AG": inLane("robotics", 90, "Crane robots."),
          "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents for banks."),
        },
      },
      ["Beispiel Kran AG", "Beispiel Prüf AG"],
    );
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();

    await nearMisses.pullIn(prüf.sightingId);

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
    await screen({ byName: { "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents.") } }, ["Beispiel Prüf AG"]);
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();
    await nearMisses.pullIn(prüf.sightingId);

    // 2026-11-14 is four weeks after the run that discarded it, but less than four weeks after the pull-in.
    const queue = await createTriage(db, { now: () => new Date("2026-11-14T09:00:00Z") }).queue();

    expect(queue.map((c) => c.name)).toEqual(["Beispiel Prüf AG"]);
  });

  test("confirming one as rightly out takes it off the list and keeps it off the radar", async () => {
    await screen({ byName: { "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents.") } }, ["Beispiel Prüf AG"]);
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();

    await nearMisses.rightlyOut(prüf.sightingId);

    expect({ nearMisses: await nearMisses.list(), radar: await createRadar(db).list() }).toEqual({ nearMisses: [], radar: [] });
  });

  test("records each verdict with Claude's judgement, for Proposals to the Screening Criteria", async () => {
    await screen(
      {
        byName: {
          "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents."),
          "Beispiel Labor AG": nearMiss("manufacturing", 45, "Lab services for others."),
        },
      },
      ["Beispiel Prüf AG", "Beispiel Labor AG"],
    );
    const [prüf, labor] = await nearMissesOn(SUNDAY).list();

    await nearMissesOn(SUNDAY).pullIn(prüf.sightingId);
    await nearMissesOn("2026-10-19T07:00:00Z").rightlyOut(labor.sightingId);

    expect(await nearMissesOn(SUNDAY).reviewed()).toEqual([
      {
        name: "Beispiel Labor AG",
        verdict: "Rightly Out",
        reviewedOn: "2026-10-19",
        nearestLane: "manufacturing",
        closeness: 45,
        reason: "Close to manufacturing, but out.",
        criteriaVersion: 2,
      },
      {
        name: "Beispiel Prüf AG",
        verdict: "Pulled In",
        reviewedOn: "2026-10-18",
        nearestLane: "agents",
        closeness: 70,
        reason: "Close to agents, but out.",
        criteriaVersion: 2,
      },
    ]);
  });

  test.each([
    ["rightlyOut", "pullIn"],
    ["pullIn", "rightlyOut"],
  ] as const)("refuses a second verdict on the same entry (%s, then %s)", async (first, second) => {
    await screen({ byName: { "Beispiel Prüf AG": nearMiss("agents", 70, "Audits AI agents.") } }, ["Beispiel Prüf AG"]);
    const nearMisses = nearMissesOn(SUNDAY);
    const [prüf] = await nearMisses.list();
    await nearMisses[first](prüf.sightingId);

    await expect(nearMisses[second](prüf.sightingId)).rejects.toThrow(NearMissError);
  });
});
