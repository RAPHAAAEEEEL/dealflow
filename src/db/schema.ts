import { date, doublePrecision, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { Stage, StartupStatus } from "@/radar/radar";
import type { Lane } from "@/screening/types";
import type { Sighting } from "@/sighting";
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
    url: text("url").notNull(),
    payload: jsonb("payload").$type<Sighting>(), // null once discarded before Claude
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    screenedAt: timestamp("screened_at", { withTimezone: true }),
    screening: text("screening").$type<"signal" | "discarded">(),
    screeningReason: text("screening_reason"),
    screenedBy: text("screened_by"), // "stage-rule" or the Claude model
    criteriaVersion: integer("criteria_version"),
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
