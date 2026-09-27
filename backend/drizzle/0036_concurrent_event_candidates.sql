-- Preserve the witnesses involved in a review even when memberships change.
ALTER TABLE match_event_reviews
  ADD COLUMN IF NOT EXISTS observation_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE match_event_reviews
  ADD COLUMN IF NOT EXISTS review_version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
UPDATE match_event_reviews review
SET observation_ids = COALESCE((
  SELECT jsonb_agg(membership.observation_id ORDER BY membership.observation_id)
  FROM match_event_memberships membership
  WHERE membership.canonical_event_id = review.canonical_event_id
), '[]'::jsonb)
WHERE review.observation_ids = '[]'::jsonb;
--> statement-breakpoint
DROP INDEX IF EXISTS match_event_reviews_open_canonical_unique;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS match_event_reviews_observation_ids_index
  ON match_event_reviews USING gin (observation_ids);
--> statement-breakpoint
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

  FOR v_candidate IN
    SELECT obs.id, membership.canonical_event_id
    FROM match_event_observations obs
    JOIN match_event_memberships membership ON membership.observation_id = obs.id
    WHERE obs.match_id = p_match_id
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
--> statement-breakpoint
CREATE OR REPLACE FUNCTION refresh_match_projection(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing match_projection_state%rowtype;
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
    RETURN v_existing.revision;
  END IF;
  v_revision := COALESCE(v_existing.revision, 0) + 1;
  INSERT INTO match_projection_state (
    match_id, revision, input_digest, rules_version,
    confirmed_team_score, confirmed_opponent_score,
    provisional_team_score, provisional_opponent_score,
    possible_effects, disciplinary_projection, unresolved_review_count,
    finalisation_state, updated_at
  ) VALUES (
    p_match_id, v_revision, v_digest, 1,
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
CREATE OR REPLACE FUNCTION resolve_match_event_candidate(
  p_review_id uuid,
  p_match_id uuid,
  p_actor_id text,
  p_operation_id uuid,
  p_resolution text,
  p_causal_parents jsonb
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_review match_event_reviews%rowtype;
  v_left uuid;
  v_right uuid;
  v_left_canonical uuid;
  v_right_canonical uuid;
  v_winner uuid;
  v_loser uuid;
  v_voided boolean;
  v_winner_corrected boolean;
  v_loser_corrected boolean;
  v_prior_decisions jsonb;
  v_existing match_event_operations%rowtype;
  v_blocking_review uuid;
BEGIN
  IF p_resolution NOT IN ('same_event', 'separate_events') THEN
    RAISE EXCEPTION 'invalid review resolution' USING ERRCODE = '22000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));

  SELECT * INTO v_existing FROM match_event_operations WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing.match_id <> p_match_id
       OR v_existing.decision ->> 'reviewId' <> p_review_id::text
       OR v_existing.decision ->> 'resolution' <> p_resolution THEN
      RAISE EXCEPTION 'offline operation id reused with different data'
        USING ERRCODE = '22000';
    END IF;
    PERFORM refresh_match_projection(p_match_id);
    RETURN v_existing.canonical_event_id;
  END IF;

  SELECT * INTO v_review FROM match_event_reviews
  WHERE id = p_review_id AND match_id = p_match_id
  FOR UPDATE;
  IF NOT FOUND OR v_review.review_version <> 2
     OR jsonb_array_length(v_review.observation_ids) <> 2 THEN
    RAISE EXCEPTION 'candidate review not found' USING ERRCODE = 'P0002';
  END IF;

  v_left := (v_review.observation_ids ->> 0)::uuid;
  v_right := (v_review.observation_ids ->> 1)::uuid;
  SELECT canonical_event_id INTO v_left_canonical
  FROM match_event_memberships WHERE observation_id = v_left;
  SELECT canonical_event_id INTO v_right_canonical
  FROM match_event_memberships WHERE observation_id = v_right;
  IF v_left_canonical IS NULL OR v_right_canonical IS NULL THEN
    RAISE EXCEPTION 'candidate observation missing' USING ERRCODE = 'P0002';
  END IF;

  IF v_review.status = 'resolved' THEN
    INSERT INTO match_event_operations (
      id, match_id, actor_user_id, operation_type,
      target_observation_ids, canonical_event_id, causal_parent_ids, decision
    ) VALUES (
      p_operation_id, p_match_id, p_actor_id,
      CASE WHEN v_review.resolution = p_resolution THEN
        CASE WHEN p_resolution = 'same_event' THEN 'merge' ELSE 'separate' END
      ELSE 'conflicting_resolution' END,
      v_review.observation_ids, v_left_canonical, p_causal_parents,
      jsonb_build_object('reviewId', p_review_id, 'resolution', p_resolution)
    );
    IF v_review.resolution <> p_resolution THEN
      UPDATE match_event_reviews SET status = 'open',
        reason = 'conflicting_resolution', resolution = NULL,
        resolved_by_user_id = NULL, resolved_at = NULL, updated_at = now()
      WHERE id = p_review_id;
      UPDATE match_events SET lifecycle_status = 'needs_review', updated_at = now()
      WHERE id IN (v_left_canonical, v_right_canonical)
        AND lifecycle_status <> 'voided';
    END IF;
    PERFORM refresh_match_projection(p_match_id);
    RETURN v_left_canonical;
  END IF;

  IF v_review.reason = 'conflicting_resolution' THEN
    SELECT COALESCE(jsonb_agg(id::text), '[]'::jsonb)
      INTO v_prior_decisions
    FROM match_event_operations
    WHERE decision ->> 'reviewId' = p_review_id::text;
    IF NOT p_causal_parents @> v_prior_decisions THEN
      INSERT INTO match_event_operations (
        id, match_id, actor_user_id, operation_type,
        target_observation_ids, canonical_event_id, causal_parent_ids, decision
      ) VALUES (
        p_operation_id, p_match_id, p_actor_id, 'conflicting_resolution',
        v_review.observation_ids, v_left_canonical, p_causal_parents,
        jsonb_build_object('reviewId', p_review_id, 'resolution', p_resolution)
      );
      PERFORM refresh_match_projection(p_match_id);
      RETURN v_left_canonical;
    END IF;
  END IF;

  IF p_resolution = 'separate_events'
     AND v_left_canonical = v_right_canonical THEN
    -- Both original event rows remain available for an explicit split.
    v_loser := CASE WHEN v_left_canonical = v_left THEN v_right ELSE v_left END;
    UPDATE match_event_memberships SET canonical_event_id = v_loser
    WHERE observation_id = v_loser;
    UPDATE match_events SET lifecycle_status = 'provisional', updated_at = now()
    WHERE id = v_loser;
    SELECT canonical_event_id INTO v_left_canonical
    FROM match_event_memberships WHERE observation_id = v_left;
    SELECT canonical_event_id INTO v_right_canonical
    FROM match_event_memberships WHERE observation_id = v_right;
  END IF;

  v_winner := least(v_left_canonical, v_right_canonical);
  v_loser := greatest(v_left_canonical, v_right_canonical);
  IF p_resolution = 'same_event' AND v_winner <> v_loser THEN
    -- A prior "separate" decision across these groups is a constraint. A
    -- third witness cannot silently undo it through a different pair review.
    SELECT review.id INTO v_blocking_review
    FROM match_event_reviews review
    JOIN match_event_memberships left_member
      ON left_member.observation_id = (review.observation_ids ->> 0)::uuid
    JOIN match_event_memberships right_member
      ON right_member.observation_id = (review.observation_ids ->> 1)::uuid
    WHERE review.match_id = p_match_id
      AND review.id <> p_review_id
      AND review.review_version = 2
      AND review.status = 'resolved'
      AND review.resolution = 'separate_events'
      AND ((left_member.canonical_event_id = v_winner
            AND right_member.canonical_event_id = v_loser)
        OR (left_member.canonical_event_id = v_loser
            AND right_member.canonical_event_id = v_winner))
    ORDER BY review.id LIMIT 1;
    IF v_blocking_review IS NOT NULL THEN
      INSERT INTO match_event_operations (
        id, match_id, actor_user_id, operation_type,
        target_observation_ids, canonical_event_id, causal_parent_ids, decision
      ) VALUES (
        p_operation_id, p_match_id, p_actor_id, 'conflicting_resolution',
        v_review.observation_ids, v_left_canonical, p_causal_parents,
        jsonb_build_object('reviewId', p_review_id, 'resolution', p_resolution,
                           'blockedByReviewId', v_blocking_review)
      );
      UPDATE match_event_reviews SET status = 'open',
        reason = 'conflicting_resolution', resolution = NULL,
        resolved_by_user_id = NULL, resolved_at = NULL, updated_at = now()
      WHERE id = p_review_id;
      UPDATE match_events SET lifecycle_status = 'needs_review', updated_at = now()
      WHERE id IN (v_winner, v_loser) AND lifecycle_status <> 'voided';
      PERFORM refresh_match_projection(p_match_id);
      RETURN v_winner;
    END IF;
    SELECT bool_or(lifecycle_status = 'voided') INTO v_voided
    FROM match_events WHERE id IN (v_winner, v_loser);
    SELECT EXISTS (
      SELECT 1 FROM match_event_operations operation
      JOIN match_event_memberships membership
        ON operation.target_observation_ids ? membership.observation_id::text
      WHERE membership.canonical_event_id = v_winner
        AND operation.operation_type = 'correct'
    ) INTO v_winner_corrected;
    SELECT EXISTS (
      SELECT 1 FROM match_event_operations operation
      JOIN match_event_memberships membership
        ON operation.target_observation_ids ? membership.observation_id::text
      WHERE membership.canonical_event_id = v_loser
        AND operation.operation_type = 'correct'
    ) INTO v_loser_corrected;
    IF v_loser_corrected AND NOT v_winner_corrected THEN
      UPDATE match_events winner SET
        athlete_id = loser.athlete_id,
        opponent_label = loser.opponent_label,
        opponent_player_id = loser.opponent_player_id,
        event_type = loser.event_type,
        minute = loser.minute,
        detail = loser.detail,
        manually_adjusted = true,
        updated_at = now()
      FROM match_events loser
      WHERE winner.id = v_winner AND loser.id = v_loser;
    END IF;
    UPDATE match_event_memberships SET canonical_event_id = v_winner
    WHERE canonical_event_id = v_loser;
    UPDATE match_events SET lifecycle_status = 'voided', updated_at = now()
    WHERE id = v_loser;
    IF v_voided THEN
      UPDATE match_events SET lifecycle_status = 'voided', updated_at = now()
      WHERE id = v_winner;
    END IF;
  END IF;

  UPDATE match_event_reviews
  SET status = 'resolved', resolution = p_resolution,
      resolved_by_user_id = p_actor_id, resolved_at = now(), updated_at = now()
  WHERE id = p_review_id;

  UPDATE match_events event SET
    lifecycle_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM match_event_reviews review
        WHERE review.match_id = p_match_id AND review.status = 'open'
          AND review.observation_ids ?| ARRAY(
            SELECT observation_id::text FROM match_event_memberships
            WHERE canonical_event_id = event.id
          )
      ) THEN 'needs_review' ELSE 'confirmed' END,
    updated_at = now()
  WHERE event.id IN (v_left_canonical, v_right_canonical, v_winner)
    AND event.lifecycle_status <> 'voided';

  INSERT INTO match_event_operations (
    id, match_id, actor_user_id, operation_type,
    target_observation_ids, canonical_event_id,
    causal_parent_ids, decision
  ) VALUES (
    p_operation_id, p_match_id, p_actor_id,
    CASE WHEN p_resolution = 'same_event' THEN 'merge' ELSE 'separate' END,
    v_review.observation_ids, v_winner, p_causal_parents,
    jsonb_build_object('reviewId', p_review_id, 'resolution', p_resolution)
  );
  PERFORM refresh_match_projection(p_match_id);
  RETURN v_winner;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION finalise_match_projection(
  p_match_id uuid, p_expected_revision integer, p_actor_id text
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));
  PERFORM refresh_match_projection(p_match_id);
  SELECT event.status::text INTO v_status
  FROM matches match JOIN events event ON event.id = match.event_id
  WHERE match.id = p_match_id;
  IF v_status <> 'completed' THEN RETURN false; END IF;
  UPDATE match_projection_state SET
    finalisation_state = 'finalised',
    finalised_by_user_id = p_actor_id,
    finalised_at = now(), updated_at = now()
  WHERE match_id = p_match_id
    AND revision = p_expected_revision
    AND unresolved_review_count = 0;
  RETURN FOUND;
END;
$$;
