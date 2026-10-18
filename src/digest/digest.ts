import { and, count, desc, eq, gte, inArray, isNull, sum } from "drizzle-orm";
import { addDays, dayOf, daysBetween } from "@/dates";
import type { Db } from "@/db";
import { jobRuns, llmUsage, sightings } from "@/db/schema";
import { LANE_NAMES } from "@/screening/types";
import { shabTermsRunOutOn } from "@/sources/shab-terms";
import { createNearMisses } from "@/triage/near-misses";
import { createTriage } from "@/triage/triage";

export type DigestDeps = {
  db: Db;
  now: () => Date;
  monthlyCapUsd: number;
  shabTermsAcceptedOn: string | undefined; // YYYY-MM-DD as the Owner set it
  appUrl: string;
};

export type Digest = { subject: string; text: string; warnings: number };

// One line of the Status Check: fine, or a warning the Owner has to act on.
type Check = { ok: boolean; text: string };

const WINDOW_DAYS = 7;
const SPEND_WARNING_PERCENT = 80;
const TERMS_REMINDER_DAYS = 14;
const ERROR_SHOWN_CHARS = 200;
const RENEW_TERMS = "the setup wizard: ONLY=2";

// The Sunday email: what waits for Triage, the week's Near Misses, and the Status Check.
// It goes only to the Owner, so unlike the public CI log it may name companies and quote errors.
export async function buildDigest(deps: DigestDeps): Promise<Digest> {
  const { db, now, appUrl } = deps;
  const candidates = await createTriage(db, { now }).queue();
  const nearMisses = await createNearMisses(db, { now }).list();
  const checks = [...(await shabDays(db, now)), await screeningBacklog(db), await spend(deps), terms(deps)];
  const warnings = checks.filter((c) => !c.ok).length;

  const text = [
    `Dealflow · week to ${dayLabel(dayOf(now()))} ${now().getUTCFullYear()}`,
    "",
    "TRIAGE",
    ...(candidates.length
      ? [
          `${plural(candidates.length, "Candidate")} waiting: ${appUrl}/feed`,
          ...candidates.flatMap((c) => [`- ${c.name} · ${LANE_NAMES[c.lane]} · Priority ${c.priority}`, `  ${c.oneLiner}`]),
        ]
      : ["No Candidates waiting."]),
    "",
    "NEAR MISSES",
    ...(nearMisses.length
      ? [
          "Discarded, but close to a Lane. In the Feed, pull one into Triage or confirm it was rightly out.",
          ...nearMisses.flatMap((m) => [
            `- ${m.name} · nearest ${LANE_NAMES[m.nearestLane]} · closeness ${m.closeness}`,
            `  ${m.oneLiner}`,
            `  Out because: ${m.reason}`,
          ]),
        ]
      : ["None this week."]),
    "",
    "STATUS CHECK",
    ...checks.map((c) => `${c.ok ? "✓" : "⚠"} ${c.text}`),
    "",
    "Register data from SHAB, the Swiss Official Gazette of Commerce (Amtsblattportal), www.shab.ch. Not an official publication.",
    "",
  ].join("\n");

  const subject = `Dealflow: ${plural(candidates.length, "Candidate")}, ${plural(nearMisses.length, "Near Miss", "Near Misses")} · ${
    warnings ? plural(warnings, "warning") : "all clear"
  }`;
  return { subject, text, warnings };
}

// What went wrong with the past week's SHAB runs, one line per register day; empty when nothing did.
// The Digest is itself a scheduled workflow that GitHub can switch off, so the Feed shows these too.
export async function shabRunWarnings(db: Db, now: () => Date): Promise<string[]> {
  return (await checkShabDays(db, now)).warnings;
}

async function shabDays(db: Db, now: () => Date): Promise<Check[]> {
  const { expected, warnings } = await checkShabDays(db, now);
  if (!warnings.length) {
    return [{ ok: true, text: `SHAB: every register day screened, ${dayLabel(expected[0])} to ${dayLabel(expected.at(-1)!)}` }];
  }
  return warnings.map((text) => ({ ok: false, text }));
}

// Every SHAB register day of the past week (Monday to Friday) whose run, the morning after, should have
// happened before today. The latest run for a day counts, so a successful re-run clears a broken one.
async function checkShabDays(db: Db, now: () => Date) {
  const today = dayOf(now());
  const expected: string[] = [];
  for (let daysAgo = WINDOW_DAYS; daysAgo >= 2; daysAgo--) {
    const day = addDays(today, -daysAgo);
    const weekday = new Date(day).getUTCDay();
    if (weekday >= 1 && weekday <= 5) expected.push(day);
  }
  const runs = await db
    .select({ publicationDate: jobRuns.publicationDate, report: jobRuns.report })
    .from(jobRuns)
    .where(and(eq(jobRuns.job, "shab"), inArray(jobRuns.publicationDate, expected)))
    .orderBy(desc(jobRuns.startedAt));

  const warnings: string[] = [];
  for (const day of expected) {
    const latest = runs.find((r) => r.publicationDate === day);
    if (!latest) warnings.push(`SHAB ${dayLabel(day)}: no run.`);
    else if (latest.report.error) {
      warnings.push(
        `SHAB ${dayLabel(day)}: the run broke off (${shorten(latest.report.error.replace(/\.$/, ""))}). Run it again in GitHub Actions with the date ${day}.`,
      );
    }
  }
  const lastTwoMissing = expected.slice(-2).every((day) => !runs.some((r) => r.publicationDate === day));
  if (lastTwoMissing) {
    warnings[warnings.length - 1] +=
      "\n  GitHub stops scheduled workflows after 60 days without activity in the repository. Check Actions → SHAB job, and enable it again if it says disabled.";
  }
  return { expected, warnings };
}

// Sightings that still wait for Claude: the month's budget ran out, or Claude failed on them. Every run
// screens all waiting Sightings, whatever their Source, so the latest run's error is the one to show.
async function screeningBacklog(db: Db): Promise<Check> {
  const [{ waiting }] = await db.select({ waiting: count() }).from(sightings).where(isNull(sightings.screenedAt));
  if (!waiting) return { ok: true, text: "Nothing waiting for screening" };
  const [latestRun] = await db.select({ report: jobRuns.report }).from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(1);
  const latestError = latestRun?.report.errors?.at(-1);
  return {
    ok: false,
    text: `${waiting === 1 ? "1 entry waits" : `${waiting} entries wait`} for screening.${latestError ? ` Latest error: ${shorten(latestError)}` : ""}`,
  };
}

async function spend({ db, now, monthlyCapUsd }: DigestDeps): Promise<Check> {
  const t = now();
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const [{ spent }] = await db.select({ spent: sum(llmUsage.costUsd) }).from(llmUsage).where(gte(llmUsage.at, monthStart));
  const spentUsd = Number(spent ?? 0);
  const percent = Math.round((spentUsd / monthlyCapUsd) * 100);
  const line = `Claude spend in ${MONTHS[t.getUTCMonth()]}: $${spentUsd.toFixed(2)} of $${monthlyCapUsd.toFixed(2)}`;
  if (percent < SPEND_WARNING_PERCENT) return { ok: true, text: line };
  return { ok: false, text: `${line}, ${percent}% of the cap. Screening stops at the cap; what waits is screened next month.` };
}

function terms({ now, shabTermsAcceptedOn: acceptedOn }: DigestDeps): Check {
  const runOutOn = shabTermsRunOutOn(acceptedOn);
  if (!runOutOn) {
    return {
      ok: false,
      text: `SHAB terms: no acceptance date set. SHAB runs refuse to start until you accept them on www.shab.ch and run ${RENEW_TERMS}`,
    };
  }
  const daysLeft = daysBetween(dayOf(now()), runOutOn);
  if (daysLeft <= 0) {
    return {
      ok: false,
      text: `SHAB terms ran out on ${runOutOn}. SHAB runs refuse to start until you accept them again on www.shab.ch and run ${RENEW_TERMS}`,
    };
  }
  const line = `SHAB terms accepted on ${acceptedOn}, run out on ${runOutOn} (in ${plural(daysLeft, "day")})`;
  if (daysLeft > TERMS_REMINDER_DAYS) return { ok: true, text: line };
  return { ok: false, text: `${line}. Read and accept them again on www.shab.ch, then run ${RENEW_TERMS}` };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "Thu 15 Oct" for 2026-10-15.
function dayLabel(day: string) {
  const d = new Date(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const shorten = (s: string) => (s.length > ERROR_SHOWN_CHARS ? `${s.slice(0, ERROR_SHOWN_CHARS)}…` : s);
