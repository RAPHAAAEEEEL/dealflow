import { beforeEach, describe, expect, test } from "vitest";
import { openDb, type Db } from "@/db";
import { entryNamed, runShabDay } from "@/jobs/shab-job.testing";
import { createRadar } from "@/radar/radar";
import { fakeJudge, inLane } from "@/screening/judge.testing";
import { exampleEntry } from "@/sources/shab.testing";
import { createTriage } from "./triage";
import type { TriageInput } from "./types";

let db: Db;
beforeEach(async () => {
  db = await openDb();
});

async function candidates(priorities: Record<string, number>, screenedAt = "2026-10-17T06:00:00Z") {
  const names = Object.keys(priorities);
  const entries = names.map(entryNamed);
  const judge = fakeJudge({ byName: Object.fromEntries(names.map((n) => [n, inLane("robotics", priorities[n], `${n} builds robots.`)])) });
  await runShabDay(db, "2026-10-16", { entries, judge, at: screenedAt });
}

// One Legal Entity published on several days: one startup with one Signal per day, each screened that evening.
async function sameEntityOn(dates: string[]) {
  const kran = { ...exampleEntry, name: "Beispiel Kran AG" };
  const days = Object.fromEntries(dates.map((d, i) => [d, [{ ...kran, id: `pub-kran-${i}` }]]));
  for (const date of dates) await runShabDay(db, date, { days, judge: fakeJudge({ otherwise: inLane("robotics", 80, "Cranes.") }), at: `${date}T18:00:00Z` });
}

const triageOn = (isoDate: string) => createTriage(db, { now: () => new Date(isoDate) });
const statuses = async () => (await createRadar(db).list()).map((r) => [r.name, r.status]);

const scorecard = { teamProblemFit: 4, defensibility: 3, marketTiming: 4, earlyEvidence: 2, laneFit: 5, fundability: 3 };
const callsOf = (round: number, seriesA: number) => ({ "institutional-round-12m": round, "series-a-36m": seriesA });

describe("Triage queue", () => {
  test("holds at most 15 Candidates, highest Priority first", async () => {
    await candidates(Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`Beispiel ${i + 1} AG`, i + 1])));

    const queue = await triageOn("2026-10-18T09:00:00Z").queue();

    expect(queue.map((c) => c.priority)).toEqual([17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  });
});

describe("Triage decisions", () => {
  test.each(["Track", "Pass"] as const)("%s records the Owner's Scorecard and both Calls", async (decision) => {
    await candidates({ "Beispiel Kran AG": 80 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();

    await triage.decide(candidate.id, { decision, rationale: "Crane OEM founder, rare combination.", scorecard, calls: callsOf(70, 25) });

    expect(await createRadar(db).profile(candidate.id)).toMatchObject({
      status: decision,
      scorecard: { ...scorecard, momentum: 1 },
      calls: [
        { claim: "institutional-round-12m", probability: 70, rationale: "Crane OEM founder, rare combination.", madeOn: "2026-10-18" },
        { claim: "series-a-36m", probability: 25, rationale: "Crane OEM founder, rare combination.", madeOn: "2026-10-18" },
      ],
    });
  });

  test("shows the first Round Call on the radar list", async () => {
    await candidates({ "Beispiel Kran AG": 80 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();

    await triage.decide(candidate.id, { decision: "Track", rationale: "Strong team.", scorecard, calls: callsOf(70, 25) });

    expect((await createRadar(db).list()).map((r) => r.roundCall)).toEqual([70]);
  });

  test("Out of Scope records the decision without a Call or Scorecard", async () => {
    await candidates({ "Beispiel Handel AG": 40 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();

    await triage.decide(candidate.id, { decision: "Out of Scope", rationale: "A trading company, not a robot maker." });

    expect(await createRadar(db).profile(candidate.id)).toMatchObject({ status: "Out of Scope", scorecard: null, calls: [] });
  });

  test("puts the decision with its rationale on the Timeline, newest first", async () => {
    await candidates({ "Beispiel Handel AG": 40 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();

    await triage.decide(candidate.id, { decision: "Out of Scope", rationale: "A trading company, not a robot maker." });

    expect((await createRadar(db).profile(candidate.id))?.timeline).toMatchObject([
      { date: "2026-10-18", kind: "triage", text: "Out of Scope: A trading company, not a robot maker." },
      { date: "2026-10-16", kind: "signal", source: "SHAB" },
    ]);
  });
});

describe("Momentum", () => {
  test("counts the startup's Signals of the last 90 days", async () => {
    await sameEntityOn(["2026-06-01", "2026-10-16", "2026-10-20"]); // the June Signal is too old
    const triage = triageOn("2026-10-21T09:00:00Z");
    const [candidate] = await triage.queue();

    await triage.decide(candidate.id, { decision: "Track", rationale: "Busy founders.", scorecard, calls: callsOf(60, 20) });

    expect((await createRadar(db).profile(candidate.id))?.scorecard?.momentum).toBe(2);
  });

  test("never goes above 5", async () => {
    await sameEntityOn(["2026-09-01", "2026-09-15", "2026-09-29", "2026-10-06", "2026-10-13", "2026-10-20"]);
    const triage = triageOn("2026-10-21T09:00:00Z");
    const [candidate] = await triage.queue();

    await triage.decide(candidate.id, { decision: "Track", rationale: "Busy founders.", scorecard, calls: callsOf(60, 20) });

    expect((await createRadar(db).profile(candidate.id))?.scorecard?.momentum).toBe(5);
  });

  test("never goes below 1, even when every Signal is old", async () => {
    // A late run for an old publication day: the Signal dates from June, the Candidate from October.
    const old = { ...exampleEntry, name: "Beispiel Kran AG" };
    await runShabDay(db, "2026-06-01", { entries: [old], judge: fakeJudge({ otherwise: inLane("robotics", 80, "Cranes.") }), at: "2026-10-20T18:00:00Z" });
    const triage = triageOn("2026-10-21T09:00:00Z");
    const [candidate] = await triage.queue();

    await triage.decide(candidate.id, { decision: "Pass", rationale: "Nothing new since June.", scorecard, calls: callsOf(10, 5) });

    expect((await createRadar(db).profile(candidate.id))?.scorecard?.momentum).toBe(1);
  });
});

describe("Expiry and new Signals", () => {
  test("lets a Candidate that waited four weeks expire, but not one that waited less", async () => {
    await candidates({ "Beispiel Alt AG": 50 }, "2026-10-17T06:00:00Z");
    await candidates({ "Beispiel Neu AG": 50 }, "2026-10-20T06:00:00Z");

    await triageOn("2026-11-15T07:00:00Z").queue();

    expect(await statuses()).toEqual([
      ["Beispiel Alt AG", "Expired"],
      ["Beispiel Neu AG", "Candidate"],
    ]);
  });

  test("refuses a decision once the four weeks ran out, even if the card was loaded in time", async () => {
    await candidates({ "Beispiel Alt AG": 50 }, "2026-10-17T06:00:00Z");
    const [candidate] = await triageOn("2026-11-14T05:00:00Z").queue();

    await expect(
      triageOn("2026-11-14T07:00:00Z").decide(candidate.id, { decision: "Pass", rationale: "Late.", scorecard, calls: callsOf(10, 5) }),
    ).rejects.toThrow(/Expired/);
  });

  test("brings an Expired startup back as a Candidate when a new Signal arrives", async () => {
    await sameEntityOn(["2026-06-01"]);
    await triageOn("2026-07-15T09:00:00Z").queue(); // expires
    await sameEntityOn(["2026-06-01", "2026-10-16"]);

    await triageOn("2026-10-18T09:00:00Z").queue();

    expect(await statuses()).toEqual([["Beispiel Kran AG", "Candidate"]]);
  });

  test("restarts a waiting Candidate's four weeks when a new Signal arrives", async () => {
    await sameEntityOn(["2026-10-01", "2026-10-20"]);

    await triageOn("2026-11-05T09:00:00Z").queue(); // 35 days after the first Signal, 16 after the second

    expect(await statuses()).toEqual([["Beispiel Kran AG", "Candidate"]]);
  });
});

describe("Triage refuses", () => {
  test("a Track or Pass without a rationale", async () => {
    await candidates({ "Beispiel Kran AG": 80 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();

    await expect(triage.decide(candidate.id, { decision: "Pass", rationale: "  ", scorecard, calls: callsOf(20, 5) })).rejects.toThrow(
      /rationale/,
    );
  });

  test("a second decision on a startup that is no longer a Candidate", async () => {
    await candidates({ "Beispiel Kran AG": 80 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();
    await triage.decide(candidate.id, { decision: "Pass", rationale: "Too early to tell.", scorecard, calls: callsOf(20, 5) });

    await expect(
      triage.decide(candidate.id, { decision: "Track", rationale: "Changed my mind.", scorecard, calls: callsOf(60, 20) }),
    ).rejects.toThrow(/only a Candidate/);
  });

  test.each([
    ["a missing Call", { scorecard, calls: { "institutional-round-12m": 60 } }, /both Calls/],
    ["a missing Factor", { scorecard: { ...scorecard, fundability: undefined }, calls: callsOf(60, 20) }, /every Factor/],
  ])("%s, whatever a form sends", async (_, incomplete, message) => {
    await candidates({ "Beispiel Kran AG": 80 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();

    await expect(
      triage.decide(candidate.id, { decision: "Track", rationale: "Strong team.", ...incomplete } as unknown as TriageInput),
    ).rejects.toThrow(message);
  });

  test.each([
    ["a Factor outside 1 to 5", { laneFit: 6 }, {}, /1 to 5/],
    ["a probability outside 0 to 100", {}, { "series-a-36m": 105 }, /0 to 100/],
  ])("%s", async (_, cardChange, callChange, message) => {
    await candidates({ "Beispiel Kran AG": 80 });
    const triage = triageOn("2026-10-18T09:00:00Z");
    const [candidate] = await triage.queue();

    await expect(
      triage.decide(candidate.id, {
        decision: "Track",
        rationale: "Strong team.",
        scorecard: { ...scorecard, ...cardChange },
        calls: { ...callsOf(60, 20), ...callChange },
      }),
    ).rejects.toThrow(message);
  });
});
