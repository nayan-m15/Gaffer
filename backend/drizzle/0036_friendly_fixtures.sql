-- Friendly fixtures: agree a match between two Gaffer teams outside of a
-- league/cup competition. The requesting coach creates the fixture request;
-- the opponent coach accepts or declines it. Once accepted, both teams' events
-- link back to the same friendly_fixtures row (events.friendly_fixture_id), so
-- the two calendars always describe one shared match instead of unrelated
-- duplicates. The generated competition fixture pipeline
-- (events.competition_fixture_id) is untouched and stays fully separate.

DO $$ BEGIN
  CREATE TYPE "public"."friendly_fixture_status" AS ENUM('pending', 'accepted', 'declined', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "friendly_fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_team_id" uuid NOT NULL,
	"opponent_team_id" uuid NOT NULL,
	"status" "friendly_fixture_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"responded_by_user_id" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "friendly_fixture_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_team_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'friendly_fixtures_requester_team_id_teams_id_fk' AND conrelid = 'friendly_fixtures'::regclass) THEN
    ALTER TABLE "friendly_fixtures" ADD CONSTRAINT "friendly_fixtures_requester_team_id_teams_id_fk" FOREIGN KEY ("requester_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'friendly_fixtures_opponent_team_id_teams_id_fk' AND conrelid = 'friendly_fixtures'::regclass) THEN
    ALTER TABLE "friendly_fixtures" ADD CONSTRAINT "friendly_fixtures_opponent_team_id_teams_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'friendly_fixtures_created_by_user_id_user_id_fk' AND conrelid = 'friendly_fixtures'::regclass) THEN
    ALTER TABLE "friendly_fixtures" ADD CONSTRAINT "friendly_fixtures_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'friendly_fixtures_responded_by_user_id_user_id_fk' AND conrelid = 'friendly_fixtures'::regclass) THEN
    ALTER TABLE "friendly_fixtures" ADD CONSTRAINT "friendly_fixtures_responded_by_user_id_user_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_friendly_fixture_id_friendly_fixtures_id_fk' AND conrelid = 'events'::regclass) THEN
    ALTER TABLE "events" ADD CONSTRAINT "events_friendly_fixture_id_friendly_fixtures_id_fk" FOREIGN KEY ("friendly_fixture_id") REFERENCES "public"."friendly_fixtures"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'matches_opponent_team_id_teams_id_fk' AND conrelid = 'matches'::regclass) THEN
    ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_team_id_teams_id_fk" FOREIGN KEY ("opponent_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendly_fixtures_requester_team_id_index" ON "friendly_fixtures" USING btree ("requester_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendly_fixtures_opponent_team_id_index" ON "friendly_fixtures" USING btree ("opponent_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "friendly_fixtures_opponent_status_index" ON "friendly_fixtures" USING btree ("opponent_team_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_friendly_fixture_id_index" ON "events" USING btree ("friendly_fixture_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "events_team_friendly_fixture_unique" ON "events" USING btree ("team_id","friendly_fixture_id") WHERE "events"."friendly_fixture_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_opponent_team_id_index" ON "matches" USING btree ("opponent_team_id");
