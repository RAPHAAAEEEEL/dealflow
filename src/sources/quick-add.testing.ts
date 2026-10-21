import { usageCosting } from "@/screening/judge.testing";
import type { CompanyReader, CompanyReading, PageFetcher } from "./quick-add";

// Test doubles for Quick Add's two boundaries: Claude reading a company, and fetching a web page.

type Answer = Omit<Extract<CompanyReading, { found: true }>, "usage" | "found">;

export const voltMover: Answer = {
  name: "Volt Mover",
  website: null,
  country: "DE",
  city: "Berlin",
  lane: "robotics",
  secondaryLane: null,
  oneLiner: "Autonomous electric tugs that move trailers around logistics yards.",
  stage: "Pre-seed",
  pastStageRule: false,
  reason: "A robot built for one job in logistics yards.",
};

// Answers in turn, the last one again for any further call, and remembers what it was given.
export function fakeCompanyReader(answers: (Partial<Answer> | { found: false; reason: string })[], costUsd = 0.001) {
  const calls: Parameters<CompanyReader["read"]>[0][] = [];
  const reader: CompanyReader = {
    async read(input) {
      calls.push(input);
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      const usage = usageCosting(costUsd);
      if ("found" in answer) return { ...answer, usage };
      return { ...voltMover, ...answer, found: true, usage };
    },
  };
  return { reader, calls };
}

// Serves the given pages as text and remembers every URL it was asked for.
export function fakePages(pages: Record<string, string> = {}) {
  const fetched: string[] = [];
  const fetcher: PageFetcher = {
    async fetchText(url) {
      fetched.push(url);
      if (!(url in pages)) throw new Error(`No page at ${url}`);
      return pages[url];
    },
  };
  return { fetcher, fetched };
}
