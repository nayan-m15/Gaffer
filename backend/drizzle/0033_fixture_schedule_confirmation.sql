-- Generated competition dates are proposals until the participating teams
-- agree. Linked Gaffer coaches accept/propose dates themselves; competition
-- admins may record agreement or proposals on behalf of unlinked teams.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'competition_fixture_schedule_response'
  ) THEN
    CREATE TYPE "public"."competition_fixture_schedule_response" AS ENUM (
      'pending',
      'accepted',
      'external_confirmed'
    );
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "schedule_revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "home_schedule_response" "competition_fixture_schedule_response" DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "away_schedule_response" "competition_fixture_schedule_response" DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "home_schedule_responded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "away_schedule_responded_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "home_schedule_responded_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "away_schedule_responded_by_user_id" text;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "schedule_proposed_by_competition_team_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "schedule_proposal_note" text;
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD COLUMN IF NOT EXISTS "schedule_confirmed_at" timestamp with time zone;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_home_schedule_user_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_home_schedule_user_fk"
      FOREIGN KEY ("home_schedule_responded_by_user_id")
      REFERENCES "public"."user"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_away_schedule_user_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_away_schedule_user_fk"
      FOREIGN KEY ("away_schedule_responded_by_user_id")
      REFERENCES "public"."user"("id")
      ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_schedule_proposer_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_schedule_proposer_fk"
      FOREIGN KEY ("competition_id", "schedule_proposed_by_competition_team_id")
      REFERENCES "public"."competition_teams"("competition_id", "id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- Keep the existing integrity checks and extend them to schedule confirmation.
ALTER TABLE "competition_fixtures"
  DROP CONSTRAINT IF EXISTS "competition_fixtures_valid";
--> statement-breakpoint
ALTER TABLE "competition_fixtures"
  ADD CONSTRAINT "competition_fixtures_valid" CHECK (
    "round" > 0 and "position" > 0
    and ("home_competition_team_id" is null or "away_competition_team_id" is null or "home_competition_team_id" <> "away_competition_team_id")
    and ("stage" = 'knockout' or ("home_competition_team_id" is not null and "away_competition_team_id" is not null and "next_fixture_id" is null))
    and (("next_fixture_id" is null and "next_fixture_slot" is null) or ("next_fixture_id" is not null and "next_fixture_id" <> "id" and "next_fixture_slot" is not null and "next_fixture_slot" in ('home','away')))
    and (("home_score" is null and "away_score" is null) or ("home_score" between 0 and 99 and "away_score" between 0 and 99 and "home_score" is not null and "away_score" is not null))
    and (("home_penalty_score" is null and "away_penalty_score" is null) or ("stage" = 'knockout' and "home_penalty_score" between 0 and 99 and "away_penalty_score" between 0 and 99 and "home_penalty_score" is not null and "away_penalty_score" is not null))
    and ("winner_competition_team_id" is null or ("home_competition_team_id" is not null and "away_competition_team_id" is not null and "winner_competition_team_id" in ("home_competition_team_id", "away_competition_team_id")))
    and "schedule_revision" > 0
    and ("schedule_proposed_by_competition_team_id" is null or ("home_competition_team_id" is not null and "schedule_proposed_by_competition_team_id" = "home_competition_team_id") or ("away_competition_team_id" is not null and "schedule_proposed_by_competition_team_id" = "away_competition_team_id"))
    and ("schedule_confirmed_at" is null or ("home_schedule_response" in ('accepted','external_confirmed') and "away_schedule_response" in ('accepted','external_confirmed')))
    and ("status" <> 'completed' or ("home_competition_team_id" is not null and "away_competition_team_id" is not null and "home_score" is not null and "away_score" is not null and ("stage" <> 'knockout' or "winner_competition_team_id" is not null)))
  );
--> statement-breakpoint

-- Knockout progression changes participant slots after a result. Any old date
-- agreement is invalid once the matchup changes. Likewise, an unexpected raw
-- scheduled_at change must create a fresh revision and reset both responses.
CREATE OR REPLACE FUNCTION reset_competition_fixture_schedule_confirmation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.home_competition_team_id IS DISTINCT FROM NEW.home_competition_team_id
     OR OLD.away_competition_team_id IS DISTINCT FROM NEW.away_competition_team_id THEN
    NEW.schedule_revision := OLD.schedule_revision + 1;
    NEW.home_schedule_response := 'pending';
    NEW.away_schedule_response := 'pending';
    NEW.home_schedule_responded_at := NULL;
    NEW.away_schedule_responded_at := NULL;
    NEW.home_schedule_responded_by_user_id := NULL;
    NEW.away_schedule_responded_by_user_id := NULL;
    NEW.schedule_confirmed_at := NULL;
    NEW.schedule_proposed_by_competition_team_id := NULL;
    NEW.schedule_proposal_note := NULL;
  END IF;

  IF OLD.scheduled_at IS DISTINCT FROM NEW.scheduled_at
     AND NEW.schedule_revision = OLD.schedule_revision THEN
    NEW.schedule_revision := OLD.schedule_revision + 1;
    NEW.home_schedule_response := 'pending';
    NEW.away_schedule_response := 'pending';
    NEW.home_schedule_responded_at := NULL;
    NEW.away_schedule_responded_at := NULL;
    NEW.home_schedule_responded_by_user_id := NULL;
    NEW.away_schedule_responded_by_user_id := NULL;
    NEW.schedule_confirmed_at := NULL;
    NEW.schedule_proposed_by_competition_team_id := NULL;
    NEW.schedule_proposal_note := NULL;
  END IF;

  -- The agreement timestamp is derived from the two current responses rather
  -- than trusted from application code. This also closes the race where both
  -- coaches accept the same revision at nearly the same time.
  IF NEW.home_schedule_response IN ('accepted', 'external_confirmed')
     AND NEW.away_schedule_response IN ('accepted', 'external_confirmed') THEN
    NEW.schedule_confirmed_at := coalesce(NEW.schedule_confirmed_at, now());
  ELSE
    NEW.schedule_confirmed_at := NULL;
  END IF;

  RETURN NEW;
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS competition_fixture_schedule_reset ON competition_fixtures;
--> statement-breakpoint
CREATE TRIGGER competition_fixture_schedule_reset
BEFORE UPDATE OF home_competition_team_id, away_competition_team_id, scheduled_at, home_schedule_response, away_schedule_response
ON competition_fixtures
FOR EACH ROW EXECUTE FUNCTION reset_competition_fixture_schedule_confirmation();
