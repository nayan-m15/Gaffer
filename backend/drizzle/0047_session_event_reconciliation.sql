-- Session ingestion is additive; the legacy per-match function remains the
-- feature-flag-off path and retains its existing idempotency contract.
CREATE OR REPLACE FUNCTION ingest_match_session_event_observation(
  p_observation_id uuid,
  p_match_id uuid,
  p_session_id uuid,
  p_side match_session_side,
  p_device_id uuid,
  p_actor_id text,
  p_event_type match_event_type,
  p_team match_event_team,
  p_athlete_id uuid,
  p_opponent_label text,
  p_opponent_player_id uuid,
  p_period text,
  p_elapsed_ms integer,
  p_minute integer,
  p_detail text,
  p_payload jsonb,
  p_payload_hash text,
  p_client_created_at timestamptz,
  p_manually_adjusted boolean
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_hash text;
  v_existing_match uuid;
  v_existing_session uuid;
  v_existing_side match_session_side;
  v_canonical_id uuid;
  v_candidate record;
  v_pair_id uuid;
  v_refresh_match_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  IF NOT EXISTS (
    SELECT 1 FROM matches
    WHERE id = p_match_id AND shared_match_id = p_session_id
  ) THEN
    RAISE EXCEPTION 'match is not linked to this session' USING ERRCODE = '22000';
  END IF;

  INSERT INTO match_event_observations (
    id, match_id, session_id, side, device_id, logged_by_user_id,
    event_type, team, athlete_id, opponent_label, opponent_player_id, period,
    match_elapsed_ms, payload, payload_hash, client_created_at
  ) VALUES (
    p_observation_id, p_match_id, p_session_id, p_side, p_device_id,
    p_actor_id, p_event_type, p_team, p_athlete_id, p_opponent_label,
    p_opponent_player_id, p_period, p_elapsed_ms, p_payload, p_payload_hash,
    p_client_created_at
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload_hash, match_id, session_id, side
  INTO v_existing_hash, v_existing_match, v_existing_session, v_existing_side
  FROM match_event_observations WHERE id = p_observation_id;
  IF v_existing_hash IS DISTINCT FROM p_payload_hash
     OR v_existing_match IS DISTINCT FROM p_match_id
     OR v_existing_session IS DISTINCT FROM p_session_id
     OR v_existing_side IS DISTINCT FROM p_side THEN
    RAISE EXCEPTION 'offline operation id reused with different data'
      USING ERRCODE = '22000';
  END IF;

  SELECT canonical_event_id INTO v_canonical_id
  FROM match_event_memberships WHERE observation_id = p_observation_id;
  IF v_canonical_id IS NOT NULL THEN
    PERFORM refresh_match_projection(p_match_id);
    RETURN v_canonical_id;
  END IF;

  -- Every observation starts as its own canonical event. Similar events from
  -- the other sheet create a review edge; they are never silently merged.
  INSERT INTO match_events (
    id, match_id, session_id, side, athlete_id, team, opponent_label,
    opponent_player_id, event_type, minute, detail, logged_by_user_id,
    manually_adjusted, client_request_id, period, match_elapsed_ms,
    structured_payload, lifecycle_status
  ) VALUES (
    p_observation_id, p_match_id, p_session_id, p_side, p_athlete_id, p_team,
    p_opponent_label, p_opponent_player_id, p_event_type, p_minute, p_detail,
    p_actor_id, p_manually_adjusted, p_observation_id, p_period, p_elapsed_ms,
    p_payload, 'provisional'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO match_event_memberships (observation_id, canonical_event_id)
  VALUES (p_observation_id, p_observation_id)
  ON CONFLICT (observation_id) DO NOTHING;

  FOR v_candidate IN
    SELECT obs.id, canonical.match_id, membership.canonical_event_id
    FROM match_event_observations obs
    JOIN match_event_memberships membership ON membership.observation_id = obs.id
    JOIN match_events canonical ON canonical.id = membership.canonical_event_id
    WHERE obs.session_id = p_session_id
      AND obs.side = p_side
      AND obs.match_id <> p_match_id
      AND obs.id <> p_observation_id
      AND obs.period = p_period
      AND obs.event_type = p_event_type
      AND abs(obs.match_elapsed_ms - p_elapsed_ms) <= 5000
    ORDER BY obs.id
  LOOP
    v_pair_id := md5(least(p_observation_id, v_candidate.id)::text ||
                     greatest(p_observation_id, v_candidate.id)::text)::uuid;
    INSERT INTO match_event_reviews (
      id, match_id, session_id, canonical_event_id, observation_ids,
      review_version, reason
    ) VALUES (
      v_pair_id, p_match_id, p_session_id, v_candidate.canonical_event_id,
      jsonb_build_array(least(p_observation_id, v_candidate.id),
                        greatest(p_observation_id, v_candidate.id)),
      2, 'possible_duplicate'
    ) ON CONFLICT (id) DO NOTHING;
    UPDATE match_events SET lifecycle_status = 'needs_review', updated_at = now()
    WHERE id IN (p_observation_id, v_candidate.canonical_event_id)
      AND lifecycle_status <> 'voided';
    PERFORM refresh_match_projection(v_candidate.match_id);
  END LOOP;

  PERFORM refresh_match_projection(p_match_id);
  RETURN p_observation_id;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION resolve_match_session_event_candidate(
  p_review_id uuid,
  p_match_id uuid,
  p_session_id uuid,
  p_actor_id text,
  p_operation_id uuid,
  p_resolution text,
  p_causal_parents jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_review match_event_reviews%rowtype;
  v_result uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  SELECT * INTO v_review FROM match_event_reviews
  WHERE id = p_review_id AND session_id = p_session_id
    AND match_id = p_match_id FOR UPDATE;
  IF NOT FOUND OR v_review.review_version <> 2 THEN
    RAISE EXCEPTION 'candidate review not found' USING ERRCODE = 'P0002';
  END IF;

  v_result := resolve_match_event_candidate(
    p_review_id, p_match_id, p_actor_id, p_operation_id,
    p_resolution, p_causal_parents
  );
  UPDATE match_event_operations SET session_id = p_session_id
  WHERE id = p_operation_id;
  UPDATE match_event_reviews SET session_id = p_session_id
  WHERE id = p_review_id;
  RETURN v_result;
END;
$$;
