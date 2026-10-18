import { addDays } from "@/dates";
import type { Db } from "@/db";
import { fakeJudge } from "@/screening/judge.testing";
import type { Judge } from "@/screening/types";
import { createShabSource, type ShabHttp } from "@/sources/shab";
import { exampleEntry, fakeShabHttp, type FakeRegistration } from "@/sources/shab.testing";
import { runShabJob } from "./shab-job";

// Tests put data on the radar the way production does: through a SHAB run.

// An invented AG with its own name, publication id and UID.
export const entryNamed = (name: string): FakeRegistration => ({ ...exampleEntry, id: `pub-${name}`, name, uid: `CHE-${name}` });

// One SHAB run for a register day. By default it runs at 05:30 UTC the morning after, as scheduled.
export function runShabDay(
  db: Db,
  date: string,
  {
    entries = [],
    days = { [date]: entries },
    judge = fakeJudge(),
    http = fakeShabHttp(days),
    at = `${addDays(date, 1)}T05:30:00Z`,
    criteriaVersion = 1,
    shabTermsAcceptedOn = at.slice(0, 10),
  }: {
    entries?: FakeRegistration[];
    days?: Record<string, FakeRegistration[]>;
    judge?: Judge;
    http?: ShabHttp;
    at?: string;
    criteriaVersion?: number;
    shabTermsAcceptedOn?: string;
  } = {},
) {
  return runShabJob(
    {
      db,
      shab: createShabSource(http),
      judge,
      criteria: { version: criteriaVersion, text: "Lanes." },
      monthlyCapUsd: 10,
      shabTermsAcceptedOn,
      now: () => new Date(at),
    },
    date,
  );
}
