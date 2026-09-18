ALTER TABLE "events" ADD COLUMN "weather_location" text;--> statement-breakpoint
UPDATE "events"
SET "weather_location" = "venue_address"
WHERE "latitude" IS NOT NULL AND "longitude" IS NOT NULL;--> statement-breakpoint
UPDATE "events" SET "venue_address" = NULL;
