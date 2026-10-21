import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { ownWebsite } from "@/radar/identity";
import { HAIKU, haikuUsage, LANE_OR_NULL } from "@/screening/claude-usage";
import type { Criteria } from "@/screening/types";
import type { StartupReader } from "./quick-add";

const PAGE_CHARS = 6000; // per page, enough for a homepage or an article's start

const answerFormat = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    found: { type: "boolean" },
    name: { type: "string" },
    website: { anyOf: [{ type: "string" }, { type: "null" }] },
    country: { type: "string" },
    city: { type: "string" },
    lane: LANE_OR_NULL,
    secondaryLane: LANE_OR_NULL,
    oneLiner: { type: "string" },
    stage: { type: "string", enum: ["Pre-round", "Pre-seed", "Seed"] },
    pastStageRule: { type: "boolean" },
    reason: { type: "string" },
  },
  required: ["found", "name", "website", "country", "city", "lane", "secondaryLane", "oneLiner", "stage", "pastStageRule", "reason"],
  additionalProperties: false,
});

function systemPrompt(criteria: Criteria) {
  return `The Owner of a private startup radar shared a link or some text, often from LinkedIn, because it may be about an early-stage startup. Work out which one company it is about, using only the facts given.

Never write the name of a person in any field. Describe a team, if at all, without names.

Answer with:
- found: false if the material names no company or you can't tell which one it is about; then explain why in reason and leave the other fields empty or null.
- name: the company's or product's name as it presents itself, without a legal form.
- website: the company's own website if the material gives it, else null. Never a LinkedIn address.
- country: the ISO 3166 two-letter code of its headquarters, such as DE, AT or CH, or "" if unknown.
- city: the city of its headquarters, or "" if unknown.
- lane: the Lane below it fits best, "robotics", "agents" or "manufacturing", even if the fit is loose; null only if it has nothing to do with any Lane.
- secondaryLane: a second Lane it clearly also fits, else null.
- oneLiner: one plain English sentence on what the company does, at most 15 words.
- stage: "Pre-round" if no funding is mentioned, "Pre-seed" or "Seed" if such a round is mentioned.
- pastStageRule: true if it raised more than about €3M, has a Series A, or was founded more than 3 years ago.
- reason: one sentence on how sure you are, and why pastStageRule is true if it is.

${criteria.text}`;
}

function userMessage({ text, pages, linkedinCompany }: Parameters<StartupReader["read"]>[0]) {
  return [
    text ? `Shared text:\n${text}` : "Shared text: (none)",
    linkedinCompany ? `Shared LinkedIn company page: linkedin.com/company/${linkedinCompany}` : "",
    ...pages.map((p) => `Page ${p.url}:\n${p.text.slice(0, PAGE_CHARS)}`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// Claude Haiku reads which company the Owner shared. Its answer is a draft the Owner confirms.
export function createClaudeStartupReader(client: Anthropic = new Anthropic()): StartupReader {
  return {
    async read(input, criteria) {
      const response = await client.messages.parse({
        model: HAIKU,
        max_tokens: 2048,
        output_config: { effort: "low", format: answerFormat },
        system: [{ type: "text", text: systemPrompt(criteria), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage(input) }],
      });
      const usage = haikuUsage(response.usage);
      const answer = response.parsed_output;
      if (response.stop_reason === "refusal" || !answer) {
        return { found: false, reason: "Claude gave no usable answer.", usage };
      }
      if (!answer.found || !answer.name.trim()) return { found: false, reason: answer.reason, usage };
      const website = ownWebsite(answer.website);
      const country = answer.country.trim().toUpperCase();
      return {
        found: true,
        name: answer.name.trim(),
        website,
        country: /^[A-Z]{2}$/.test(country) ? country : "",
        city: answer.city.trim(),
        lane: answer.lane,
        secondaryLane: answer.secondaryLane === answer.lane ? null : answer.secondaryLane,
        oneLiner: answer.oneLiner.trim(),
        stage: answer.stage,
        pastStageRule: answer.pastStageRule,
        reason: answer.reason,
        usage,
      };
    },
  };
}
