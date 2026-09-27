-- Update candidate resolution and apply event mutations atomically.
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
  v_component jsonb;
  v_old_canonical uuid;
  v_left_root uuid;
  v_right_root uuid;
  v_split_root uuid;
  v_original match_event_observations%rowtype;
  v_correction record;
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
    -- Keep witnesses connected by other resolved "same" decisions together.
    v_old_canonical := v_left_canonical;
    WITH RECURSIVE edges(left_id, right_id) AS (
      SELECT (observation_ids ->> 0)::uuid, (observation_ids ->> 1)::uuid
      FROM match_event_reviews
      WHERE match_id = p_match_id AND review_version = 2
        AND status = 'resolved' AND resolution = 'same_event'
        AND id <> p_review_id
      UNION ALL
      SELECT (observation_ids ->> 1)::uuid, (observation_ids ->> 0)::uuid
      FROM match_event_reviews
      WHERE match_id = p_match_id AND review_version = 2
        AND status = 'resolved' AND resolution = 'same_event'
        AND id <> p_review_id
    ), reachable(id) AS (
      SELECT v_right
      UNION
      SELECT edge.right_id FROM reachable current_node
      JOIN edges edge ON edge.left_id = current_node.id
      JOIN match_event_memberships member ON member.observation_id = edge.right_id
      WHERE member.canonical_event_id = v_old_canonical
    )
    SELECT COALESCE(jsonb_agg(id::text), '[]'::jsonb)
    INTO v_component FROM reachable;
    IF v_component ? v_left::text THEN
      INSERT INTO match_event_operations (
        id, match_id, actor_user_id, operation_type,
        target_observation_ids, canonical_event_id, causal_parent_ids, decision
      ) VALUES (
        p_operation_id, p_match_id, p_actor_id, 'conflicting_resolution',
        v_review.observation_ids, v_old_canonical, p_causal_parents,
        jsonb_build_object('reviewId', p_review_id, 'resolution', p_resolution,
                           'reason', 'connected_by_other_same_decisions')
      );
      UPDATE match_event_reviews SET status = 'open',
        reason = 'conflicting_resolution', resolution = NULL,
        resolved_by_user_id = NULL, resolved_at = NULL, updated_at = now()
      WHERE id = p_review_id;
      PERFORM refresh_match_projection(p_match_id);
      RETURN v_old_canonical;
    END IF;
    SELECT min(observation_id::text)::uuid INTO v_right_root FROM match_event_memberships
    WHERE canonical_event_id = v_old_canonical
      AND v_component ? observation_id::text;
    SELECT min(observation_id::text)::uuid INTO v_left_root FROM match_event_memberships
    WHERE canonical_event_id = v_old_canonical
      AND NOT v_component ? observation_id::text;
    UPDATE match_event_memberships SET canonical_event_id =
      CASE WHEN v_component ? observation_id::text
        THEN v_right_root ELSE v_left_root END
    WHERE canonical_event_id = v_old_canonical;
    UPDATE match_events SET lifecycle_status = 'voided', updated_at = now()
    WHERE id IN (
      SELECT observation_id FROM match_event_memberships
      WHERE canonical_event_id IN (v_left_root, v_right_root)
    ) AND id NOT IN (v_left_root, v_right_root);
    FOR v_split_root IN SELECT unnest(ARRAY[v_left_root, v_right_root]) LOOP
      SELECT * INTO v_original FROM match_event_observations
      WHERE id = v_split_root;
      UPDATE match_events SET
        athlete_id = v_original.athlete_id,
        team = v_original.team,
        opponent_label = v_original.opponent_label,
        opponent_player_id = v_original.opponent_player_id,
        event_type = v_original.event_type,
        minute = floor(v_original.match_elapsed_ms / 60000)::integer,
        detail = v_original.payload ->> 'detail',
        period = v_original.period,
        match_elapsed_ms = v_original.match_elapsed_ms,
        lifecycle_status = CASE WHEN EXISTS (
          SELECT 1 FROM match_event_operations operation
          JOIN match_event_memberships member
            ON operation.target_observation_ids ? member.observation_id::text
          WHERE member.canonical_event_id = v_split_root
            AND operation.operation_type = 'void'
        ) THEN 'voided' ELSE 'provisional' END,
        updated_at = now()
      WHERE id = v_split_root;
      FOR v_correction IN
        SELECT operation.decision -> 'replacement' AS replacement
        FROM match_event_operations operation
        WHERE operation.operation_type = 'correct'
          AND EXISTS (
            SELECT 1 FROM match_event_memberships member
            WHERE member.canonical_event_id = v_split_root
              AND operation.target_observation_ids ? member.observation_id::text
          )
        ORDER BY operation.created_at, operation.id
      LOOP
        UPDATE match_events SET
          athlete_id = CASE WHEN v_correction.replacement ? 'athleteId'
            THEN (v_correction.replacement ->> 'athleteId')::uuid ELSE athlete_id END,
          opponent_label = CASE WHEN v_correction.replacement ? 'opponentLabel'
            THEN v_correction.replacement ->> 'opponentLabel' ELSE opponent_label END,
          opponent_player_id = CASE WHEN v_correction.replacement ? 'opponentPlayerId'
            THEN (v_correction.replacement ->> 'opponentPlayerId')::uuid
            ELSE opponent_player_id END,
          event_type = CASE WHEN v_correction.replacement ? 'eventType'
            THEN (v_correction.replacement ->> 'eventType')::match_event_type
            ELSE event_type END,
          minute = CASE WHEN v_correction.replacement ? 'minute'
            THEN (v_correction.replacement ->> 'minute')::integer ELSE minute END,
          detail = CASE WHEN v_correction.replacement ? 'detail'
            THEN v_correction.replacement ->> 'detail' ELSE detail END,
          manually_adjusted = true, updated_at = now()
        WHERE id = v_split_root;
      END LOOP;
    END LOOP;
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
CREATE OR REPLACE FUNCTION apply_match_event_mutation(
  p_operation_id uuid,
  p_match_id uuid,
  p_actor_id text,
  p_event_id uuid,
  p_operation_type text,
  p_decision jsonb,
  p_effective jsonb,
  p_causal_parents jsonb,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing match_event_operations%rowtype;
  v_target_observations jsonb;
BEGIN
  IF p_operation_type NOT IN ('correct', 'propose_correction', 'void') THEN
    RAISE EXCEPTION 'unsupported event mutation' USING ERRCODE = '22000';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));
  SELECT * INTO v_existing FROM match_event_operations WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing.match_id <> p_match_id
       OR v_existing.actor_user_id <> p_actor_id
       OR v_existing.canonical_event_id IS DISTINCT FROM p_event_id
       OR v_existing.operation_type <> p_operation_type
       OR v_existing.decision <> p_decision THEN
      RAISE EXCEPTION 'offline operation id reused with different data'
        USING ERRCODE = '22000';
    END IF;
    RETURN;
  END IF;
  PERFORM 1 FROM match_events WHERE id = p_event_id
    AND match_id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match event not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(jsonb_agg(observation_id ORDER BY observation_id), '[]'::jsonb)
  INTO v_target_observations FROM match_event_memberships
  WHERE canonical_event_id = p_event_id;

  IF p_operation_type = 'correct' THEN
    UPDATE match_events SET
      athlete_id = CASE WHEN p_effective ? 'athleteId'
        THEN (p_effective ->> 'athleteId')::uuid ELSE athlete_id END,
      opponent_label = CASE WHEN p_effective ? 'opponentLabel'
        THEN p_effective ->> 'opponentLabel' ELSE opponent_label END,
      opponent_player_id = CASE WHEN p_effective ? 'opponentPlayerId'
        THEN (p_effective ->> 'opponentPlayerId')::uuid ELSE opponent_player_id END,
      event_type = CASE WHEN p_effective ? 'eventType'
        THEN (p_effective ->> 'eventType')::match_event_type ELSE event_type END,
      minute = CASE WHEN p_effective ? 'minute'
        THEN (p_effective ->> 'minute')::integer ELSE minute END,
      detail = CASE WHEN p_effective ? 'detail'
        THEN p_effective ->> 'detail' ELSE detail END,
      manually_adjusted = true, updated_at = now()
    WHERE id = p_event_id;
  ELSIF p_operation_type = 'void' THEN
    UPDATE match_events SET lifecycle_status = 'voided', updated_at = now()
    WHERE id = p_event_id;
  ELSE
    INSERT INTO match_event_reviews (match_id, canonical_event_id, reason)
    VALUES (p_match_id, p_event_id, 'assistant_proposed_correction');
    UPDATE match_events SET lifecycle_status = 'needs_review', updated_at = now()
    WHERE id = p_event_id;
  END IF;
  INSERT INTO match_event_operations (
    id, match_id, actor_user_id, operation_type,
    target_observation_ids, canonical_event_id,
    causal_parent_ids, decision, reason
  ) VALUES (
    p_operation_id, p_match_id, p_actor_id, p_operation_type,
    v_target_observations, p_event_id, p_causal_parents,
    p_decision, p_reason
  );
  PERFORM refresh_match_projection(p_match_id);
END;
$$;
