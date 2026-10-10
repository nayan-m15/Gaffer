-- Report additions can be anonymous even when the original has an identified
-- scorer. Missing identity is uncertainty for a coach to review, not evidence
-- that two goals in the same minute are different. Known different players
-- remain excluded, and live same-sheet detection still requires an identity.
CREATE OR REPLACE FUNCTION match_session_events_may_duplicate(p_left match_events, p_right match_events)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT p_left.session_id = p_right.session_id
    AND p_left.side = p_right.side AND p_left.event_type = p_right.event_type
    AND p_left.lifecycle_status <> 'voided' AND p_right.lifecycle_status <> 'voided'
    AND p_left.period = p_right.period
    AND match_event_player_comparison(p_left, p_right) >= 0
    AND (p_left.match_id <> p_right.match_id OR match_event_player_comparison(p_left, p_right) = 1
      OR p_left.manually_adjusted OR p_right.manually_adjusted)
    AND (
      (NOT p_left.manually_adjusted AND NOT p_right.manually_adjusted
        AND abs(p_left.match_elapsed_ms - p_right.match_elapsed_ms) <= 5000)
      OR ((p_left.manually_adjusted OR p_right.manually_adjusted)
        AND p_left.minute = p_right.minute)
    );
$$;
--> statement-breakpoint
-- When an anonymous manual entry wins the canonical ID tie-break, retain the
-- identified player's attribution from the same sheet's other observation.
CREATE OR REPLACE FUNCTION resolve_match_session_event_candidate(p_review uuid,p_match uuid,p_session uuid,p_actor text,
  p_id uuid,p_resolution text,p_parents jsonb,p_note text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_result uuid; v_review match_event_reviews%rowtype;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session::text, 0));
  IF EXISTS (SELECT 1 FROM match_event_reviews WHERE id = p_review AND session_id = p_session
    AND resolution IN ('event_removed','events_changed')) THEN
    RAISE EXCEPTION 'This review no longer applies. Refresh the review queue.' USING ERRCODE = '22000';
  END IF;
  v_result := resolve_match_session_event_candidate_before_review_cleanup(p_review,p_match,p_session,p_actor,p_id,p_resolution,p_parents,p_note);
  SELECT * INTO v_review FROM match_event_reviews WHERE id = p_review;
  IF v_review.status = 'resolved' AND v_review.resolution = 'same_event' THEN
    UPDATE match_events winner SET athlete_id = source.athlete_id,
      opponent_player_id = source.opponent_player_id, opponent_label = source.opponent_label, updated_at = now()
    FROM match_events source
    WHERE winner.id = (SELECT canonical_event_id FROM match_event_memberships WHERE observation_id = (v_review.observation_ids->>0)::uuid)
      AND winner.athlete_id IS NULL AND winner.opponent_player_id IS NULL AND winner.opponent_label IS NULL
      AND source.id = (SELECT candidate.id FROM match_events candidate
        WHERE v_review.observation_ids ? candidate.id::text AND candidate.match_id = winner.match_id
          AND (candidate.athlete_id IS NOT NULL OR candidate.opponent_player_id IS NOT NULL OR candidate.opponent_label IS NOT NULL)
        ORDER BY candidate.created_at,candidate.id LIMIT 1)
      AND NOT EXISTS (SELECT 1 FROM match_event_operations operation
        WHERE operation.canonical_event_id = winner.id AND operation.operation_type = 'correct');
  END IF;
  PERFORM reconcile_match_session_reviews(p_session,p_actor);
  RETURN v_result;
END;
$$;
--> statement-breakpoint
DO $$ DECLARE v_session record; v_event record; BEGIN
  FOR v_session IN SELECT id FROM match_sessions WHERE finalised_at IS NULL ORDER BY id LOOP
    FOR v_event IN SELECT id FROM match_events WHERE session_id = v_session.id
      AND manually_adjusted AND lifecycle_status <> 'voided' ORDER BY id LOOP
      PERFORM refresh_match_session_duplicate_candidates(v_event.id);
    END LOOP;
    PERFORM reconcile_match_session_reviews(v_session.id, NULL);
  END LOOP;
END; $$;
