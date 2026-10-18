import { and, desc, eq, gte, inArray, isNull, sum, count } from "drizzle-orm";
import type { Db } from "@/db";
import { jobRuns, llmUsage, sightings } from "@/db/schema";
import { LANE_NAMES } from "@/screening/types";
import { createNearMisses } from "@/triage/near-misses";
import { createTriage } from "@/triage/triage";

export type DigestDeps = {
  db: Db;
  now: () => Date;
  monthlyCapUsd: number;
  shabTermsAcceptedOn: string; // YYYY-MM-DD, or empty when never set
  appUrl: string;
};

export type Digest = { subject: string; text: string; problems: number };

// One line of the Status Check: fine, or something the Owner has to act on.
type Check = { ok: boolean; text: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 7;
const SPEND_WARNING_PERCENT = 80;
const TERMS_VALID_DAYS = 90; // docs/adr/0002
const TERMS_REMINDER_DAYS = 14;
const ERROR_SHOWN_CHARS = 200;
const RENEW_TERMS = "the setup wizard: ONLY=2";

// The Sunday email: what waits for Triage, the week's Near Misses, and whether the pipeline ran as it should.
// It goes only to the Owner, so unlike the public CI log it may name companies and quote errors.
export async function buildDigest(deps: DigestDeps): Promise<Digest> {
  const { db, now, appUrl } = deps;
  const candidates = await createTriage(db, { now }).queue();
  const nearMisses = await createNearMisses(db, { now }).list();
  const checks = [...(await shabDays(deps)), await screeningBacklog(db), await spend(deps), terms(deps)];
  const problems = checks.filter((c) => !c.ok).length;

  const text = [
    `Dealflow · week to ${dayLabel(dateOf(now()))} ${now().getUTCFullYear()}`,
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
    "Register data from SHAB, www.shab.ch. Not an official publication.",
    "",
  ].join("\n");

  const subject = `Dealflow: ${plural(candidates.length, "Candidate")}, ${plural(nearMisses.length, "Near Miss", "Near Misses")} · ${
    problems ? plural(problems, "warning") : "all clear"
  }`;
  return { subject, text, problems };
}

// Every SHAB register day of the past week (Monday to Friday) whose run, the morning after, should have
// happened before today. The latest run for a day counts, so a successful re-run clears a broken one.
async function shabDays({ db, now }: DigestDeps): Promise<Check[]> {
  const today = Date.parse(dateOf(now()));
  const expected: string[] = [];
  for (let daysAgo = WINDOW_DAYS; daysAgo >= 2; daysAgo--) {
    const day = new Date(today - daysAgo * DAY_MS);
    if (day.getUTCDay() >= 1 && day.getUTCDay() <= 5) expected.push(dateOf(day));
  }
  const runs = await db
    .select({ publicationDate: jobRuns.publicationDate, report: jobRuns.report })
    .from(jobRuns)
    .where(and(eq(jobRuns.job, "shab"), inArray(jobRuns.publicationDate, expected)))
    .orderBy(desc(jobRuns.startedAt));

  const problems: Check[] = [];
  for (const day of expected) {
    const latest = runs.find((r) => r.publicationDate === day);
    const error = (latest?.report as { error?: string } | undefined)?.error;
    if (!latest) problems.push({ ok: false, text: `SHAB ${dayLabel(day)}: no run.` });
    else if (error) {
      problems.push({
        ok: false,
        text: `SHAB ${dayLabel(day)}: the run broke off (${shorten(error)}). Run it again in GitHub Actions with the date ${day}.`,
      });
    }
  }
  if (!problems.length) {
    return [{ ok: true, text: `SHAB: every register day screened, ${dayLabel(expected[0])} to ${dayLabel(expected.at(-1)!)}` }];
  }
  const lastTwoMissing = expected.slice(-2).every((day) => !runs.some((r) => r.publicationDate === day));
  if (lastTwoMissing) {
    problems.at(-1)!.text +=
      "\n  GitHub stops scheduled workflows after 60 days without activity in the repository. Check Actions → SHAB job, and enable it again if it says disabled.";
  }
  return problems;
}

// Sightings that still wait for Claude: the month's budget ran out, or Claude failed on them.
async function screeningBacklog(db: Db): Promise<Check> {
  const [{ waiting }] = await db.select({ waiting: count() }).from(sightings).where(isNull(sightings.screenedAt));
  if (!waiting) return { ok: true, text: "Nothing waiting for screening" };
  const [latestRun] = await db.select({ report: jobRuns.report }).from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(1);
  const latestError = (latestRun?.report as { errors?: string[] } | undefined)?.errors?.at(-1);
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

// The Owner accepts the SHAB terms in person, and again every 90 days (docs/adr/0002).
function terms({ now, shabTermsAcceptedOn: acceptedOn }: DigestDeps): Check {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(acceptedOn)) {
    return {
      ok: false,
      text: `SHAB terms: no acceptance date set. SHAB runs refuse to start until you accept them on www.shab.ch and run ${RENEW_TERMS}`,
    };
  }
  const runOutOn = dateOf(new Date(Date.parse(acceptedOn) + TERMS_VALID_DAYS * DAY_MS));
  const daysLeft = Math.round((Date.parse(runOutOn) - Date.parse(dateOf(now()))) / DAY_MS);
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

const dateOf = (at: Date) => at.toISOString().slice(0, 10);

// "Thu 15 Oct" for 2026-10-15.
function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const shorten = (s: string) => (s.length > ERROR_SHOWN_CHARS ? `${s.slice(0, ERROR_SHOWN_CHARS)}…` : s);
