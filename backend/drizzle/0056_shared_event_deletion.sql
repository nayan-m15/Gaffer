-- A coach may void a public canonical event from either sheet in their session.
-- Keep the operation on the actor's sheet, and preserve private injury access.
CREATE FUNCTION void_match_session_event(
  p_operation_id uuid, p_match_id uuid, p_actor_id text, p_event_id uuid,
  p_causal_parents jsonb, p_reason text
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_session_id uuid;
  v_existing match_event_operations%rowtype;
  v_event match_events%rowtype;
  v_targets jsonb;
  v_sheet record;
BEGIN
  SELECT m.shared_match_id INTO v_session_id FROM matches m
  JOIN events e ON e.id = m.event_id
  JOIN team_members member ON member.team_id = e.team_id
  JOIN match_session_participants participant
    ON participant.session_id = m.shared_match_id AND participant.team_id = e.team_id
  WHERE m.id = p_match_id AND member.user_id = p_actor_id AND member.role = 'coach';
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'shared match coach access required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session_id::text, 0));
  SELECT * INTO v_existing FROM match_event_operations WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing.match_id <> p_match_id OR v_existing.actor_user_id <> p_actor_id
       OR v_existing.canonical_event_id IS DISTINCT FROM p_event_id
       OR v_existing.operation_type <> 'void'
       OR v_existing.decision <> '{"lifecycleStatus":"voided"}'::jsonb THEN
      RAISE EXCEPTION 'offline operation id reused with different data' USING ERRCODE = '22000';
    END IF;
    RETURN;
  END IF;
  SELECT * INTO v_event FROM match_events
  WHERE id = p_event_id AND session_id = v_session_id
    AND (match_id = p_match_id OR event_type <> 'injury') FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match event not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(jsonb_agg(observation_id ORDER BY observation_id), '[]'::jsonb)
  INTO v_targets FROM match_event_memberships WHERE canonical_event_id = p_event_id;
  UPDATE match_events SET lifecycle_status = 'voided', updated_at = now()
  WHERE id = p_event_id;
  INSERT INTO match_event_operations (
    id, match_id, session_id, actor_user_id, operation_type,
    target_observation_ids, canonical_event_id, causal_parent_ids, decision, reason
  ) VALUES (
    p_operation_id, p_match_id, v_session_id, p_actor_id, 'void', v_targets,
    p_event_id, p_causal_parents, '{"lifecycleStatus":"voided"}'::jsonb, p_reason
  );
  FOR v_sheet IN SELECT id FROM matches WHERE shared_match_id = v_session_id ORDER BY id LOOP
    PERFORM refresh_match_projection(v_sheet.id);
  END LOOP;
END;
$$;
