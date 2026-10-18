CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"decision_id" uuid,
	"claim" text NOT NULL,
	"probability" integer NOT NULL,
	"rationale" text NOT NULL,
	"made_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triage_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"startup_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"rationale" text,
	"decided_at" timestamp with time zone NOT NULL,
	"team_problem_fit" integer,
	"defensibility" integer,
	"market_timing" integer,
	"early_evidence" integer,
	"lane_fit" integer,
	"fundability" integer,
	"momentum" integer,
	CONSTRAINT "triage_decisions_startup_id_unique" UNIQUE("startup_id")
);
--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Existing startups keep their original clock instead of starting four new weeks at migration time.
UPDATE "startups" SET "status_changed_at" = "created_at";--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_decision_id_triage_decisions_id_fk" FOREIGN KEY ("decision_id") REFERENCES "public"."triage_decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triage_decisions" ADD CONSTRAINT "triage_decisions_startup_id_startups_id_fk" FOREIGN KEY ("startup_id") REFERENCES "public"."startups"("id") ON DELETE no action ON UPDATE no action;