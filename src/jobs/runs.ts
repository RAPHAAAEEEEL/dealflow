import { desc } from "drizzle-orm";
import type { Db } from "@/db";
import { jobRuns } from "@/db/schema";

export type JobRun = Omit<typeof jobRuns.$inferInsert, "id">;

const RECENT_RUNS = 20;

export async function recordRun(db: Db, run: JobRun) {
  await db.insert(jobRuns).values(run);
}

// The most recent runs first.
export async function latestRuns(db: Db): Promise<JobRun[]> {
  const rows = await db.select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(RECENT_RUNS);
  return rows.map(({ id, ...run }) => run);
}
