import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { websiteDomain } from "@/radar/identity";
import { HAIKU, haikuUsage } from "./claude-usage";
import { JudgeError, LANES, type ArticleJudge, type Criteria } from "./types";

const laneOrNull = { anyOf: [{ type: "string", enum: LANES }, { type: "null" }] } as const;

const answerFormat = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    startups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          website: { anyOf: [{ type: "string" }, { type: "null" }] },
          country: { type: "string" },
          city: { type: "string" },
          inScope: { type: "boolean" },
          lane: laneOrNull,
          secondaryLane: laneOrNull,
          oneLiner: { type: "string" },
          signal: { type: "string" },
          stage: { type: "string", enum: ["Pre-round", "Pre-seed", "Seed"] },
          priority: { type: "integer" },
          closeness: { type: "integer" },
          reason: { type: "string" },
        },
        required: ["name", "website", "country", "city", "inScope", "lane", "secondaryLane", "oneLiner", "signal", "stage", "priority", "closeness", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["startups"],
  additionalProperties: false,
});

function systemPrompt(criteria: Criteria) {
  return `You screen articles from DACH startup news sites for a private startup radar. List every startup or young company the article presents or reports on, and judge each against the three Lanes and the Stage Rule defined below, using only the facts given. Leave out investors, corporates, universities, public bodies and service providers that are only mentioned in passing. An article about no startup gives an empty list.

Never write the name of a person in any field. Describe a team, if at all, without names.

For each startup:
- name: as it presents itself, without a legal form.
- website: its own website if the article gives it, else null.
- country: the ISO 3166 two-letter code of its headquarters, such as DE, AT or CH, or "" if unknown.
- city: the city of its headquarters, or "" if unknown.
- inScope: true only if it fits a Lane, could plausibly raise venture money, and passes the Stage Rule (founded at most 3 years ago, no announced round above about €3M, no Series A, headquarters or founding team in DACH).
- lane: the Lane it fits; when out of scope, the nearest Lane, or null when it has nothing to do with any Lane.
- secondaryLane: a second Lane it clearly also fits, else null. Always null when out of scope.
- oneLiner: one plain English sentence on what it does, at most 15 words.
- signal: one plain English sentence on what the article reports about it, such as a launch, a round with its size, or a first customer.
- stage: "Pre-round" if no funding is mentioned, else "Pre-seed" or "Seed".
- priority: 0 to 100, how soon the Owner should look at it in Triage, given how clearly it fits a Lane and how early it is. 0 when out of scope.
- closeness: for an out-of-scope startup, 0 to 100, how close it came to being in scope; 100 when in scope.
- reason: one sentence explaining the decision.

${criteria.text}`;
}

// Claude Haiku at low effort reads one article: a few dozen a week, well under a cent each.
// The system prompt carries the Screening Criteria and is cached across a run.
export function createClaudeArticleJudge(client: Anthropic = new Anthropic()): ArticleJudge {
  return {
    async judgeArticle({ source, title, text, url }, criteria) {
      const response = await client.messages.parse({
        model: HAIKU,
        max_tokens: 4096,
        output_config: { effort: "low", format: answerFormat },
        system: [{ type: "text", text: systemPrompt(criteria), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Source: ${source}\nTitle: ${title}\nURL: ${url}\n\n${text}` }],
      });
      const usage = haikuUsage(response.usage);
      if (response.stop_reason === "refusal") return { mentions: [], usage };
      const answer = response.parsed_output;
      if (!answer) throw new JudgeError(`No readable answer (stop reason: ${response.stop_reason})`, usage);
      return {
        mentions: answer.startups
          .filter((s) => s.name.trim())
          .map((s) => {
            const inLane = s.inScope && s.lane !== null;
            const country = s.country.trim().toUpperCase();
            return {
              name: s.name.trim(),
              website: s.website && websiteDomain(s.website) ? (/^https?:\/\//i.test(s.website) ? s.website : `https://${s.website}`) : null,
              country: /^[A-Z]{2}$/.test(country) ? country : "",
              city: s.city.trim(),
              inLane,
              lane: s.lane,
              secondaryLane: inLane && s.secondaryLane !== s.lane ? s.secondaryLane : null,
              oneLiner: s.oneLiner.trim(),
              signal: s.signal.trim(),
              stage: s.stage,
              priority: inLane ? clampPercent(s.priority) : 0,
              closeness: inLane ? 100 : s.lane === null ? 0 : clampPercent(s.closeness),
              reason: s.reason,
            };
          }),
        usage,
      };
    },
  };
}

const clampPercent = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
