// Terms follow CONTEXT.md.

export type TriageDecision = "Track" | "Pass" | "Out of Scope";

// The fixed statements a Call puts a probability on.
export const CLAIMS = {
  "institutional-round-12m": "Raises an Institutional Round within 12 months",
  "series-a-36m": "Reaches Series A within 36 months",
} as const;
export type Claim = keyof typeof CLAIMS;

// The six Factors the Owner sets, each 1–5. The radar adds Momentum itself.
export const OWNER_FACTORS = {
  teamProblemFit: "Team–Problem Fit",
  defensibility: "Defensibility",
  marketTiming: "Market & Timing",
  earlyEvidence: "Early Evidence",
  laneFit: "Lane Fit",
  fundability: "Fundability",
} as const;
export type OwnerFactor = keyof typeof OWNER_FACTORS;
export type OwnerScorecard = Record<OwnerFactor, number>;
export type Scorecard = OwnerScorecard & { momentum: number };

export type TriageInput =
  | {
      decision: "Track" | "Pass";
      rationale: string;
      scorecard: OwnerScorecard;
      calls: Record<Claim, number>; // probability in percent
    }
  | { decision: "Out of Scope"; rationale?: string };

// Reads the Scorecard captured with a Track or Pass decision; Out of Scope decisions have none.
export function scorecardFrom(decision: {
  teamProblemFit: number | null;
  defensibility: number | null;
  marketTiming: number | null;
  earlyEvidence: number | null;
  laneFit: number | null;
  fundability: number | null;
  momentum: number | null;
}): Scorecard | null {
  const { teamProblemFit, defensibility, marketTiming, earlyEvidence, laneFit, fundability, momentum } = decision;
  if (
    teamProblemFit === null ||
    defensibility === null ||
    marketTiming === null ||
    earlyEvidence === null ||
    laneFit === null ||
    fundability === null ||
    momentum === null
  ) {
    return null;
  }
  return { teamProblemFit, defensibility, marketTiming, earlyEvidence, laneFit, fundability, momentum };
}
