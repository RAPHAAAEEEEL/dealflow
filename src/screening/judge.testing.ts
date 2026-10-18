import type { Judge, Judgement, Lane, Usage } from "./types";

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

export const outOfScope = (reason: string): Verdict => ({ inLane: false, reason });

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
