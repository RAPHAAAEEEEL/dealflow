// Reads the startup news feeds and screens their new articles (docs/adr/0009).
//   npm run job:feeds
// Uses the hosted database when DATABASE_URL is set, else the local one (stop `npm run dev` first:
// the local database allows one process at a time). The hosted schema is migrated at deploy, not here.
import { connect } from "@/db";
import { publicFeedsSummary, runFeedsJob } from "@/jobs/feeds-job";
import { createClaudeArticleJudge } from "@/screening/claude-article-judge";
import { loadCriteria } from "@/screening/criteria";
import { createFeedSource } from "@/sources/feeds";
import { createFeedHttp } from "@/sources/feeds-http";
import { createPageFetcher } from "@/sources/page-fetcher";

const criteria = await loadCriteria();
const { db, close } = await connect({ migrateHosted: false });
console.log(`Feeds job, Screening Criteria version ${criteria.version}.`);

try {
  const report = await runFeedsJob({
    db,
    feeds: createFeedSource(createFeedHttp()),
    pages: createPageFetcher({ minIntervalMs: 2000 }),
    judge: createClaudeArticleJudge(),
    criteria,
    monthlyCapUsd: Number(process.env.DEALFLOW_MONTHLY_CAP_USD ?? 10),
    now: () => new Date(),
  });
  // CI logs of a public repo show counts only; the full report is stored with the run (docs/adr/0007).
  console.log(publicFeedsSummary(report));
  if (!process.env.CI) {
    for (const line of [...report.unreadFeeds, ...report.errors].slice(0, 8)) console.log(`  ${line}`);
  }
  if (report.failed > 0 || report.unreadFeeds.length > 0) {
    // A red run makes GitHub email the Owner; waiting articles are tried again on the next run.
    console.error("Some feeds or articles couldn't be read. The reasons are stored with the run.");
    process.exitCode = 1;
  }
} catch (error) {
  // Error texts can carry company names, so CI only learns that the run broke off.
  if (process.env.CI) console.error(`The feeds job broke off (${error instanceof Error ? error.name : "error"}). The reason is stored with the run.`);
  else console.error(error);
  process.exitCode = 1;
} finally {
  await close();
}
