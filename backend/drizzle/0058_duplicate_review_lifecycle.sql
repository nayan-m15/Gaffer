-- Compare public player descriptors across sheets without exposing private IDs.
-- 1 = matching identity, 0 = insufficient identity, -1 = different players.
CREATE FUNCTION match_event_player_comparison(p_left match_events, p_right match_events)
RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE v_left_name text; v_right_name text; v_left_number integer; v_right_number integer;
BEGIN
  IF p_left.athlete_id IS NOT NULL AND p_right.athlete_id IS NOT NULL THEN
    RETURN CASE WHEN p_left.athlete_id = p_right.athlete_id THEN 1 ELSE -1 END;
  END IF;
  IF p_left.match_id = p_right.match_id AND p_left.opponent_player_id IS NOT NULL AND p_right.opponent_player_id IS NOT NULL THEN
    RETURN CASE WHEN p_left.opponent_player_id = p_right.opponent_player_id THEN 1 ELSE -1 END;
  END IF;
  SELECT lower(trim(first_name || ' ' || last_name)), squad_number INTO v_left_name, v_left_number
    FROM athletes WHERE id = p_left.athlete_id;
  IF p_left.athlete_id IS NULL THEN
    SELECT lower(trim(name)), shirt_number INTO v_left_name, v_left_number
      FROM opponent_match_players WHERE id = p_left.opponent_player_id;
    v_left_number := COALESCE(v_left_number, (substring(p_left.opponent_label FROM '^#([0-9]{1,3})(?:\s|$)'))::integer);
    v_left_name := COALESCE(NULLIF(v_left_name, ''), NULLIF(lower(trim(regexp_replace(p_left.opponent_label, '^#[0-9]+\s*', ''))), ''));
  END IF;
  SELECT lower(trim(first_name || ' ' || last_name)), squad_number INTO v_right_name, v_right_number
    FROM athletes WHERE id = p_right.athlete_id;
  IF p_right.athlete_id IS NULL THEN
    SELECT lower(trim(name)), shirt_number INTO v_right_name, v_right_number
      FROM opponent_match_players WHERE id = p_right.opponent_player_id;
    v_right_number := COALESCE(v_right_number, (substring(p_right.opponent_label FROM '^#([0-9]{1,3})(?:\s|$)'))::integer);
    v_right_name := COALESCE(NULLIF(v_right_name, ''), NULLIF(lower(trim(regexp_replace(p_right.opponent_label, '^#[0-9]+\s*', ''))), ''));
  END IF;
  IF v_left_number IS NOT NULL AND v_right_number IS NOT NULL THEN
    RETURN CASE WHEN v_left_number = v_right_number THEN 1 ELSE -1 END;
  END IF;
  IF NULLIF(v_left_name, '') IS NOT NULL AND NULLIF(v_right_name, '') IS NOT NULL THEN
    RETURN CASE WHEN v_left_name = v_right_name THEN 1 ELSE -1 END;
  END IF;
  RETURN 0;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION match_session_events_may_duplicate(p_left match_events, p_right match_events)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_left.session_id = p_right.session_id
    AND p_left.side = p_right.side AND p_left.event_type = p_right.event_type
    AND p_left.lifecycle_status <> 'voided' AND p_right.lifecycle_status <> 'voided'
    AND p_left.period = p_right.period
    AND match_event_player_comparison(p_left, p_right) >= 0
    AND (p_left.match_id <> p_right.match_id OR match_event_player_comparison(p_left, p_right) = 1)
    AND (
      (NOT p_left.manually_adjusted AND NOT p_right.manually_adjusted
        AND abs(p_left.match_elapsed_ms - p_right.match_elapsed_ms) <= 5000)
      OR ((p_left.manually_adjusted OR p_right.manually_adjusted)
        AND p_left.minute = p_right.minute)
    );
$$;
--> statement-breakpoint
CREATE FUNCTION refresh_match_session_duplicate_candidates(p_event uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_event match_events%rowtype; v_pair record; v_pair_id uuid;
BEGIN
  SELECT * INTO v_event FROM match_events WHERE id = p_event;
  IF v_event.session_id IS NULL OR v_event.lifecycle_status = 'voided' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event.session_id::text, 0));
  -- Agreed amendments are already bilateral decisions about a locked report.
  IF EXISTS (SELECT 1 FROM match_sessions WHERE id = v_event.session_id AND finalised_at IS NOT NULL) THEN RETURN; END IF;
  FOR v_pair IN
    SELECT left_obs.id AS left_id, left_obs.match_id, right_obs.id AS right_id, canonical.id AS canonical_id
    FROM match_event_memberships left_member
    JOIN match_event_observations left_obs ON left_obs.id = left_member.observation_id
    JOIN match_event_observations right_obs ON right_obs.session_id = v_event.session_id
    JOIN match_event_memberships right_member ON right_member.observation_id = right_obs.id
    JOIN match_events canonical ON canonical.id = right_member.canonical_event_id
    WHERE left_member.canonical_event_id = p_event AND left_obs.session_id = v_event.session_id
      AND canonical.id <> p_event AND match_session_events_may_duplicate(v_event, canonical)
    ORDER BY left_obs.id, right_obs.id
  LOOP
    v_pair_id := md5(least(v_pair.left_id, v_pair.right_id)::text || greatest(v_pair.left_id, v_pair.right_id)::text)::uuid;
    INSERT INTO match_event_reviews(id,match_id,session_id,canonical_event_id,observation_ids,review_version,reason)
      VALUES(v_pair_id,v_pair.match_id,v_event.session_id,v_pair.canonical_id,
        jsonb_build_array(least(v_pair.left_id,v_pair.right_id),greatest(v_pair.left_id,v_pair.right_id)),2,'possible_duplicate')
      ON CONFLICT (id) DO UPDATE SET status = 'open', resolution = NULL, reason = 'possible_duplicate',
        team_decisions = '{}'::jsonb, team_decision_notes = '{}'::jsonb,
        resolved_at = NULL, resolved_by_user_id = NULL, updated_at = now()
      WHERE match_event_reviews.resolution = 'events_changed';
    IF EXISTS (SELECT 1 FROM match_event_reviews WHERE id = v_pair_id AND status = 'open') THEN
      UPDATE match_events SET lifecycle_status = 'needs_review', updated_at = now()
        WHERE id IN (p_event, v_pair.canonical_id) AND lifecycle_status NOT IN ('voided','needs_review');
    END IF;
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Retain the original evidence. Only the live canonical rows determine whether
-- a review still applies; a removed event must never poison a surviving one.
CREATE FUNCTION reconcile_match_session_reviews(p_session uuid, p_actor text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_sheet record;
BEGIN
  IF p_session IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text, 0));
  IF EXISTS (SELECT 1 FROM match_sessions WHERE id = p_session AND finalised_at IS NOT NULL)
    AND current_setting('gaffer.applying_amendment', true) IS DISTINCT FROM p_session::text THEN RETURN; END IF;
  UPDATE match_event_reviews review SET status = 'resolved',
    resolution = CASE WHEN left_event.lifecycle_status = 'voided' OR right_event.lifecycle_status = 'voided'
      OR left_event.id IS NULL OR right_event.id IS NULL THEN 'event_removed' ELSE 'events_changed' END,
    resolved_by_user_id = p_actor, resolved_at = now(), disputed_at = NULL, disputed_by_user_id = NULL, updated_at = now()
  FROM match_event_reviews candidate
    LEFT JOIN match_event_memberships left_member ON left_member.observation_id = (candidate.observation_ids->>0)::uuid
    LEFT JOIN match_event_memberships right_member ON right_member.observation_id = (candidate.observation_ids->>1)::uuid
    LEFT JOIN match_events left_event ON left_event.id = left_member.canonical_event_id
    LEFT JOIN match_events right_event ON right_event.id = right_member.canonical_event_id
  WHERE review.id = candidate.id AND candidate.session_id = p_session
    AND candidate.review_version = 2 AND jsonb_array_length(candidate.observation_ids) = 2
    AND (candidate.status = 'open' OR candidate.disputed_at IS NOT NULL)
    AND (
      left_event.id IS NULL OR right_event.id IS NULL
      OR left_event.lifecycle_status = 'voided' OR right_event.lifecycle_status = 'voided'
      OR (left_event.id <> right_event.id AND candidate.reason = 'possible_duplicate'
        AND NOT match_session_events_may_duplicate(left_event, right_event))
    );
  UPDATE match_events event SET lifecycle_status = CASE WHEN EXISTS (
      SELECT 1 FROM match_event_reviews review
      WHERE review.session_id = p_session AND (review.status = 'open' OR review.disputed_at IS NOT NULL)
        AND (review.canonical_event_id = event.id OR EXISTS (
          SELECT 1 FROM match_event_memberships member WHERE member.canonical_event_id = event.id
            AND review.observation_ids ? member.observation_id::text
        ))
    ) THEN 'needs_review' ELSE CASE WHEN event.lifecycle_status = 'needs_review' THEN 'provisional' ELSE event.lifecycle_status END END, updated_at = now()
  WHERE event.session_id = p_session AND event.lifecycle_status <> 'voided'
    AND (event.lifecycle_status = 'needs_review' OR EXISTS (
      SELECT 1 FROM match_event_reviews review
      JOIN match_event_memberships member ON review.observation_ids ? member.observation_id::text
      WHERE review.session_id = p_session AND (review.status = 'open' OR review.disputed_at IS NOT NULL)
        AND member.canonical_event_id = event.id
    ));
  FOR v_sheet IN SELECT id FROM matches WHERE shared_match_id = p_session ORDER BY id LOOP
    PERFORM refresh_match_projection(v_sheet.id);
  END LOOP;
END;
$$;
--> statement-breakpoint
-- Wrap the mutation implementations so online, offline and agreed amendments
-- all reconcile only after their event changes and operation records are complete.
ALTER FUNCTION void_match_session_event_unlocked(uuid,uuid,text,uuid,jsonb,text) RENAME TO void_match_session_event_before_review_cleanup;
--> statement-breakpoint
CREATE FUNCTION void_match_session_event_unlocked(p_id uuid,p_match uuid,p_actor text,p_event uuid,p_parents jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_session uuid;
BEGIN
  PERFORM void_match_session_event_before_review_cleanup(p_id,p_match,p_actor,p_event,p_parents,p_reason);
  SELECT shared_match_id INTO v_session FROM matches WHERE id = p_match;
  PERFORM reconcile_match_session_reviews(v_session, p_actor);
END;
$$;
--> statement-breakpoint
ALTER FUNCTION apply_match_event_mutation_unlocked(uuid,uuid,text,uuid,text,jsonb,jsonb,jsonb,text) RENAME TO apply_match_event_mutation_before_review_cleanup;
--> statement-breakpoint
CREATE FUNCTION apply_match_event_mutation_unlocked(p_id uuid,p_match uuid,p_actor text,p_event uuid,p_type text,
  p_decision jsonb,p_effective jsonb,p_parents jsonb,p_reason text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_session uuid;
BEGIN
  PERFORM apply_match_event_mutation_before_review_cleanup(p_id,p_match,p_actor,p_event,p_type,p_decision,p_effective,p_parents,p_reason);
  SELECT session_id INTO v_session FROM match_events WHERE id = p_event;
  IF p_type = 'correct' AND v_session IS NOT NULL THEN
    -- Corrections carry whole minutes; preserve the original period at the
    -- same minute, and move it when an edit crosses the half-time boundary.
    UPDATE match_events event SET match_elapsed_ms = event.minute * 60000,
      period = CASE WHEN event.minute < 45 THEN 'first_half' ELSE 'second_half' END,
      updated_at = now()
      FROM match_event_observations original
      WHERE event.id = p_event AND original.id = p_event AND p_effective ? 'minute'
        AND event.minute <> floor(original.match_elapsed_ms / 60000)::integer;
    PERFORM refresh_match_session_duplicate_candidates(p_event);
  END IF;
  PERFORM reconcile_match_session_reviews(v_session, p_actor);
END;
$$;
--> statement-breakpoint
-- Session ingestion is additive; the legacy per-match function remains the
-- feature-flag-off path and retains its existing idempotency contract.
CREATE OR REPLACE FUNCTION ingest_match_session_event_observation_unlocked(
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
  -- either sheet create a review edge; they are never silently merged.
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

  PERFORM refresh_match_session_duplicate_candidates(p_observation_id);
  PERFORM reconcile_match_session_reviews(p_session_id, p_actor_id);

  PERFORM refresh_match_projection(p_match_id);
  RETURN p_observation_id;
END;
$$;

--> statement-breakpoint
-- Recheck closure under the session lock: a deletion can race a queued vote.
ALTER FUNCTION resolve_match_session_event_candidate(uuid,uuid,uuid,text,uuid,text,jsonb,text) RENAME TO resolve_match_session_event_candidate_before_review_cleanup;
--> statement-breakpoint
CREATE FUNCTION resolve_match_session_event_candidate(p_review uuid,p_match uuid,p_session uuid,p_actor text,
  p_id uuid,p_resolution text,p_parents jsonb,p_note text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_result uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text, 0));
  IF EXISTS (SELECT 1 FROM match_event_reviews WHERE id = p_review AND session_id = p_session
    AND resolution IN ('event_removed','events_changed')) THEN
    RAISE EXCEPTION 'This review no longer applies. Refresh the review queue.' USING ERRCODE = '22000';
  END IF;
  v_result := resolve_match_session_event_candidate_before_review_cleanup(p_review,p_match,p_session,p_actor,p_id,p_resolution,p_parents,p_note);
  PERFORM reconcile_match_session_reviews(p_session,p_actor);
  RETURN v_result;
END;
$$;
--> statement-breakpoint
-- Repair stale reviews and previously missed manual additions in unlocked reports.
DO $$ DECLARE v_session record; v_event record; BEGIN
  FOR v_session IN SELECT id FROM match_sessions WHERE finalised_at IS NULL ORDER BY id LOOP
    -- Older report additions inherited the full-time clock rather than the
    -- period of the event. Keep observations intact and fix canonical timing.
    UPDATE match_events SET period = CASE WHEN minute < 45 THEN 'first_half' ELSE 'second_half' END,
      updated_at = now()
      WHERE session_id = v_session.id AND manually_adjusted AND period IN ('full_time','not_started')
        AND lifecycle_status <> 'voided';
    FOR v_event IN SELECT id FROM match_events WHERE session_id = v_session.id
      AND manually_adjusted AND lifecycle_status <> 'voided' ORDER BY id LOOP
      PERFORM refresh_match_session_duplicate_candidates(v_event.id);
    END LOOP;
    PERFORM reconcile_match_session_reviews(v_session.id, NULL);
  END LOOP;
END; $$;
