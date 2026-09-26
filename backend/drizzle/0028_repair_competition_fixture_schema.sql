-- Repair migration for databases whose migration history records 0027 as applied
-- even though the competition fixture/settings schema is missing.
-- Safe to run after 0027: objects are created only when missing, while functions
-- and triggers are refreshed to the current definitions.

-- Restore result-tracking prerequisites skipped by divergent branch timestamps.
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "result_tracking_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_competition_team_id" uuid;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competition_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid NOT NULL,
  "home_competition_team_id" uuid NOT NULL,
  "away_competition_team_id" uuid NOT NULL,
  "home_score" integer DEFAULT 0 NOT NULL,
  "away_score" integer DEFAULT 0 NOT NULL,
  "played_at" timestamp with time zone NOT NULL,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_competition_team_id_competition_teams_id_fk" FOREIGN KEY ("opponent_competition_team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_home_competition_team_id_competition_teams_id_fk" FOREIGN KEY ("home_competition_team_id") REFERENCES "public"."competition_teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_away_competition_team_id_competition_teams_id_fk" FOREIGN KEY ("away_competition_team_id") REFERENCES "public"."competition_teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_opponent_competition_team_id_index" ON "matches" USING btree ("opponent_competition_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competition_matches_competition_id_index" ON "competition_matches" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competition_matches_home_team_id_index" ON "competition_matches" USING btree ("home_competition_team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competition_matches_away_team_id_index" ON "competition_matches" USING btree ("away_competition_team_id");--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_format') THEN
    CREATE TYPE "public"."competition_format" AS ENUM ('league', 'knockout', 'league_knockout');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_fixture_stage') THEN
    CREATE TYPE "public"."competition_fixture_stage" AS ENUM ('league', 'knockout');
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'competition_fixture_status') THEN
    CREATE TYPE "public"."competition_fixture_status" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "competition_fixtures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid NOT NULL,
  "stage" "competition_fixture_stage" NOT NULL,
  "round" integer NOT NULL,
  "position" integer NOT NULL,
  "home_competition_team_id" uuid,
  "away_competition_team_id" uuid,
  "scheduled_at" timestamp with time zone NOT NULL,
  "status" "competition_fixture_status" DEFAULT 'scheduled' NOT NULL,
  "home_score" integer,
  "away_score" integer,
  "home_penalty_score" integer,
  "away_penalty_score" integer,
  "winner_competition_team_id" uuid,
  "next_fixture_id" uuid,
  "next_fixture_slot" text,
  "linked_match_id" uuid,
  "legacy_result_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "format" "competition_format";
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "configured_team_count" integer;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "max_substitutes" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "red_card_suspension_matches" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "accumulated_yellow_threshold" integer DEFAULT 5 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "yellow_suspension_matches" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "start_date" date;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "allowed_playing_days" integer[] DEFAULT ARRAY[6]::integer[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "default_kickoff_time" text DEFAULT '15:00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "fixtures_per_opponent" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "points_win" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "points_draw" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "points_loss" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "qualifier_count" integer;
--> statement-breakpoint

-- If a partial/older fixture table exists, fill in any missing columns as well.
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "competition_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "stage" "competition_fixture_stage";
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "round" integer;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "position" integer;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "home_competition_team_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "away_competition_team_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "scheduled_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "status" "competition_fixture_status" DEFAULT 'scheduled';
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "home_score" integer;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "away_score" integer;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "home_penalty_score" integer;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "away_penalty_score" integer;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "winner_competition_team_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "next_fixture_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "next_fixture_slot" text;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "linked_match_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "legacy_result_id" uuid;
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "competition_fixtures_competition_id_id_unique"
  ON "competition_fixtures" USING btree ("competition_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_teams_competition_id_id_unique"
  ON "competition_teams" USING btree ("competition_id", "id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_fixtures_round_position_unique"
  ON "competition_fixtures" USING btree ("competition_id", "stage", "round", "position");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_fixtures_pair_unique"
  ON "competition_fixtures" USING btree ("competition_id", "stage", "home_competition_team_id", "away_competition_team_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_fixtures_next_slot_unique"
  ON "competition_fixtures" USING btree ("next_fixture_id", "next_fixture_slot");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_fixtures_linked_match_unique"
  ON "competition_fixtures" USING btree ("linked_match_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_fixtures_legacy_result_unique"
  ON "competition_fixtures" USING btree ("legacy_result_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_competition_id_competitions_id_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_competition_id_competitions_id_fk"
      FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_linked_match_id_matches_id_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_linked_match_id_matches_id_fk"
      FOREIGN KEY ("linked_match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_legacy_result_id_competition_matches_id_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_legacy_result_id_competition_matches_id_fk"
      FOREIGN KEY ("legacy_result_id") REFERENCES "public"."competition_matches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_home_participant_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_home_participant_fk"
      FOREIGN KEY ("competition_id", "home_competition_team_id")
      REFERENCES "public"."competition_teams"("competition_id", "id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_away_participant_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_away_participant_fk"
      FOREIGN KEY ("competition_id", "away_competition_team_id")
      REFERENCES "public"."competition_teams"("competition_id", "id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_winner_participant_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_winner_participant_fk"
      FOREIGN KEY ("competition_id", "winner_competition_team_id")
      REFERENCES "public"."competition_teams"("competition_id", "id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_next_fixture_fk'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures"
      ADD CONSTRAINT "competition_fixtures_next_fixture_fk"
      FOREIGN KEY ("competition_id", "next_fixture_id")
      REFERENCES "public"."competition_fixtures"("competition_id", "id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competition_fixtures_valid'
      AND conrelid = 'competition_fixtures'::regclass
  ) THEN
    ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_valid" CHECK (
      "round" > 0 and "position" > 0
      and ("home_competition_team_id" is null or "away_competition_team_id" is null or "home_competition_team_id" <> "away_competition_team_id")
      and ("stage" = 'knockout' or ("home_competition_team_id" is not null and "away_competition_team_id" is not null and "next_fixture_id" is null))
      and (("next_fixture_id" is null and "next_fixture_slot" is null) or ("next_fixture_id" is not null and "next_fixture_id" <> "id" and "next_fixture_slot" is not null and "next_fixture_slot" in ('home','away')))
      and (("home_score" is null and "away_score" is null) or ("home_score" between 0 and 99 and "away_score" between 0 and 99 and "home_score" is not null and "away_score" is not null))
      and (("home_penalty_score" is null and "away_penalty_score" is null) or ("stage" = 'knockout' and "home_penalty_score" between 0 and 99 and "away_penalty_score" between 0 and 99 and "home_penalty_score" is not null and "away_penalty_score" is not null))
      and ("winner_competition_team_id" is null or ("home_competition_team_id" is not null and "away_competition_team_id" is not null and "winner_competition_team_id" in ("home_competition_team_id", "away_competition_team_id")))
      and ("status" <> 'completed' or ("home_competition_team_id" is not null and "away_competition_team_id" is not null and "home_score" is not null and "away_score" is not null and ("stage" <> 'knockout' or "winner_competition_team_id" is not null)))
    );
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'competitions_settings_valid'
      AND conrelid = 'competitions'::regclass
  ) THEN
    ALTER TABLE "competitions" ADD CONSTRAINT "competitions_settings_valid" CHECK (
      ("configured_team_count" is null or "configured_team_count" between 2 and 128)
      and "max_substitutes" between 0 and 99
      and "red_card_suspension_matches" between 0 and 99
      and "accumulated_yellow_threshold" between 1 and 99
      and "yellow_suspension_matches" between 0 and 99
      and cardinality("allowed_playing_days") between 1 and 7
      and "allowed_playing_days" <@ ARRAY[0,1,2,3,4,5,6]::integer[]
      and array_position("allowed_playing_days", null) is null
      and "default_kickoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and "fixtures_per_opponent" in (1,2)
      and "points_win" between 0 and 99 and "points_draw" between 0 and 99 and "points_loss" between 0 and 99
      and ("format" is null or ("type" = 'league' and "format" = 'league') or ("type" = 'cup' and "format" in ('knockout','league_knockout')))
      and ("format" is distinct from 'knockout' or "configured_team_count" is null or "configured_team_count" in (4,8,16,32))
      and ("qualifier_count" is null or ("format" is not null and "format" = 'league_knockout' and "qualifier_count" in (4,8,16,32) and "configured_team_count" is not null and "qualifier_count" <= "configured_team_count"))
    );
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION competition_has_recorded_activity(p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM competition_matches WHERE competition_id = p_id)
    OR EXISTS (SELECT 1 FROM matches WHERE competition_id = p_id)
    OR EXISTS (SELECT 1 FROM standings WHERE competition_id = p_id AND
      (played <> 0 OR points <> 0 OR goals_for <> 0 OR goals_against <> 0 OR won <> 0 OR drawn <> 0 OR lost <> 0))
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_competition_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.type = 'friendly' AND NEW.type = 'friendly' THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - ARRAY['name','season','season_id','updated_at','admin_user_id','result_tracking_started_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['name','season','season_id','updated_at','admin_user_id','result_tracking_started_at'])
     AND (EXISTS (SELECT 1 FROM competition_fixtures WHERE competition_id = OLD.id)
          OR competition_has_recorded_activity(OLD.id)) THEN
    RAISE EXCEPTION 'Structural settings cannot change after fixtures or results exist.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_settings_guard ON competitions;
--> statement-breakpoint
CREATE TRIGGER competition_settings_guard BEFORE UPDATE ON competitions
FOR EACH ROW EXECUTE FUNCTION guard_competition_settings();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_competition_roster() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.competition_id = OLD.competition_id AND NEW.id = OLD.id THEN RETURN NEW; END IF;
  p_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.competition_id ELSE NEW.competition_id END;
  PERFORM 1 FROM competitions WHERE id = p_id FOR UPDATE;
  IF FOUND AND EXISTS (SELECT 1 FROM competition_fixtures WHERE competition_id = p_id) THEN
    RAISE EXCEPTION 'Participants cannot be added or removed after fixtures are generated.';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    PERFORM 1 FROM competitions WHERE id = OLD.competition_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM competition_fixtures WHERE competition_id = OLD.competition_id) THEN
      RAISE EXCEPTION 'Participants cannot move after fixtures are generated.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_roster_guard ON competition_teams;
--> statement-breakpoint
CREATE TRIGGER competition_roster_guard BEFORE INSERT OR UPDATE OR DELETE ON competition_teams
FOR EACH ROW EXECUTE FUNCTION guard_competition_roster();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION lock_competition_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM competitions WHERE id = NEW.competition_id FOR UPDATE;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_result_lock ON competition_matches;
--> statement-breakpoint
CREATE TRIGGER competition_result_lock BEFORE INSERT OR UPDATE ON competition_matches
FOR EACH ROW EXECUTE FUNCTION lock_competition_activity();
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_match_lock ON matches;
--> statement-breakpoint
CREATE TRIGGER competition_match_lock BEFORE INSERT OR UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION lock_competition_activity();
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_standing_lock ON standings;
--> statement-breakpoint
CREATE TRIGGER competition_standing_lock BEFORE INSERT OR UPDATE ON standings
FOR EACH ROW EXECUTE FUNCTION lock_competition_activity();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_competition_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM competitions WHERE id = NEW.competition_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM competition_fixtures f WHERE f.competition_id = NEW.competition_id
      AND f.stage = NEW.stage AND f.round = NEW.round AND f.id <> NEW.id
      AND (f.home_competition_team_id IN (NEW.home_competition_team_id, NEW.away_competition_team_id)
        OR f.away_competition_team_id IN (NEW.home_competition_team_id, NEW.away_competition_team_id))) THEN
    RAISE EXCEPTION 'A participant cannot play twice in the same round.';
  END IF;
  IF NEW.linked_match_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM matches WHERE id = NEW.linked_match_id AND competition_id = NEW.competition_id) THEN
    RAISE EXCEPTION 'Linked match must belong to the same competition.';
  END IF;
  IF NEW.legacy_result_id IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM competition_matches WHERE id = NEW.legacy_result_id AND competition_id = NEW.competition_id) THEN
    RAISE EXCEPTION 'Linked result must belong to the same competition.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_fixture_guard ON competition_fixtures;
--> statement-breakpoint
CREATE TRIGGER competition_fixture_guard BEFORE INSERT OR UPDATE ON competition_fixtures
FOR EACH ROW EXECUTE FUNCTION guard_competition_fixture();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION guard_fixture_progression() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.next_fixture_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM competition_fixtures f WHERE f.id = NEW.next_fixture_id
      AND f.competition_id = NEW.competition_id AND f.stage = 'knockout'
      AND NEW.stage = 'knockout' AND f.round = NEW.round + 1
  ) THEN RAISE EXCEPTION 'Knockout winners must advance to the next round of the same competition.'; END IF;
  IF EXISTS (SELECT 1 FROM competition_fixtures f WHERE f.next_fixture_id = NEW.id
    AND (f.round + 1 <> NEW.round OR NEW.stage <> 'knockout')) THEN
    RAISE EXCEPTION 'Invalid knockout feeder round.';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS competition_fixture_progression_guard ON competition_fixtures;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER competition_fixture_progression_guard AFTER INSERT OR UPDATE ON competition_fixtures
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_fixture_progression();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION generate_competition_fixtures(p_id uuid, p_user text, p_settings jsonb,
  p_participants jsonb, p_plan jsonb, p_regenerate boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE c competitions%ROWTYPE; actual_ids jsonb;
BEGIN
  SELECT * INTO c FROM competitions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR c.admin_user_id IS DISTINCT FROM p_user THEN RAISE EXCEPTION 'Competition not found.'; END IF;
  IF c.type = 'friendly' THEN RAISE EXCEPTION 'Friendly matches do not use fixture generation.'; END IF;
  IF NOT (to_jsonb(c) @> p_settings) THEN RAISE EXCEPTION 'Settings changed. Retry fixture generation.'; END IF;
  SELECT jsonb_agg(id::text ORDER BY id::text) INTO actual_ids FROM competition_teams WHERE competition_id = p_id;
  IF c.configured_team_count IS NULL OR jsonb_array_length(coalesce(actual_ids, '[]')) <> c.configured_team_count THEN
    RAISE EXCEPTION 'Participant count must exactly equal the configured team count.';
  END IF;
  IF actual_ids IS DISTINCT FROM (SELECT jsonb_agg(value ORDER BY value) FROM jsonb_array_elements_text(p_participants)) THEN
    RAISE EXCEPTION 'Participants changed. Retry fixture generation.';
  END IF;
  IF EXISTS (SELECT 1 FROM competition_fixtures WHERE competition_id = p_id) AND NOT p_regenerate THEN
    RAISE EXCEPTION 'Fixtures already exist. Request safe regeneration explicitly.';
  END IF;
  IF competition_has_recorded_activity(p_id) OR EXISTS (
    SELECT 1 FROM competition_fixtures WHERE competition_id = p_id AND
      (status <> 'scheduled' OR home_score IS NOT NULL OR away_score IS NOT NULL
       OR home_penalty_score IS NOT NULL OR away_penalty_score IS NOT NULL
       OR winner_competition_team_id IS NOT NULL OR linked_match_id IS NOT NULL OR legacy_result_id IS NOT NULL)
  ) THEN RAISE EXCEPTION 'Generation is unsafe because matches or results already exist.'; END IF;
  IF jsonb_array_length(p_plan) = 0 THEN RAISE EXCEPTION 'Fixture plan cannot be empty.'; END IF;
  DELETE FROM competition_fixtures WHERE competition_id = p_id;
  INSERT INTO competition_fixtures (id, competition_id, stage, round, position,
    home_competition_team_id, away_competition_team_id, scheduled_at, next_fixture_id, next_fixture_slot)
  SELECT id, p_id, stage::competition_fixture_stage, round, position,
    "homeCompetitionTeamId", "awayCompetitionTeamId", "scheduledAt", "nextFixtureId", "nextFixtureSlot"
  FROM jsonb_to_recordset(p_plan) AS f(id uuid, stage text, round integer, position integer,
    "homeCompetitionTeamId" uuid, "awayCompetitionTeamId" uuid, "scheduledAt" timestamptz,
    "nextFixtureId" uuid, "nextFixtureSlot" text);
END $$;
