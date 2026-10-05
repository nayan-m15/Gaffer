-- Serialize shared clock writes by session and persist one anchor on both sheets.
CREATE OR REPLACE FUNCTION apply_match_clock_operation(
  p_operation_id uuid,
  p_match_id uuid,
  p_actor_user_id text,
  p_period text,
  p_elapsed_ms integer,
  p_running boolean,
  p_base_revision integer,
  p_payload_hash text,
  p_client_created_at timestamptz
) RETURNS TABLE (revision integer, operation_outcome text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_session_id uuid;
  v_existing_hash text;
  v_existing_revision integer;
  v_existing_outcome text;
  v_current_period text;
  v_current_elapsed integer;
  v_current_started_at timestamptz;
  v_current_revision integer;
  v_outcome text;
BEGIN
  SELECT shared_match_id INTO v_session_id FROM matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(v_session_id, p_match_id)::text, 1));

  SELECT payload_hash, applied_revision, outcome
    INTO v_existing_hash, v_existing_revision, v_existing_outcome
    FROM match_clock_operations WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
      RAISE EXCEPTION 'clock operation id reused with different data' USING ERRCODE = '22000';
    END IF;
    RETURN QUERY SELECT v_existing_revision, v_existing_outcome;
    RETURN;
  END IF;

  PERFORM id FROM matches
    WHERE id = p_match_id OR (v_session_id IS NOT NULL AND shared_match_id = v_session_id)
    ORDER BY id FOR UPDATE;

  -- Existing sessions can have different per-sheet revisions. The last applied
  -- operation identifies the authoritative sheet; revisions then advance globally.
  SELECT m.clock_period, m.clock_elapsed_ms, m.clock_started_at
    INTO v_current_period, v_current_elapsed, v_current_started_at
    FROM match_clock_operations o JOIN matches m ON m.id = o.match_id
    WHERE v_session_id IS NOT NULL AND o.session_id = v_session_id
      AND o.outcome IN ('applied', 'applied_after_stale_base')
    ORDER BY o.created_at DESC, o.id ASC LIMIT 1;
  IF NOT FOUND THEN
    SELECT clock_period, clock_elapsed_ms, clock_started_at
      INTO v_current_period, v_current_elapsed, v_current_started_at
      FROM matches
      WHERE id = p_match_id OR (v_session_id IS NOT NULL AND shared_match_id = v_session_id)
      ORDER BY clock_revision DESC, updated_at DESC, id ASC LIMIT 1;
  END IF;
  SELECT max(clock_revision) INTO v_current_revision FROM matches
    WHERE id = p_match_id OR (v_session_id IS NOT NULL AND shared_match_id = v_session_id);

  IF v_current_period = p_period AND (v_current_started_at IS NOT NULL) = p_running THEN
    v_outcome := 'redundant';
  ELSE
    v_outcome := CASE WHEN p_base_revision = v_current_revision
      THEN 'applied' ELSE 'applied_after_stale_base' END;
    v_current_revision := v_current_revision + 1;
    v_current_period := p_period;
    v_current_elapsed := p_elapsed_ms;
    v_current_started_at := CASE WHEN p_running THEN now() ELSE NULL END;
  END IF;

  UPDATE matches SET clock_period = v_current_period,
    clock_elapsed_ms = v_current_elapsed,
    clock_started_at = v_current_started_at,
    clock_revision = v_current_revision,
    updated_at = now()
    WHERE (id = p_match_id OR (v_session_id IS NOT NULL AND shared_match_id = v_session_id))
      AND (clock_period, clock_elapsed_ms, clock_started_at, clock_revision)
        IS DISTINCT FROM (v_current_period, v_current_elapsed, v_current_started_at, v_current_revision);

  INSERT INTO match_clock_operations (
    id, match_id, session_id, actor_user_id, period, elapsed_ms, running,
    base_revision, applied_revision, outcome, payload_hash, client_created_at
  ) VALUES (
    p_operation_id, p_match_id, v_session_id, p_actor_user_id, p_period, p_elapsed_ms,
    p_running, p_base_revision, v_current_revision, v_outcome, p_payload_hash, p_client_created_at
  );
  RETURN QUERY SELECT v_current_revision, v_outcome;
END;
$$;
