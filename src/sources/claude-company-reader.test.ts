import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, test } from "vitest";
import { createClaudeCompanyReader } from "./claude-company-reader";

// The Claude API is the system boundary here: a fake client returns the response shape the SDK gives.
function fakeClaude(response: object) {
  const sent: { messages: { content: string }[] }[] = [];
  const client = {
    messages: {
      parse: async (request: { messages: { content: string }[] }) => {
        sent.push(request);
        return response;
      },
    },
  } as unknown as Anthropic;
  return { client, sent };
}

const usage = { input_tokens: 400, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const answer = {
  found: true,
  name: " Volt Mover ",
  website: "volt-mover.de",
  country: "de",
  city: "Berlin",
  lane: "robotics",
  secondaryLane: "robotics",
  oneLiner: "Autonomous electric tugs for logistics yards.",
  stage: "Pre-seed",
  pastStageRule: false,
  reason: "The post says what it builds.",
};
const criteria = { version: 2, text: "Lanes." };
const input = { text: "Volt Mover launched.", pages: [], linkedinCompany: "volt-mover" };

describe("Claude company reader", () => {
  test("tidies Claude's answer into a reading", async () => {
    const { client } = fakeClaude({ stop_reason: "end_turn", parsed_output: answer, usage });

    expect(await createClaudeCompanyReader(client).read(input, criteria)).toMatchObject({
      found: true,
      name: "Volt Mover",
      website: "https://volt-mover.de",
      country: "DE",
      secondaryLane: null,
      usage: { costUsd: expect.closeTo(0.00008, 10) },
    });
  });

  test("never takes a LinkedIn address as the company's website", async () => {
    const { client } = fakeClaude({ stop_reason: "end_turn", parsed_output: { ...answer, website: "https://www.linkedin.com/company/volt-mover" }, usage });

    expect(await createClaudeCompanyReader(client).read(input, criteria)).toMatchObject({ found: true, website: null });
  });

  test("tells Claude the shared LinkedIn company page and the pages the radar opened", async () => {
    const { client, sent } = fakeClaude({ stop_reason: "end_turn", parsed_output: answer, usage });

    await createClaudeCompanyReader(client).read({ ...input, pages: [{ url: "https://volt-mover.de", text: "Yard tugs." }] }, criteria);

    expect(sent[0].messages[0].content).toBe(
      "Shared text:\nVolt Mover launched.\n\nShared LinkedIn company page: linkedin.com/company/volt-mover\n\nPage https://volt-mover.de:\nYard tugs.",
    );
  });

  test("reports no company, with its cost, when Claude refuses or gives no readable answer", async () => {
    const { client } = fakeClaude({ stop_reason: "refusal", parsed_output: null, usage });

    expect(await createClaudeCompanyReader(client).read(input, criteria)).toMatchObject({
      found: false,
      usage: { costUsd: expect.closeTo(0.00008, 10) },
    });
  });
});
