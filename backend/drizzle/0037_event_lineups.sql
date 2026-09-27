-- Confirmed pre-match lineup per event. Confirming a lineup becomes its own
-- step (PUT /events/:eventId/lineup) separate from starting the match: the
-- stored XI/bench lets an accepted Gaffer friendly opponent see the confirmed
-- lineup before kickoff. startMatch keeps writing athlete_match_stats and
-- clears this row once the match exists, so the live match squad stays the
-- single source for everything after kickoff.

CREATE TABLE IF NOT EXISTS "event_lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"starting_athlete_ids" jsonb NOT NULL,
	"bench_athlete_ids" jsonb NOT NULL,
	"confirmed_by_user_id" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_lineups_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_lineups_event_id_events_id_fk' AND conrelid = 'event_lineups'::regclass) THEN
    ALTER TABLE "event_lineups" ADD CONSTRAINT "event_lineups_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_lineups_team_id_teams_id_fk' AND conrelid = 'event_lineups'::regclass) THEN
    ALTER TABLE "event_lineups" ADD CONSTRAINT "event_lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_lineups_confirmed_by_user_id_user_id_fk' AND conrelid = 'event_lineups'::regclass) THEN
    ALTER TABLE "event_lineups" ADD CONSTRAINT "event_lineups_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_lineups_team_id_index" ON "event_lineups" USING btree ("team_id");
