// Runs the SHAB job for one publication date (default: yesterday).
//   npm run job:shab                 yesterday
//   npm run job:shab -- 2026-10-16   a given day
// Uses the hosted database when DATABASE_URL is set, else the local one (stop `npm run dev` first:
// the local database allows one process at a time). The hosted schema is migrated at deploy, not here.
import { dayOf, daysBefore } from "@/dates";
import { connect } from "@/db";
import { publicSummary, runShabJob } from "@/jobs/shab-job";
import { createClaudeJudge } from "@/screening/claude-judge";
import { loadCriteria } from "@/screening/criteria";
import { createShabSource } from "@/sources/shab";
import { createShabHttp } from "@/sources/shab-http";
import { ShabTermsError } from "@/sources/shab-terms";

const yesterday = dayOf(daysBefore(new Date(), 1));
const date = process.argv[2] || yesterday;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Expected a date like 2026-10-16, got "${date}"`);

const criteria = await loadCriteria();
const { db, close } = await connect({ migrateHosted: false });
console.log(`SHAB job for ${date}, Screening Criteria version ${criteria.version}.`);

try {
  const report = await runShabJob(
    {
      db,
      shab: createShabSource(createShabHttp()),
      judge: createClaudeJudge(),
      criteria,
      monthlyCapUsd: Number(process.env.DEALFLOW_MONTHLY_CAP_USD ?? 10),
      // The Owner accepts the SHAB terms in person, and again every 90 days (docs/adr/0002).
      shabTermsAcceptedOn: process.env.SHAB_TERMS_ACCEPTED_ON,
      now: () => new Date(),
    },
    date,
  );
  // CI logs of a public repo show counts only; the full report is stored with the run (docs/adr/0007).
  console.log(publicSummary(report));
  if (report.errors.length && !process.env.CI) console.log(`Errors:\n  ${report.errors.slice(0, 5).join("\n  ")}`);
  if (report.failed > 0) {
    // A red run makes GitHub email the Owner; the entries stay waiting and the next run retries them.
    console.error(`${report.failed} entries couldn't be screened. They wait for the next run; the reasons are stored with the run.`);
    process.exitCode = 1;
  }
} catch (error) {
  if (error instanceof ShabTermsError) {
    // The refusal names no company, so the public log may show it. The run is recorded as refused.
    console.error(
      [
        error.message,
        "Read them at https://www.shab.ch/static/agb_de.pdf, accept them on https://www.shab.ch,",
        "then set SHAB_TERMS_ACCEPTED_ON with the setup wizard: ONLY=2",
      ].join("\n"),
    );
  } else if (process.env.CI) {
    // Error texts can carry company names (database errors include their query parameters), so CI only
    // learns that the run broke off; the reason is stored with the run.
    console.error(`The SHAB job broke off (${error instanceof Error ? error.name : "error"}). The reason is stored with the run.`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
} finally {
  await close();
}
