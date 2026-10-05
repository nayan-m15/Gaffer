ALTER TABLE "events" ADD COLUMN "venue_name" text;
--> statement-breakpoint
UPDATE "events"
SET "weather_location" = NULL,
    "latitude" = NULL,
    "longitude" = NULL,
    "timezone" = NULL
WHERE "weather_location" IS NOT NULL
  AND "weather_location" <> "location"
  AND substring("weather_location" from 1 for length("location") + 1) <> "location" || ',';
