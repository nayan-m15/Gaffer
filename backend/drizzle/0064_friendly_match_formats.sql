ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "friendly_players_per_side" integer;
--> statement-breakpoint
UPDATE "events" SET "friendly_players_per_side" = 11 WHERE "type" = 'match' AND "competition_id" IS NULL AND "friendly_players_per_side" IS NULL;
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_friendly_players_per_side_check" CHECK ("friendly_players_per_side" IS NULL OR "friendly_players_per_side" IN (5, 7, 11));
