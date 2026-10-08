-- End/resume both sheets atomically using the existing shared clock authority.
CREATE FUNCTION change_match_play_state(
  p_match uuid, p_actor text, p_finish boolean, p_expected_revision integer
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_session uuid;
  v_revision integer;
  v_elapsed integer;
  v_period text;
  v_operation uuid := gen_random_uuid();
  v_sheet record;
BEGIN
  SELECT m.shared_match_id INTO v_session FROM matches m
    JOIN events e ON e.id = m.event_id
    JOIN team_members member ON member.team_id = e.team_id
    WHERE m.id = p_match AND member.user_id = p_actor;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found.' USING ERRCODE = 'P0002'; END IF;

  -- Use the same lock order as shared report commands and clock writes.
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_session, p_match)::text, 0));
  IF v_session IS NOT NULL THEN
    PERFORM id FROM match_sessions WHERE id = v_session FOR UPDATE;
    IF EXISTS (SELECT 1 FROM match_sessions WHERE id = v_session AND finalised_at IS NOT NULL) THEN
      RAISE EXCEPTION 'The confirmed report is locked. Request an amendment.' USING ERRCODE = '22000';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_session, p_match)::text, 1));
  PERFORM id FROM matches WHERE id = p_match OR (v_session IS NOT NULL AND shared_match_id = v_session)
    ORDER BY id FOR UPDATE;

  SELECT max(m.clock_revision), max(m.clock_elapsed_ms + CASE WHEN m.clock_started_at IS NULL THEN 0
    ELSE greatest(0, floor(extract(epoch FROM (now() - m.clock_started_at)) * 1000)::integer) END)
    INTO v_revision, v_elapsed FROM matches m
    WHERE m.id = p_match OR (v_session IS NOT NULL AND m.shared_match_id = v_session);
  IF v_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'The match clock changed. Refresh and try again.' USING ERRCODE = '22000';
  END IF;
  IF EXISTS (SELECT 1 FROM matches m JOIN events e ON e.id = m.event_id
    WHERE (m.id = p_match OR (v_session IS NOT NULL AND m.shared_match_id = v_session)) AND e.status = 'cancelled') THEN
    RAISE EXCEPTION 'Cancelled matches cannot be resumed or ended.' USING ERRCODE = '22000';
  END IF;
  IF EXISTS (SELECT 1 FROM match_projection_state projection JOIN matches m ON m.id = projection.match_id
    WHERE (m.id = p_match OR (v_session IS NOT NULL AND m.shared_match_id = v_session))
      AND projection.finalisation_state = 'finalised') THEN
    RAISE EXCEPTION 'Reopen the confirmed result before resuming play.' USING ERRCODE = '22000';
  END IF;

  IF p_finish THEN
    v_period := 'full_time';
  ELSE
    IF NOT EXISTS (SELECT 1 FROM matches m JOIN events e ON e.id = m.event_id
      WHERE (m.id = p_match OR (v_session IS NOT NULL AND m.shared_match_id = v_session))
        AND (m.clock_period = 'full_time' OR e.status = 'completed')) THEN
      RETURN p_match;
    END IF;
    SELECT period INTO v_period FROM match_clock_operations
      WHERE (match_id = p_match OR (v_session IS NOT NULL AND session_id = v_session))
        AND period IN ('first_half', 'second_half') AND outcome LIKE 'applied%'
      ORDER BY created_at DESC, id DESC LIMIT 1;
    v_period := coalesce(v_period, CASE WHEN v_elapsed < 2700000 THEN 'first_half' ELSE 'second_half' END);
  END IF;

  PERFORM apply_match_clock_operation(v_operation, p_match, p_actor, v_period, v_elapsed, NOT p_finish,
    v_revision, md5(v_operation::text), now());
  UPDATE events SET status = CASE WHEN p_finish THEN 'completed'::event_status ELSE 'scheduled'::event_status END,
    updated_at = now() WHERE id IN (SELECT event_id FROM matches
      WHERE id = p_match OR (v_session IS NOT NULL AND shared_match_id = v_session));
  IF NOT p_finish AND v_session IS NOT NULL THEN
    UPDATE match_sessions SET report_revision = report_revision + 1,
      home_confirmed_at = NULL, home_confirmed_by_user_id = NULL,
      away_confirmed_at = NULL, away_confirmed_by_user_id = NULL, updated_at = now()
      WHERE id = v_session;
    UPDATE match_session_participants SET confirmation_state = 'pending', updated_at = now()
      WHERE session_id = v_session;
  END IF;
  FOR v_sheet IN SELECT id FROM matches
    WHERE id = p_match OR (v_session IS NOT NULL AND shared_match_id = v_session) ORDER BY id LOOP
    PERFORM refresh_match_projection(v_sheet.id);
  END LOOP;
  RETURN p_match;
END;
$$;
--> statement-breakpoint
-- A delayed full-time command must not end a match that a coach has resumed.
ALTER FUNCTION apply_match_clock_operation(uuid,uuid,text,text,integer,boolean,integer,text,timestamptz)
  RENAME TO apply_match_clock_operation_before_play_state;
--> statement-breakpoint
CREATE FUNCTION apply_match_clock_operation(
  p_operation_id uuid, p_match_id uuid, p_actor_user_id text, p_period text,
  p_elapsed_ms integer, p_running boolean, p_base_revision integer,
  p_payload_hash text, p_client_created_at timestamptz
) RETURNS TABLE (revision integer, operation_outcome text) LANGUAGE plpgsql AS $$
DECLARE v_session uuid; v_revision integer;
BEGIN
  SELECT shared_match_id INTO v_session FROM matches WHERE id = p_match_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_session, p_match_id)::text, 1));
  IF p_period = 'full_time' AND NOT EXISTS (SELECT 1 FROM match_clock_operations WHERE id = p_operation_id) THEN
    SELECT max(clock_revision) INTO v_revision FROM matches
      WHERE id = p_match_id OR (v_session IS NOT NULL AND shared_match_id = v_session);
    IF p_base_revision < v_revision AND EXISTS (
      SELECT 1 FROM match_clock_operations
      WHERE (match_id = p_match_id OR (v_session IS NOT NULL AND session_id = v_session))
        AND period IN ('first_half', 'second_half')
        AND payload_hash = md5(id::text)
        AND applied_revision > p_base_revision
        AND created_at > p_client_created_at
    ) THEN
      RAISE EXCEPTION 'The match clock changed. Refresh and confirm full time again.' USING ERRCODE = '22000';
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM apply_match_clock_operation_before_play_state(
    p_operation_id, p_match_id, p_actor_user_id, p_period, p_elapsed_ms, p_running,
    p_base_revision, p_payload_hash, p_client_created_at);
END;
$$;
