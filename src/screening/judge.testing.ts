import type { ArticleJudge, ArticleMention, Judge, Judgement, Lane, Usage } from "./types";

// Test double for Claude: judges a Sighting by its legal entity's name, as the test dictates.

type Verdict = Judgement extends infer J ? (J extends Judgement ? Omit<J, "usage"> : never) : never;

export const inLane = (lane: Lane, priority: number, oneLiner: string): Verdict => ({
  inLane: true,
  lane,
  secondaryLane: null,
  oneLiner,
  priority,
  reason: `Fits ${lane}.`,
});

export const outOfScope = (reason: string): Verdict => ({ inLane: false, nearestLane: null, closeness: 0, oneLiner: "", reason });

// Discarded, but close to a Lane.
export const nearMiss = (nearestLane: Lane, closeness: number, oneLiner: string): Verdict => ({
  inLane: false,
  nearestLane,
  closeness,
  oneLiner,
  reason: `Close to ${nearestLane}, but out.`,
});

export const usageCosting = (costUsd: number): Usage => ({ model: "fake-haiku", inputTokens: 900, outputTokens: 80, costUsd });

export function fakeJudge({
  byName = {},
  otherwise = outOfScope("Not in any Lane."),
  costUsd = 0.001,
}: { byName?: Record<string, Verdict>; otherwise?: Verdict; costUsd?: number } = {}): Judge {
  return {
    async judge(sighting) {
      return { ...(byName[sighting.legalEntity.name] ?? otherwise), usage: usageCosting(costUsd) };
    },
  };
}

// One startup an article presents, as Claude would judge it: in a Lane when `lane` is given.
export const mention = (name: string, lane: Lane | null, overrides: Partial<ArticleMention> = {}): ArticleMention => ({
  name,
  website: null,
  country: "DE",
  city: "Berlin",
  inLane: lane !== null,
  lane,
  secondaryLane: null,
  oneLiner: `${name} builds things.`,
  signal: `Presented as a new startup.`,
  stage: "Pre-round",
  priority: lane ? 75 : 0,
  closeness: lane ? 100 : 10,
  reason: lane ? `Fits ${lane}.` : "Not in any Lane.",
  ...overrides,
});

// Test double for Claude reading an article: names the startups the test gives for its title, and
// remembers the text it was given.
export function fakeArticleJudge({ byTitle = {}, costUsd = 0.001 }: { byTitle?: Record<string, ArticleMention[]>; costUsd?: number } = {}) {
  const texts: string[] = [];
  const judge: ArticleJudge = {
    async judgeArticle(article) {
      texts.push(article.text);
      return { mentions: byTitle[article.title] ?? [], refused: false, usage: usageCosting(costUsd) };
    },
  };
  return { judge, texts };
}
