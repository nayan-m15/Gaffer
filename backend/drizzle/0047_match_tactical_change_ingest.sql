-- Replaces ingest_match_event_observation from 0036 so tactical changes are
-- never paired as possible duplicates. Split from 0046 because a new enum
-- label cannot be used in the transaction that adds it.
CREATE OR REPLACE FUNCTION ingest_match_event_observation(
  p_observation_id uuid,
  p_match_id uuid,
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
  v_canonical_id uuid;
  v_candidate record;
  v_pair_id uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));

  INSERT INTO match_event_observations (
    id, match_id, device_id, logged_by_user_id, event_type, team,
    athlete_id, opponent_label, opponent_player_id, period,
    match_elapsed_ms, payload, payload_hash, client_created_at
  ) VALUES (
    p_observation_id, p_match_id, p_device_id, p_actor_id, p_event_type, p_team,
    p_athlete_id, p_opponent_label, p_opponent_player_id, p_period,
    p_elapsed_ms, p_payload, p_payload_hash, p_client_created_at
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload_hash, match_id INTO v_existing_hash, v_existing_match
  FROM match_event_observations WHERE id = p_observation_id;
  IF v_existing_hash IS DISTINCT FROM p_payload_hash
     OR v_existing_match IS DISTINCT FROM p_match_id THEN
    RAISE EXCEPTION 'offline operation id reused with different data'
      USING ERRCODE = '22000';
  END IF;

  SELECT canonical_event_id INTO v_canonical_id
  FROM match_event_memberships WHERE observation_id = p_observation_id;
  IF v_canonical_id IS NOT NULL THEN
    PERFORM refresh_match_projection(p_match_id);
    RETURN v_canonical_id;
  END IF;

  -- Each independent action starts as its own canonical event. A clock window
  -- proposes a review edge; it cannot silently collapse two genuine goals.
  INSERT INTO match_events (
    id, match_id, athlete_id, team, opponent_label, opponent_player_id,
    event_type, minute, detail, logged_by_user_id, manually_adjusted,
    client_request_id, period, match_elapsed_ms, structured_payload,
    lifecycle_status
  ) VALUES (
    p_observation_id, p_match_id, p_athlete_id, p_team, p_opponent_label,
    p_opponent_player_id, p_event_type, p_minute, p_detail, p_actor_id,
    p_manually_adjusted, p_observation_id, p_period, p_elapsed_ms, p_payload,
    'provisional'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO match_event_memberships (observation_id, canonical_event_id)
  VALUES (p_observation_id, p_observation_id)
  ON CONFLICT (observation_id) DO NOTHING;

  -- Tactical changes are coach instructions, not observations of play: two in
  -- quick succession are both real, so they never pair as possible duplicates.
  -- Compared as text so this function does not depend on the enum label.
  FOR v_candidate IN
    SELECT obs.id, membership.canonical_event_id
    FROM match_event_observations obs
    JOIN match_event_memberships membership ON membership.observation_id = obs.id
    WHERE obs.match_id = p_match_id
      AND p_event_type::text <> 'tactical_change'
      AND obs.id <> p_observation_id
      AND obs.period = p_period
      AND obs.event_type = p_event_type
      AND obs.team = p_team
      AND obs.athlete_id IS NOT DISTINCT FROM p_athlete_id
      AND obs.opponent_player_id IS NOT DISTINCT FROM p_opponent_player_id
      AND obs.opponent_label IS NOT DISTINCT FROM p_opponent_label
      AND abs(obs.match_elapsed_ms - p_elapsed_ms) <= 5000
    ORDER BY obs.id
  LOOP
    v_pair_id := md5(least(p_observation_id, v_candidate.id)::text ||
                     greatest(p_observation_id, v_candidate.id)::text)::uuid;
    INSERT INTO match_event_reviews (
      id, match_id, canonical_event_id, observation_ids, review_version, reason
    ) VALUES (
      v_pair_id, p_match_id, v_candidate.canonical_event_id,
      jsonb_build_array(least(p_observation_id, v_candidate.id),
                        greatest(p_observation_id, v_candidate.id)), 2,
      'possible_duplicate'
    ) ON CONFLICT (id) DO NOTHING;
    UPDATE match_events SET lifecycle_status = 'needs_review', updated_at = now()
    WHERE id IN (p_observation_id, v_candidate.canonical_event_id)
      AND lifecycle_status <> 'voided';
  END LOOP;

  PERFORM refresh_match_projection(p_match_id);
  RETURN p_observation_id;
END;
$$;
