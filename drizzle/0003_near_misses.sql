CREATE TABLE "near_miss_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sighting_id" uuid NOT NULL,
	"verdict" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "near_miss_reviews_sighting_id_unique" UNIQUE("sighting_id")
);
--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "nearest_lane" text;--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "closeness" integer;--> statement-breakpoint
ALTER TABLE "sightings" ADD COLUMN "one_liner" text;--> statement-breakpoint
ALTER TABLE "near_miss_reviews" ADD CONSTRAINT "near_miss_reviews_sighting_id_sightings_id_fk" FOREIGN KEY ("sighting_id") REFERENCES "public"."sightings"("id") ON DELETE no action ON UPDATE no action;