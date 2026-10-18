import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type { Sighting } from "@/sighting";
import { JudgeError, LANES, type Criteria, type Judge } from "./types";

export const SCREENING_MODEL = "claude-haiku-5-5";

// USD per million tokens for prompts up to 100K tokens, from the Claude API reference (2026-10).
const PRICE = { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 };

const laneOrNull = { anyOf: [{ type: "string", enum: LANES }, { type: "null" }] } as const;

const answerFormat = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    inScope: { type: "boolean" },
    lane: laneOrNull,
    secondaryLane: laneOrNull,
    oneLiner: { type: "string" },
    priority: { type: "integer" },
    closeness: { type: "integer" },
    reason: { type: "string" },
  },
  required: ["inScope", "lane", "secondaryLane", "oneLiner", "priority", "closeness", "reason"],
  additionalProperties: false,
});

const clampPercent = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function systemPrompt(criteria: Criteria) {
  return `You screen new Swiss commercial-register entries for a private startup radar. For each entry, decide whether it is plausibly a venture-backable startup in one of the three Lanes defined below, using only the facts given.

Swiss purpose clauses usually end with boilerplate (holding stakes, buying property, branches, financing). Ignore it and judge what the company actually sets out to do. Most new entries are ordinary businesses; when the purpose is vague, generic or missing, the entry is out of scope.

Answer with:
- inScope: true only if the entry fits a Lane and could plausibly raise venture money.
- lane: "robotics" (Specialised Robotics), "agents" (Enterprise Agents) or "manufacturing" (Deep-Tech Manufacturing). When out of scope, the nearest Lane, or null when the entry has nothing to do with any Lane.
- secondaryLane: a second Lane it clearly also fits, else null. Always null when out of scope.
- oneLiner: one plain English sentence on what the company does, at most 15 words.
- priority: 0 to 100, how soon the Owner should look at it in Triage, given how clearly it fits a Lane and how much it looks like an early venture rather than an ordinary business. This orders a queue; it is not an investment judgement. 0 when out of scope.
- closeness: only for an out-of-scope entry, 0 to 100, how close it came to being in scope. 0 for an ordinary business unrelated to the Lanes; above 50 only when the entry touches a Lane and a single point of the criteria kept it out, such as offering services around its own technology. 100 when in scope.
- reason: one sentence explaining the decision.

${criteria.text}`;
}

function userMessage({ legalEntity, publishedOn }: Sighting) {
  const capital = legalEntity.capitalChf === null ? "unknown" : `CHF ${legalEntity.capitalChf}`;
  return `Name: ${legalEntity.name}
Legal form: ${legalEntity.legalForm}
Seat: ${legalEntity.seat}
Registered: ${publishedOn}
Share capital: ${capital}
Purpose: ${legalEntity.purpose || "(none given)"}`;
}

// Claude Haiku 5.5 at low effort: a short judgement that stays cheap at ~140 entries a working day.
// The system prompt carries the Screening Criteria and is cached across a run.
export function createClaudeJudge(client: Anthropic = new Anthropic()): Judge {
  return {
    async judge(sighting, criteria) {
      const response = await client.messages.parse({
        model: SCREENING_MODEL,
        max_tokens: 2048,
        output_config: { effort: "low", format: answerFormat },
        system: [{ type: "text", text: systemPrompt(criteria), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage(sighting) }],
      });

      const u = response.usage;
      const cacheWrite = u.cache_creation_input_tokens ?? 0;
      const cacheRead = u.cache_read_input_tokens ?? 0;
      const usage = {
        model: SCREENING_MODEL,
        inputTokens: u.input_tokens + cacheWrite + cacheRead,
        outputTokens: u.output_tokens,
        costUsd:
          (u.input_tokens * PRICE.input + cacheWrite * PRICE.cacheWrite + cacheRead * PRICE.cacheRead + u.output_tokens * PRICE.output) /
          1_000_000,
      };

      if (response.stop_reason === "refusal") {
        const category = response.stop_details?.category ?? "no category";
        return {
          inLane: false,
          nearestLane: null,
          closeness: 0,
          oneLiner: "",
          reason: `Claude declined to judge this entry (${category}).`,
          usage,
        };
      }
      const answer = response.parsed_output;
      if (!answer) throw new JudgeError(`No readable answer (stop reason: ${response.stop_reason})`, usage);
      if (!answer.inScope || answer.lane === null) {
        return {
          inLane: false,
          nearestLane: answer.lane,
          closeness: answer.lane === null ? 0 : clampPercent(answer.closeness),
          oneLiner: answer.oneLiner,
          reason: answer.reason,
          usage,
        };
      }
      return {
        inLane: true,
        lane: answer.lane,
        secondaryLane: answer.secondaryLane === answer.lane ? null : answer.secondaryLane,
        oneLiner: answer.oneLiner,
        priority: clampPercent(answer.priority),
        reason: answer.reason,
        usage,
      };
    },
  };
}
