import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { createClaudeArticleJudge } from "./claude-article-judge";

// The Claude API is the system boundary here: a fake client returns the response shape the SDK gives.
function fakeClaude(response: object) {
  return { messages: { parse: async () => response } } as unknown as Anthropic;
}

const usage = { input_tokens: 3000, output_tokens: 400, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const startup = {
  name: "Beispiel Labor",
  website: "beispiel-labor.ch",
  country: "ch",
  city: "Basel",
  inScope: true,
  lane: "manufacturing",
  secondaryLane: "manufacturing",
  oneLiner: "A self-driving lab for battery materials.",
  signal: "Raised a CHF 1.2M pre-seed round.",
  stage: "Pre-seed",
  priority: 140,
  closeness: 100,
  reason: "Owns the lab step for new battery materials.",
};
const article = { source: "startupticker.ch", title: "Beispiel Labor raises", text: "…", url: "https://ticker.example/a" };
const criteria = { version: 2, text: "Lanes." };

describe("Claude article judge", () => {
  test("tidies each startup Claude names into a mention", async () => {
    const judge = createClaudeArticleJudge(fakeClaude({ stop_reason: "end_turn", parsed_output: { startups: [startup] }, usage }));

    expect(await judge.judgeArticle(article, criteria)).toEqual({
      mentions: [
        {
          name: "Beispiel Labor",
          website: "https://beispiel-labor.ch",
          country: "CH",
          city: "Basel",
          inLane: true,
          lane: "manufacturing",
          secondaryLane: null,
          oneLiner: "A self-driving lab for battery materials.",
          signal: "Raised a CHF 1.2M pre-seed round.",
          stage: "Pre-seed",
          priority: 100,
          closeness: 100,
          reason: "Owns the lab step for new battery materials.",
        },
      ],
      usage: expect.objectContaining({ costUsd: expect.closeTo(0.0005, 10) }),
    });
  });

  test("keeps an out-of-scope startup's nearest Lane and closeness, with no Priority", async () => {
    const out = { ...startup, inScope: false, lane: "agents", closeness: 55, priority: 40, reason: "Already raised a Series A." };
    const judge = createClaudeArticleJudge(fakeClaude({ stop_reason: "end_turn", parsed_output: { startups: [out] }, usage }));

    expect((await judge.judgeArticle(article, criteria)).mentions[0]).toMatchObject({ inLane: false, lane: "agents", closeness: 55, priority: 0 });
  });

  test("throws an error that carries the cost when the answer can't be read", async () => {
    const judge = createClaudeArticleJudge(fakeClaude({ stop_reason: "max_tokens", parsed_output: null, usage }));

    await expect(judge.judgeArticle(article, criteria)).rejects.toMatchObject({ usage: { costUsd: expect.closeTo(0.0005, 10) } });
  });
});
