ALTER TABLE "sightings" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "startups" ADD COLUMN "website" text;--> statement-breakpoint
UPDATE "signals" SET "url" = "sightings"."url" FROM "sightings" WHERE "signals"."sighting_id" = "sightings"."id";
