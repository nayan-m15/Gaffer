CREATE TYPE "public"."competition_format" AS ENUM('league', 'knockout', 'league_knockout');--> statement-breakpoint
CREATE TYPE "public"."competition_fixture_stage" AS ENUM('league', 'knockout');--> statement-breakpoint
CREATE TYPE "public"."competition_fixture_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "competition_fixtures" (
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
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "competition_fixtures_valid" CHECK (
    "competition_fixtures"."round" > 0 and "competition_fixtures"."position" > 0
    and ("competition_fixtures"."home_competition_team_id" is null or "competition_fixtures"."away_competition_team_id" is null or "competition_fixtures"."home_competition_team_id" <> "competition_fixtures"."away_competition_team_id")
    and ("competition_fixtures"."stage" = 'knockout' or ("competition_fixtures"."home_competition_team_id" is not null and "competition_fixtures"."away_competition_team_id" is not null and "competition_fixtures"."next_fixture_id" is null))
    and (("competition_fixtures"."next_fixture_id" is null and "competition_fixtures"."next_fixture_slot" is null) or ("competition_fixtures"."next_fixture_id" is not null and "competition_fixtures"."next_fixture_id" <> "competition_fixtures"."id" and "competition_fixtures"."next_fixture_slot" is not null and "competition_fixtures"."next_fixture_slot" in ('home','away')))
    and (("competition_fixtures"."home_score" is null and "competition_fixtures"."away_score" is null) or ("competition_fixtures"."home_score" between 0 and 99 and "competition_fixtures"."away_score" between 0 and 99 and "competition_fixtures"."home_score" is not null and "competition_fixtures"."away_score" is not null))
    and (("competition_fixtures"."home_penalty_score" is null and "competition_fixtures"."away_penalty_score" is null) or ("competition_fixtures"."stage" = 'knockout' and "competition_fixtures"."home_penalty_score" between 0 and 99 and "competition_fixtures"."away_penalty_score" between 0 and 99 and "competition_fixtures"."home_penalty_score" is not null and "competition_fixtures"."away_penalty_score" is not null))
    and ("competition_fixtures"."winner_competition_team_id" is null or ("competition_fixtures"."home_competition_team_id" is not null and "competition_fixtures"."away_competition_team_id" is not null and "competition_fixtures"."winner_competition_team_id" in ("competition_fixtures"."home_competition_team_id", "competition_fixtures"."away_competition_team_id")))
    and ("competition_fixtures"."status" <> 'completed' or ("competition_fixtures"."home_competition_team_id" is not null and "competition_fixtures"."away_competition_team_id" is not null and "competition_fixtures"."home_score" is not null and "competition_fixtures"."away_score" is not null and ("competition_fixtures"."stage" <> 'knockout' or "competition_fixtures"."winner_competition_team_id" is not null)))
  )
);
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "format" "competition_format";--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "configured_team_count" integer;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "max_substitutes" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "red_card_suspension_matches" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "accumulated_yellow_threshold" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "yellow_suspension_matches" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "allowed_playing_days" integer[] DEFAULT ARRAY[6]::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "default_kickoff_time" text DEFAULT '15:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "fixtures_per_opponent" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "points_win" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "points_draw" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "points_loss" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "qualifier_count" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_fixtures_competition_id_id_unique" ON "competition_fixtures" USING btree ("competition_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_teams_competition_id_id_unique" ON "competition_teams" USING btree ("competition_id","id");--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_linked_match_id_matches_id_fk" FOREIGN KEY ("linked_match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_legacy_result_id_competition_matches_id_fk" FOREIGN KEY ("legacy_result_id") REFERENCES "public"."competition_matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_home_participant_fk" FOREIGN KEY ("competition_id","home_competition_team_id") REFERENCES "public"."competition_teams"("competition_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_away_participant_fk" FOREIGN KEY ("competition_id","away_competition_team_id") REFERENCES "public"."competition_teams"("competition_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_winner_participant_fk" FOREIGN KEY ("competition_id","winner_competition_team_id") REFERENCES "public"."competition_teams"("competition_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_fixtures" ADD CONSTRAINT "competition_fixtures_next_fixture_fk" FOREIGN KEY ("competition_id","next_fixture_id") REFERENCES "public"."competition_fixtures"("competition_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "competition_fixtures_round_position_unique" ON "competition_fixtures" USING btree ("competition_id","stage","round","position");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_fixtures_pair_unique" ON "competition_fixtures" USING btree ("competition_id","stage","home_competition_team_id","away_competition_team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_fixtures_next_slot_unique" ON "competition_fixtures" USING btree ("next_fixture_id","next_fixture_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_fixtures_linked_match_unique" ON "competition_fixtures" USING btree ("linked_match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_fixtures_legacy_result_unique" ON "competition_fixtures" USING btree ("legacy_result_id");--> statement-breakpoint

ALTER TABLE "competitions" ADD CONSTRAINT "competitions_settings_valid" CHECK (
      ("competitions"."configured_team_count" is null or "competitions"."configured_team_count" between 2 and 128)
      and "competitions"."max_substitutes" between 0 and 99
      and "competitions"."red_card_suspension_matches" between 0 and 99
      and "competitions"."accumulated_yellow_threshold" between 1 and 99
      and "competitions"."yellow_suspension_matches" between 0 and 99
      and cardinality("competitions"."allowed_playing_days") between 1 and 7
      and "competitions"."allowed_playing_days" <@ ARRAY[0,1,2,3,4,5,6]::integer[]
      and array_position("competitions"."allowed_playing_days", null) is null
      and "competitions"."default_kickoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and "competitions"."fixtures_per_opponent" in (1,2)
      and "competitions"."points_win" between 0 and 99 and "competitions"."points_draw" between 0 and 99 and "competitions"."points_loss" between 0 and 99
      and ("competitions"."format" is null or ("competitions"."type" = 'league' and "competitions"."format" = 'league') or ("competitions"."type" = 'cup' and "competitions"."format" in ('knockout','league_knockout')))
      and ("competitions"."format" is distinct from 'knockout' or "competitions"."configured_team_count" is null or "competitions"."configured_team_count" in (4,8,16,32))
      and ("competitions"."qualifier_count" is null or ("competitions"."format" is not null and "competitions"."format" = 'league_knockout' and "competitions"."qualifier_count" in (4,8,16,32) and "competitions"."configured_team_count" is not null and "competitions"."qualifier_count" <= "competitions"."configured_team_count"))
    );
--> statement-breakpoint
-- Additional procedural guards are intentionally maintained in this migration:
-- Drizzle snapshots represent tables/constraints, not PostgreSQL functions/triggers.
CREATE FUNCTION competition_has_recorded_activity(p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM competition_matches WHERE competition_id = p_id)
    OR EXISTS (SELECT 1 FROM matches WHERE competition_id = p_id)
    OR EXISTS (SELECT 1 FROM standings WHERE competition_id = p_id AND
      (played <> 0 OR points <> 0 OR goals_for <> 0 OR goals_against <> 0 OR won <> 0 OR drawn <> 0 OR lost <> 0))
$$;
--> statement-breakpoint
CREATE FUNCTION guard_competition_settings() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER competition_settings_guard BEFORE UPDATE ON competitions
FOR EACH ROW EXECUTE FUNCTION guard_competition_settings();
--> statement-breakpoint
CREATE FUNCTION guard_competition_roster() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER competition_roster_guard BEFORE INSERT OR UPDATE OR DELETE ON competition_teams
FOR EACH ROW EXECUTE FUNCTION guard_competition_roster();
--> statement-breakpoint
-- Serialize legacy result/match/standing writes with generation and settings edits.
CREATE FUNCTION lock_competition_activity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM competitions WHERE id = NEW.competition_id FOR UPDATE;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER competition_result_lock BEFORE INSERT OR UPDATE ON competition_matches
FOR EACH ROW EXECUTE FUNCTION lock_competition_activity();
--> statement-breakpoint
CREATE TRIGGER competition_match_lock BEFORE INSERT OR UPDATE ON matches
FOR EACH ROW EXECUTE FUNCTION lock_competition_activity();
--> statement-breakpoint
CREATE TRIGGER competition_standing_lock BEFORE INSERT OR UPDATE ON standings
FOR EACH ROW EXECUTE FUNCTION lock_competition_activity();
--> statement-breakpoint
CREATE FUNCTION guard_competition_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE TRIGGER competition_fixture_guard BEFORE INSERT OR UPDATE ON competition_fixtures
FOR EACH ROW EXECUTE FUNCTION guard_competition_fixture();
--> statement-breakpoint
-- Deferred: later rounds can be inserted in the same statement as their feeders.
CREATE FUNCTION guard_fixture_progression() RETURNS trigger LANGUAGE plpgsql AS $$
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
CREATE CONSTRAINT TRIGGER competition_fixture_progression_guard AFTER INSERT OR UPDATE ON competition_fixtures
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION guard_fixture_progression();
--> statement-breakpoint
CREATE FUNCTION generate_competition_fixtures(p_id uuid, p_user text, p_settings jsonb,
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
