import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import type { Sighting } from "@/sighting";
import { createClaudeJudge } from "./claude-judge";

// The Claude API is the system boundary here: a fake client returns the response shape the SDK gives.
function fakeClaude(response: object) {
  return { messages: { parse: async () => response } } as unknown as Anthropic;
}

const usage = (input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
});

const answer = (priority: number) => ({
  inScope: true,
  lane: "robotics",
  secondaryLane: null,
  oneLiner: "Robots that lay rebar.",
  priority,
  reason: "Builds robots for construction sites.",
});

const sighting: Sighting = {
  source: "SHAB",
  externalId: "pub-robotik",
  publishedOn: "2026-10-16",
  url: "https://www.shab.ch/#!/search/publications/detail/pub-robotik",
  legalEntity: { name: "Beispiel Robotik AG", uid: "CHE-100.000.001", seat: "Zürich (ZH)", legalForm: "AG", purpose: "Roboter.", capitalChf: 100000 },
};
const criteria = { version: 1, text: "Lane definitions." };

describe("Claude judge", () => {
  test("prices a call from its token usage, cache reads included", async () => {
    // 200 × $0.10 + 1,100 cached × $0.01 + 60 × $0.50, per million tokens
    const judge = createClaudeJudge(fakeClaude({ stop_reason: "end_turn", parsed_output: answer(80), usage: usage(200, 60, 1100) }));

    expect((await judge.judge(sighting, criteria)).usage.costUsd).toBeCloseTo(0.000061, 10);
  });

  test("treats a refusal as out of scope and still counts its cost", async () => {
    const judge = createClaudeJudge(
      fakeClaude({ stop_reason: "refusal", stop_details: { category: "cyber" }, parsed_output: null, usage: usage(300, 0) }),
    );

    expect(await judge.judge(sighting, criteria)).toMatchObject({
      inLane: false,
      reason: "Claude declined to judge this entry (cyber).",
      usage: { costUsd: expect.closeTo(0.00003, 10) },
    });
  });

  test("throws an error that carries the cost when the answer can't be read", async () => {
    const judge = createClaudeJudge(fakeClaude({ stop_reason: "max_tokens", parsed_output: null, usage: usage(300, 2048) }));

    await expect(judge.judge(sighting, criteria)).rejects.toMatchObject({ usage: { costUsd: expect.closeTo(0.001054, 10) } });
  });

  test("keeps the Priority between 0 and 100", async () => {
    const judge = createClaudeJudge(fakeClaude({ stop_reason: "end_turn", parsed_output: answer(140), usage: usage(200, 60) }));

    expect(await judge.judge(sighting, criteria)).toMatchObject({ inLane: true, priority: 100 });
  });
});
