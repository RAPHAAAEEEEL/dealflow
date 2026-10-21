import type Anthropic from "@anthropic-ai/sdk";
import type { Usage } from "./types";

// Every unattended Claude call uses Haiku 5.5, under the hard monthly cap (docs/adr/0005).
export const HAIKU = "claude-haiku-5-5";

// USD per million tokens for prompts up to 100K tokens, from the Claude API reference (2026-10).
const PRICE = { input: 0.1, cacheWrite: 0.125, cacheRead: 0.01, output: 0.5 };

// What one Haiku call cost, cache reads and writes included.
export function haikuUsage(u: Anthropic.Usage): Usage {
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  return {
    model: HAIKU,
    inputTokens: u.input_tokens + cacheWrite + cacheRead,
    outputTokens: u.output_tokens,
    costUsd:
      (u.input_tokens * PRICE.input + cacheWrite * PRICE.cacheWrite + cacheRead * PRICE.cacheRead + u.output_tokens * PRICE.output) / 1_000_000,
  };
}
