import { date, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Stage, StartupStatus } from "@/radar/radar";
import type { Lane } from "@/screening/types";
import type { Sighting } from "@/sighting";
import type { FeedsRunReport } from "@/jobs/feeds-job";
import type { ShabRunReport } from "@/jobs/shab-job";
import type { NearMissDecision } from "@/triage/near-misses";
import type { Claim, TriageDecision } from "@/triage/types";

// Terms follow CONTEXT.md. Founders' names are never stored (docs/adr/0003). Company names are
// public register data; Sightings that Screening discards before Claude keep no content at all,
// because a sole proprietorship's name contains its owner's surname.

export const startups = pgTable("startups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  lane: text("lane").$type<Lane>().notNull(),
  secondaryLane: text("secondary_lane").$type<Lane>(),
  stage: text("stage").$type<Stage>().notNull(),
  status: text("status").$type<StartupStatus>().notNull(),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
  priority: integer("priority").notNull(),
  hq: text("hq").notNull(),
  country: text("country").notNull(),
  oneLiner: text("one_liner").notNull(),
  website: text("website"), // the startup's own site, never a LinkedIn page
  firstSeen: date("first_seen").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const legalEntities = pgTable("legal_entities", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").notNull().references(() => startups.id),
  name: text("name").notNull(),
  uid: text("uid").unique(),
  legalForm: text("legal_form").notNull(),
  seat: text("seat").notNull(),
  registeredOn: date("registered_on"),
});

// Every raw publication a Source delivered, judged or not. Screening fills the last columns.
export const sightings = pgTable(
  "sightings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    publishedOn: date("published_on").notNull(),
    url: text("url"), // null when there is no link worth keeping, such as a LinkedIn profile
    payload: jsonb("payload").$type<Sighting>(), // null once discarded before Claude
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    screenedAt: timestamp("screened_at", { withTimezone: true }),
    screening: text("screening").$type<"signal" | "discarded">(),
    screeningReason: text("screening_reason"),
    screenedBy: text("screened_by"), // "stage-rule" or the Claude model
    criteriaVersion: integer("criteria_version"),
    // What Claude said about a Sighting it discarded, so a Near Miss can be shown and pulled in.
    nearestLane: text("nearest_lane").$type<Lane>(),
    closeness: integer("closeness"),
    oneLiner: text("one_liner"),
    // What Claude said about each startup an article names, kept as evidence for Proposals.
    mentions: jsonb("mentions").$type<{ name: string; inLane: boolean; lane: Lane | null; closeness: number; reason: string }[]>(),
    startupId: uuid("startup_id").references(() => startups.id),
  },
  (t) => [uniqueIndex("sightings_source_external_id").on(t.source, t.externalId)],
);

export const signals = pgTable("signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").notNull().references(() => startups.id),
  sightingId: uuid("sighting_id").references(() => sightings.id),
  date: date("date").notNull(),
  source: text("source").notNull(),
  text: text("text").notNull(),
  url: text("url"),
});

export const llmUsage = pgTable("llm_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  at: timestamp("at", { withTimezone: true }).notNull(),
  model: text("model").notNull(),
  purpose: text("purpose").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: doublePrecision("cost_usd").notNull(),
});

// The Owner's Triage decision on a startup, with the Scorecard captured alongside its Calls.
// Out of Scope decisions have no Scorecard.
export const triageDecisions = pgTable("triage_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").notNull().unique().references(() => startups.id),
  decision: text("decision").$type<TriageDecision>().notNull(),
  rationale: text("rationale"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
  teamProblemFit: integer("team_problem_fit"),
  defensibility: integer("defensibility"),
  marketTiming: integer("market_timing"),
  earlyEvidence: integer("early_evidence"),
  laneFit: integer("lane_fit"),
  fundability: integer("fundability"),
  momentum: integer("momentum"),
});

// The Owner's decision on a Near Miss: Screening should have kept it, or was right to discard it.
export const nearMissDecisions = pgTable("near_miss_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sightingId: uuid("sighting_id").notNull().unique().references(() => sightings.id),
  decision: text("decision").$type<NearMissDecision>().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
});

// Calls never change. A later Call on the same startup and Claim is a Revision (CONTEXT.md).
export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  startupId: uuid("startup_id").notNull().references(() => startups.id),
  decisionId: uuid("decision_id").references(() => triageDecisions.id),
  claim: text("claim").$type<Claim>().notNull(),
  probability: integer("probability").notNull(),
  rationale: text("rationale").notNull(),
  madeAt: timestamp("made_at", { withTimezone: true }).notNull(),
});

// One row per job run with its full report, including runs that broke off. Public CI logs show only
// counts (docs/adr/0007), so the details live here, for the Owner and the weekly status check.
export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").$type<"shab" | "feeds">().notNull(),
  publicationDate: date("publication_date").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }).notNull(),
  report: jsonb("report").$type<ShabRunReport | FeedsRunReport>().notNull(),
});
