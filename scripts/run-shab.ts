// Runs the SHAB job for one publication date (default: yesterday) against the local database.
//   npm run job:shab                 yesterday
//   npm run job:shab -- 2026-10-16   a given day
// Stop `npm run dev` first: the local database allows one process at a time.
import { localDbDir, openDb } from "@/db";
import { runShabJob } from "@/jobs/shab-job";
import { createClaudeJudge } from "@/screening/claude-judge";
import { loadCriteria } from "@/screening/criteria";
import { createShabSource } from "@/sources/shab";
import { createShabHttp } from "@/sources/shab-http";

// The SHAB terms must be accepted by the Owner in person, and again every 90 days (docs/adr/0002).
const acceptedOn = process.env.SHAB_TERMS_ACCEPTED_ON ?? "";
const termsAgeDays = (Date.now() - Date.parse(acceptedOn)) / 864e5;
if (!(termsAgeDays >= 0 && termsAgeDays <= 90)) {
  console.error(
    [
      acceptedOn ? `The SHAB terms were last accepted on ${acceptedOn}, more than 90 days ago.` : "The SHAB terms have not been accepted yet.",
      "Read them at https://www.shab.ch/static/agb_de.pdf, accept them on https://www.shab.ch,",
      "then set SHAB_TERMS_ACCEPTED_ON=YYYY-MM-DD in .env.local.",
    ].join("\n"),
  );
  process.exit(1);
}

const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
const date = process.argv[2] ?? yesterday;
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Expected a date like 2026-10-16, got "${date}"`);

const criteria = await loadCriteria();
const db = await openDb(localDbDir());
console.log(`SHAB job for ${date}, Screening Criteria version ${criteria.version}. Fetching about one entry per second...`);

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

const { errors, ...counts } = report;
console.log({ ...counts, spentUsd: Number(counts.spentUsd.toFixed(4)) });
if (errors.length) console.log(`First errors:\n  ${errors.slice(0, 5).join("\n  ")}`);
