-- Maintain identity on future refreshes only. No historical backfill.
CREATE OR REPLACE FUNCTION refresh_match_projection(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing match_projection_state%rowtype;
  v_session_id uuid;
  v_events jsonb;
  v_open_reviews jsonb;
  v_digest text;
  v_revision integer;
  v_confirmed_own integer;
  v_confirmed_opponent integer;
  v_provisional_own integer;
  v_provisional_opponent integer;
  v_possible_own integer;
  v_possible_opponent integer;
  v_possible_cards integer;
  v_own_yellow integer;
  v_own_red integer;
  v_opponent_yellow integer;
  v_opponent_red integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));
  SELECT shared_match_id INTO v_session_id FROM matches WHERE id = p_match_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'team', team, 'eventType', event_type, 'athleteId', athlete_id,
      'opponentLabel', opponent_label, 'opponentPlayerId', opponent_player_id,
      'minute', minute, 'detail', detail, 'period', period,
      'matchElapsedMs', match_elapsed_ms, 'lifecycleStatus', lifecycle_status
    ) ORDER BY id), '[]'::jsonb),
    count(*) FILTER (WHERE lifecycle_status = 'confirmed' AND team = 'own' AND event_type = 'goal')::int,
    count(*) FILTER (WHERE lifecycle_status = 'confirmed' AND team = 'opponent' AND event_type = 'goal')::int,
    count(*) FILTER (WHERE lifecycle_status <> 'voided' AND team = 'own' AND event_type = 'goal')::int,
    count(*) FILTER (WHERE lifecycle_status <> 'voided' AND team = 'opponent' AND event_type = 'goal')::int,
    count(*) FILTER (WHERE lifecycle_status = 'needs_review' AND team = 'own' AND event_type = 'goal')::int,
    count(*) FILTER (WHERE lifecycle_status = 'needs_review' AND team = 'opponent' AND event_type = 'goal')::int,
    count(*) FILTER (WHERE lifecycle_status = 'needs_review' AND event_type IN ('yellow_card', 'red_card'))::int,
    count(*) FILTER (WHERE lifecycle_status <> 'voided' AND team = 'own' AND event_type = 'yellow_card')::int,
    count(*) FILTER (WHERE lifecycle_status <> 'voided' AND team = 'own' AND event_type = 'red_card')::int,
    count(*) FILTER (WHERE lifecycle_status <> 'voided' AND team = 'opponent' AND event_type = 'yellow_card')::int,
    count(*) FILTER (WHERE lifecycle_status <> 'voided' AND team = 'opponent' AND event_type = 'red_card')::int
  INTO v_events, v_confirmed_own, v_confirmed_opponent,
    v_provisional_own, v_provisional_opponent, v_possible_own,
    v_possible_opponent, v_possible_cards, v_own_yellow, v_own_red,
    v_opponent_yellow, v_opponent_red
  FROM match_events WHERE match_id = p_match_id;

  SELECT COALESCE(jsonb_agg(id ORDER BY id), '[]'::jsonb)
  INTO v_open_reviews FROM match_event_reviews
  WHERE match_id = p_match_id AND status = 'open';
  v_digest := md5(v_events::text || v_open_reviews::text || 'rules:1');
  SELECT * INTO v_existing FROM match_projection_state
  WHERE match_id = p_match_id FOR UPDATE;
  IF FOUND AND v_existing.input_digest = v_digest THEN
    UPDATE match_projection_state SET session_id = v_session_id
    WHERE match_id = p_match_id AND session_id IS DISTINCT FROM v_session_id;
    RETURN v_existing.revision;
  END IF;
  v_revision := COALESCE(v_existing.revision, 0) + 1;
  INSERT INTO match_projection_state (
    match_id, session_id, revision, input_digest, rules_version,
    confirmed_team_score, confirmed_opponent_score,
    provisional_team_score, provisional_opponent_score,
    possible_effects, disciplinary_projection, unresolved_review_count,
    finalisation_state, updated_at
  ) VALUES (
    p_match_id, v_session_id, v_revision, v_digest, 1,
    v_confirmed_own, v_confirmed_opponent,
    v_provisional_own, v_provisional_opponent,
    jsonb_build_object('teamGoals', v_possible_own,
      'opponentGoals', v_possible_opponent, 'disciplinaryEvents', v_possible_cards),
    jsonb_build_object('ownYellowCards', v_own_yellow, 'ownRedCards', v_own_red,
      'opponentYellowCards', v_opponent_yellow, 'opponentRedCards', v_opponent_red),
    jsonb_array_length(v_open_reviews),
    CASE WHEN v_existing.finalisation_state = 'finalised'
      THEN 'amendment_required'
      ELSE COALESCE(v_existing.finalisation_state, 'open') END,
    now()
  ) ON CONFLICT (match_id) DO UPDATE SET
    session_id = EXCLUDED.session_id,
    revision = EXCLUDED.revision,
    input_digest = EXCLUDED.input_digest,
    rules_version = EXCLUDED.rules_version,
    confirmed_team_score = EXCLUDED.confirmed_team_score,
    confirmed_opponent_score = EXCLUDED.confirmed_opponent_score,
    provisional_team_score = EXCLUDED.provisional_team_score,
    provisional_opponent_score = EXCLUDED.provisional_opponent_score,
    possible_effects = EXCLUDED.possible_effects,
    disciplinary_projection = EXCLUDED.disciplinary_projection,
    unresolved_review_count = EXCLUDED.unresolved_review_count,
    finalisation_state = EXCLUDED.finalisation_state,
    updated_at = now();
  UPDATE match_events SET projection_revision = v_revision
  WHERE match_id = p_match_id AND projection_revision < v_revision;
  UPDATE match_event_memberships membership SET projection_revision = v_revision
  FROM match_events event
  WHERE membership.canonical_event_id = event.id
    AND event.match_id = p_match_id
    AND membership.projection_revision < v_revision;
  RETURN v_revision;
END;
$$;
--> statement-breakpoint
-- Serialize attachment against legacy ingestion/projection writers; never reinterpret evidence.
CREATE OR REPLACE FUNCTION attach_match_session_if_safe(p_match_id uuid, p_session_id uuid, p_is_home boolean)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_match matches%rowtype; v_event events%rowtype; v_expected uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 1));
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'SHARED_MATCH_SESSION_CONFLICT'; END IF;
  SELECT * INTO v_event FROM events WHERE id = v_match.event_id;
  IF v_event.competition_fixture_id IS NOT NULL THEN
    SELECT shared_session_id INTO v_expected FROM competition_fixtures WHERE id = v_event.competition_fixture_id;
  ELSE
    SELECT shared_session_id INTO v_expected FROM friendly_fixtures WHERE id = v_event.friendly_fixture_id AND status = 'accepted';
  END IF;
  IF v_expected IS DISTINCT FROM p_session_id OR NOT EXISTS (
    SELECT 1 FROM match_session_participants WHERE session_id = p_session_id
      AND team_id = v_event.team_id AND side = (CASE WHEN p_is_home THEN 'home' ELSE 'away' END)::match_session_side
  ) THEN RETURN 'SHARED_MATCH_SESSION_CONFLICT'; END IF;
  IF v_match.shared_match_id IS NOT NULL THEN
    IF v_match.shared_match_id = p_session_id AND v_match.is_home = p_is_home THEN RETURN 'already_linked'; END IF;
    RETURN 'SHARED_MATCH_SESSION_CONFLICT';
  END IF;
  IF v_event.status <> 'scheduled'
    OR v_match.clock_period <> 'not_started' OR v_match.clock_revision <> 0 OR v_match.clock_elapsed_ms <> 0 OR v_match.clock_started_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM competition_fixtures WHERE id = v_event.competition_fixture_id AND status = 'completed')
    OR EXISTS (SELECT 1 FROM match_event_observations WHERE match_id = p_match_id)
    OR EXISTS (SELECT 1 FROM match_events WHERE match_id = p_match_id)
    OR EXISTS (SELECT 1 FROM match_event_operations WHERE match_id = p_match_id)
    OR EXISTS (SELECT 1 FROM match_event_reviews WHERE match_id = p_match_id)
    OR EXISTS (SELECT 1 FROM match_clock_operations WHERE match_id = p_match_id)
    OR EXISTS (SELECT 1 FROM match_projection_state WHERE match_id = p_match_id AND (finalisation_state <> 'open' OR finalised_at IS NOT NULL OR session_id IS NOT NULL))
    OR EXISTS (SELECT 1 FROM match_sessions WHERE id = p_session_id AND (home_confirmed_at IS NOT NULL OR away_confirmed_at IS NOT NULL OR finalised_at IS NOT NULL))
  THEN RETURN 'SHARED_MATCH_RECONCILIATION_REQUIRED'; END IF;
  UPDATE matches SET shared_match_id = p_session_id, is_home = p_is_home, updated_at = now() WHERE id = p_match_id;
  RETURN 'attached';
END;
$$;
