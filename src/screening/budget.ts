import { gte, max, sum } from "drizzle-orm";
import type { Db } from "@/db";
import { llmUsage } from "@/db/schema";
import type { Usage } from "./types";

// The hard monthly cap on Claude spend (docs/adr/0005), shared by every job and by Quick Add. A call is
// allowed only if the month's spend plus the priciest call seen so far stays within the cap, so the radar
// stops before it overspends rather than after.
export async function monthlyBudget(db: Db, { monthlyCapUsd, now }: { monthlyCapUsd: number; now: () => Date }) {
  const t = now();
  const monthStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
  const [{ spent }] = await db.select({ spent: sum(llmUsage.costUsd) }).from(llmUsage).where(gte(llmUsage.at, monthStart));
  const [{ priciest }] = await db.select({ priciest: max(llmUsage.costUsd) }).from(llmUsage);
  let spentThisMonth = Number(spent ?? 0);
  let callEstimate = Number(priciest ?? 0);
  return {
    allows: () => spentThisMonth + callEstimate <= monthlyCapUsd,
    // Every billed call counts, also one whose answer was unusable.
    async record(purpose: string, usage: Usage) {
      await db.insert(llmUsage).values({ at: now(), purpose, ...usage });
      spentThisMonth += usage.costUsd;
      callEstimate = Math.max(callEstimate, usage.costUsd);
    },
  };
}
