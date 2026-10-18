import type { Sighting } from "@/sighting";

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
  judge(sighting: Sighting, criteria: Criteria): Promise<Judgement>;
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
