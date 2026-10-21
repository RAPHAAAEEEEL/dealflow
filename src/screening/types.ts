import type { Stage } from "@/radar/radar";
import type { ShabSighting } from "@/sighting";

export const LANES = ["robotics", "agents", "manufacturing"] as const;
export type Lane = (typeof LANES)[number];

export const LANE_NAMES: Record<Lane, string> = {
  robotics: "Specialised Robotics",
  agents: "Enterprise Agents",
  manufacturing: "Deep-Tech Manufacturing",
};

// The versioned Screening Criteria from criteria/screening-criteria.md.
export type Criteria = { version: number; text: string };

export type Usage = { model: string; inputTokens: number; outputTokens: number; costUsd: number };

// Claude's part of Screening: either the Sighting belongs in a Lane, or it doesn't. A discarded one
// still says how close it came to its nearest Lane, so the Owner can catch a Near Miss.
export type Judgement =
  | {
      inLane: true;
      lane: Lane;
      secondaryLane: Lane | null;
      oneLiner: string;
      priority: number; // 0–100, the Candidate's place in the Triage queue
      reason: string;
      usage: Usage;
    }
  | {
      inLane: false;
      nearestLane: Lane | null; // null when it is nowhere near any Lane
      closeness: number; // 0–100, how close it came to fitting the nearest Lane
      oneLiner: string;
      reason: string;
      usage: Usage;
    };

// The boundary to Claude. Tests replace it with a fake; production uses Claude Haiku.
export type Judge = {
  judge(sighting: ShabSighting, criteria: Criteria): Promise<Judgement>;
};

// Thrown when a call was billed but gave no usable Judgement, so its cost still counts against the budget.
export class JudgeError extends Error {
  constructor(
    message: string,
    readonly usage: Usage,
  ) {
    super(message);
  }
}

// One startup an article presents or reports on, as Claude judged it against the Lanes and the Stage
// Rule. Claude names no people in any field (docs/adr/0003).
export type ArticleMention = {
  name: string;
  website: string | null;
  country: string; // ISO 3166 code, or "" when unknown
  city: string;
  inLane: boolean;
  lane: Lane | null; // the nearest Lane when out of scope
  secondaryLane: Lane | null;
  oneLiner: string;
  signal: string; // what the article reports about it, in one sentence
  stage: Stage;
  priority: number; // 0–100, as for a Judgement
  closeness: number; // 0–100, as for a discarded Judgement
  reason: string;
};

// The boundary to Claude for news articles. Tests replace it with a fake; production uses Claude Haiku.
export type ArticleJudge = {
  judgeArticle(article: { source: string; title: string; text: string; url: string }, criteria: Criteria): Promise<{ mentions: ArticleMention[]; usage: Usage }>;
};
