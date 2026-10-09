-- Allow a confirmed report to publish when the competition fixture's opponent
-- slot has no connected Gaffer team. Two connected teams still confirm twice.
-- The publish_shared_report function atomically updates scores, fixture status,
-- projection finalisation and shared-session finalisation.
CREATE OR REPLACE FUNCTION confirm_shared_report(p_match uuid, p_actor text, p_revision integer) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_session match_sessions%rowtype; v_side match_session_side;
  v_unconnected_opponent boolean := false;
BEGIN
  SELECT s.* INTO v_session FROM match_sessions s
    JOIN matches m ON m.shared_match_id = s.id
    JOIN events e ON e.id = m.event_id
    JOIN team_members member ON member.team_id = e.team_id AND member.user_id = p_actor AND member.role = 'coach'
    JOIN match_session_participants participant ON participant.session_id = s.id AND participant.team_id = e.team_id
    WHERE m.id = p_match;
  -- Fetch the side separately to keep the rowtype stable as columns are added.
  SELECT participant.side INTO v_side FROM match_session_participants participant JOIN team_members member ON member.team_id = participant.team_id
    WHERE participant.session_id = v_session.id AND member.user_id = p_actor AND member.role = 'coach';
  IF v_side IS NULL THEN RAISE EXCEPTION 'Participating coach required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session.id::text, 0));
  SELECT * INTO v_session FROM match_sessions WHERE id = v_session.id;
  IF v_session.report_revision <> p_revision THEN RAISE EXCEPTION 'Report changed. Review it and confirm again.' USING ERRCODE = '22000'; END IF;
  IF v_session.finalised_at IS NOT NULL THEN RETURN true; END IF;
  IF NOT EXISTS (SELECT 1 FROM matches m JOIN events e ON e.id = m.event_id WHERE m.id = p_match AND e.status = 'completed')
    OR EXISTS (SELECT 1 FROM match_event_reviews WHERE session_id = v_session.id AND public_canonical_event AND (status = 'open' OR disputed_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'Finish the match and resolve reviews before confirming' USING ERRCODE = '22000'; END IF;
  UPDATE match_sessions SET
    home_confirmed_at = CASE WHEN v_side = 'home' THEN now() ELSE home_confirmed_at END,
    home_confirmed_by_user_id = CASE WHEN v_side = 'home' THEN p_actor ELSE home_confirmed_by_user_id END,
    away_confirmed_at = CASE WHEN v_side = 'away' THEN now() ELSE away_confirmed_at END,
    away_confirmed_by_user_id = CASE WHEN v_side = 'away' THEN p_actor ELSE away_confirmed_by_user_id END,
    updated_at = now() WHERE id = v_session.id RETURNING * INTO v_session;
  UPDATE match_session_participants SET confirmation_state = 'confirmed', updated_at = now() WHERE session_id = v_session.id AND side = v_side;
  -- A shared competition fixture may contain an unlinked opponent slot.
  -- Only the coach's own side can approve; do not wait for a nonexistent coach.
  -- Never bypass bilateral confirmation when BOTH competition teams are linked.
  SELECT EXISTS (
    SELECT 1
    FROM competition_fixtures f
    JOIN competition_teams home_slot ON home_slot.id = f.home_competition_team_id
      AND home_slot.competition_id = f.competition_id
    JOIN competition_teams away_slot ON away_slot.id = f.away_competition_team_id
      AND away_slot.competition_id = f.competition_id
    WHERE f.shared_session_id = v_session.id
      AND (
        (v_side = 'home' AND home_slot.team_id IS NOT NULL AND away_slot.team_id IS NULL)
        OR
        (v_side = 'away' AND away_slot.team_id IS NOT NULL AND home_slot.team_id IS NULL)
      )
      AND NOT EXISTS (
        SELECT 1 FROM match_session_participants other_side
        WHERE other_side.session_id = v_session.id
          AND other_side.side <> v_side
          AND other_side.team_id IS NOT NULL
      )
  ) INTO v_unconnected_opponent;
  IF (v_session.home_confirmed_at IS NOT NULL AND v_session.away_confirmed_at IS NOT NULL)
      OR v_unconnected_opponent THEN
    PERFORM publish_shared_report(v_session.id,p_actor); RETURN true;
  END IF;
  RETURN false;
END;
$$;
