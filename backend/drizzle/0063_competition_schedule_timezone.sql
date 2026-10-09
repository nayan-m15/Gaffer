-- Existing competitions retain the UTC interpretation used before local scheduling.
ALTER TABLE competitions ADD COLUMN schedule_timezone text NOT NULL DEFAULT 'UTC';
--> statement-breakpoint
-- Keep the six-argument entry point for legacy callers. The new entry point
-- persists the timezone in the same transaction as guarded fixture generation.
CREATE FUNCTION generate_competition_fixtures(p_id uuid, p_user text, p_settings jsonb,
  p_participants jsonb, p_plan jsonb, p_regenerate boolean, p_timezone text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE c competitions%ROWTYPE; actual_ids jsonb;
BEGIN
  IF p_timezone IS NULL OR NOT EXISTS (
    SELECT 1 FROM pg_timezone_names WHERE name = p_timezone
  ) THEN RAISE EXCEPTION 'Invalid fixture timezone.'; END IF;
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
  -- Update while no fixtures exist so the structural-settings guard remains
  -- effective for every other write, including changes after play has begun.
  UPDATE competitions SET schedule_timezone = p_timezone WHERE id = p_id;
  INSERT INTO competition_fixtures (id, competition_id, stage, round, position,
    home_competition_team_id, away_competition_team_id, scheduled_at, next_fixture_id, next_fixture_slot)
  SELECT id, p_id, stage::competition_fixture_stage, round, position,
    "homeCompetitionTeamId", "awayCompetitionTeamId", "scheduledAt", "nextFixtureId", "nextFixtureSlot"
  FROM jsonb_to_recordset(p_plan) AS f(id uuid, stage text, round integer, position integer,
    "homeCompetitionTeamId" uuid, "awayCompetitionTeamId" uuid, "scheduledAt" timestamptz,
    "nextFixtureId" uuid, "nextFixtureSlot" text);
END $$;
