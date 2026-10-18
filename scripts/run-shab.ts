// Runs the SHAB job for one publication date (default: yesterday).
//   npm run job:shab                 yesterday
//   npm run job:shab -- 2026-10-16   a given day
// Uses the hosted database when DATABASE_URL is set, else the local one (stop `npm run dev` first:
// the local database allows one process at a time). The hosted schema is migrated at deploy, not here.
import { connect } from "@/db";
import { publicSummary, runShabJob } from "@/jobs/shab-job";
import { createClaudeJudge } from "@/screening/claude-judge";
import { loadCriteria } from "@/screening/criteria";
import { createShabSource } from "@/sources/shab";
import { createShabHttp } from "@/sources/shab-http";

// The SHAB terms must be accepted by the Owner in person, and again every 90 days (docs/adr/0002).
const acceptedOn = process.env.SHAB_TERMS_ACCEPTED_ON ?? "";
const DAY_MS = 24 * 60 * 60 * 1000;
const termsAgeDays = (Date.now() - Date.parse(acceptedOn)) / DAY_MS;
if (!(termsAgeDays >= 0 && termsAgeDays <= 90)) {
  console.error(
    [
      acceptedOn ? `The SHAB terms were last accepted on ${acceptedOn}, more than 90 days ago.` : "The SHAB terms have not been accepted yet.",
      "Read them at https://www.shab.ch/static/agb_de.pdf, accept them on https://www.shab.ch,",
      "then set SHAB_TERMS_ACCEPTED_ON=YYYY-MM-DD (in .env.local, or as a GitHub Actions variable).",
    ].join("\n"),
  );
  process.exit(1);
}

const yesterday = new Date(Date.now() - DAY_MS).toISOString().slice(0, 10);
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
      now: () => new Date(),
    },
    date,
  );
  // CI logs of a public repo show counts only; the full report is stored with the run (docs/adr/0007).
  console.log(publicSummary(report));
  if (report.errors.length && !process.env.CI) console.log(`Errors:\n  ${report.errors.slice(0, 5).join("\n  ")}`);
} catch (error) {
  // Error texts can carry company names (database errors include their query parameters), so CI only
  // learns that the run broke off; the reason is stored with the run.
  if (process.env.CI) console.error(`The SHAB job broke off (${error instanceof Error ? error.name : "error"}). The reason is stored with the run.`);
  else console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
