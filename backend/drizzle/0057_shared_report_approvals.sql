ALTER TABLE match_sessions ADD COLUMN report_revision integer NOT NULL DEFAULT 1;
ALTER TABLE match_event_reviews ADD COLUMN team_decisions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE match_event_reviews ADD COLUMN team_decision_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE match_amendments (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,
  match_id uuid NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  proposed_by_user_id text NOT NULL REFERENCES "user"(id),
  proposed_by_team_id uuid NOT NULL REFERENCES teams(id),
  base_revision integer NOT NULL,
  action text NOT NULL CHECK (action IN ('add', 'correct', 'void')),
  canonical_event_id uuid REFERENCES match_events(id),
  observation_id uuid REFERENCES match_event_observations(id),
  replacement jsonb NOT NULL DEFAULT '{}'::jsonb,
  before_event jsonb,
  after_event jsonb,
  proposed_score jsonb NOT NULL,
  reason text NOT NULL,
  approvals jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'changes_requested', 'withdrawn', 'stale')),
  response_reason text,
  responded_by_user_id text REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX match_amendments_session_index ON match_amendments(session_id, created_at);
--> statement-breakpoint
-- A session lock serialises confirmation, reconciliation and amendments.
CREATE OR REPLACE FUNCTION invalidate_pending_session_confirmations()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_session_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND
    (to_jsonb(NEW) - ARRAY['updated_at', 'projection_revision']) =
    (to_jsonb(OLD) - ARRAY['updated_at', 'projection_revision']) THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'match_events' THEN
    IF TG_OP = 'INSERT' AND NEW.event_type = 'injury' THEN RETURN NEW; END IF;
    IF TG_OP = 'DELETE' AND OLD.event_type = 'injury' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND NEW.event_type = 'injury' AND OLD.event_type = 'injury' THEN RETURN NEW; END IF;
  ELSE
    IF NOT COALESCE(CASE WHEN TG_OP = 'DELETE' THEN OLD.public_canonical_event ELSE NEW.public_canonical_event END, false) THEN RETURN NULL; END IF;
  END IF;
  v_session_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  IF v_session_id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session_id::text, 0));
  UPDATE match_sessions SET report_revision = report_revision + 1,
    home_confirmed_at = CASE WHEN finalised_at IS NULL THEN NULL ELSE home_confirmed_at END,
    home_confirmed_by_user_id = CASE WHEN finalised_at IS NULL THEN NULL ELSE home_confirmed_by_user_id END,
    away_confirmed_at = CASE WHEN finalised_at IS NULL THEN NULL ELSE away_confirmed_at END,
    away_confirmed_by_user_id = CASE WHEN finalised_at IS NULL THEN NULL ELSE away_confirmed_by_user_id END,
    updated_at = now() WHERE id = v_session_id;
  UPDATE match_session_participants SET confirmation_state = 'pending', updated_at = now()
    WHERE session_id = v_session_id AND NOT EXISTS (SELECT 1 FROM match_sessions WHERE id = v_session_id AND finalised_at IS NOT NULL);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION guard_final_shared_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_session uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - ARRAY['updated_at','projection_revision']) =
    (to_jsonb(OLD) - ARRAY['updated_at','projection_revision']) THEN RETURN NEW; END IF;
  IF TG_OP <> 'DELETE' AND NEW.event_type = 'injury' AND (TG_OP = 'INSERT' OR OLD.event_type = 'injury') THEN RETURN NEW; END IF;
  v_session := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  IF v_session IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_session::text, 0));
    IF EXISTS (SELECT 1 FROM match_sessions WHERE id = v_session AND finalised_at IS NOT NULL)
       AND current_setting('gaffer.applying_amendment', true) IS DISTINCT FROM v_session::text THEN
      RAISE EXCEPTION 'Confirmed report is locked. Request an amendment.' USING ERRCODE = '22000';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER guard_final_shared_event BEFORE INSERT OR UPDATE OR DELETE ON match_events
  FOR EACH ROW EXECUTE FUNCTION guard_final_shared_event();
--> statement-breakpoint
CREATE FUNCTION guard_final_shared_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_session uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - ARRAY['updated_at']) = (to_jsonb(OLD) - ARRAY['updated_at']) THEN RETURN NEW; END IF;
  v_session := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  IF v_session IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_session::text,0));
    IF EXISTS (SELECT 1 FROM match_sessions WHERE id = v_session AND finalised_at IS NOT NULL)
      AND EXISTS (SELECT 1 FROM match_events WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.canonical_event_id ELSE NEW.canonical_event_id END AND event_type <> 'injury')
      AND current_setting('gaffer.applying_amendment',true) IS DISTINCT FROM v_session::text THEN
      RAISE EXCEPTION 'Confirmed report is locked. Request an amendment.' USING ERRCODE = '22000';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER guard_final_shared_review BEFORE INSERT OR UPDATE OR DELETE ON match_event_reviews FOR EACH ROW EXECUTE FUNCTION guard_final_shared_review();
--> statement-breakpoint
CREATE FUNCTION propose_match_amendment(p_id uuid, p_match uuid, p_actor text, p_action text,
  p_event uuid, p_observation uuid, p_replacement jsonb, p_reason text,
  p_expected_revision integer DEFAULT NULL, p_self_approve boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_session match_sessions%rowtype; v_team uuid; v_side text; v_role text; v_existing match_amendments%rowtype;
  v_before jsonb; v_after jsonb; v_event_side text; v_home integer; v_away integer; v_delta integer; v_player text;
BEGIN
  SELECT m.shared_match_id, e.team_id, participant.side::text, member.role::text
    INTO v_session.id, v_team, v_side, v_role
    FROM matches m JOIN events e ON e.id = m.event_id
    JOIN team_members member ON member.team_id = e.team_id AND member.user_id = p_actor
    JOIN match_session_participants participant ON participant.session_id = m.shared_match_id AND participant.team_id = e.team_id
    WHERE m.id = p_match;
  IF v_session.id IS NULL THEN RAISE EXCEPTION 'Match participant required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session.id::text, 0));
  SELECT * INTO v_session FROM match_sessions WHERE id = v_session.id;
  IF v_session.finalised_at IS NULL THEN RAISE EXCEPTION 'Only confirmed reports require amendments' USING ERRCODE = '22000'; END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision <> v_session.report_revision THEN
    RAISE EXCEPTION 'The report changed. Review it before proposing an amendment.' USING ERRCODE = '22000'; END IF;
  IF p_replacement->>'eventType' = 'injury' THEN RAISE EXCEPTION 'Injury records remain private' USING ERRCODE = '22000'; END IF;
  SELECT * INTO v_existing FROM match_amendments WHERE id = p_id;
  IF FOUND THEN

    IF v_existing.match_id <> p_match OR v_existing.proposed_by_user_id <> p_actor OR v_existing.action <> p_action
      OR v_existing.canonical_event_id IS DISTINCT FROM p_event OR v_existing.observation_id IS DISTINCT FROM p_observation
      OR v_existing.replacement <> p_replacement OR v_existing.reason <> p_reason THEN
      RAISE EXCEPTION 'Amendment id reused with different data' USING ERRCODE = '22000'; END IF;
    RETURN p_id;
  END IF;
  IF p_event IS NOT NULL AND NOT EXISTS (SELECT 1 FROM match_events WHERE id = p_event AND session_id = v_session.id AND event_type <> 'injury') THEN
    RAISE EXCEPTION 'Public match event not found' USING ERRCODE = 'P0002'; END IF;
  SELECT jsonb_build_object('eventType',event.event_type,'minute',event.minute,'playerLabel',
      COALESCE(player.first_name || ' ' || player.last_name,event.opponent_label)),event.side::text INTO v_before,v_event_side
    FROM match_events event LEFT JOIN athletes player ON player.id = event.athlete_id WHERE event.id = p_event;
  IF p_action = 'add' THEN
    v_event_side := CASE WHEN (v_side = 'home' AND p_replacement->>'team' = 'own') OR (v_side = 'away' AND p_replacement->>'team' = 'opponent') THEN 'home' ELSE 'away' END;
  END IF;
  SELECT first_name || ' ' || last_name INTO v_player FROM athletes WHERE id = (p_replacement->>'athleteId')::uuid;
  v_after := CASE WHEN p_action = 'void' THEN NULL ELSE jsonb_build_object(
    'eventType',COALESCE(p_replacement->>'eventType',v_before->>'eventType'),
    'minute',COALESCE((p_replacement->>'minute')::integer,(v_before->>'minute')::integer),
    'playerLabel',COALESCE(v_player,p_replacement->>'opponentLabel',v_before->>'playerLabel')) END;
  SELECT count(*) FILTER (WHERE side = 'home'),count(*) FILTER (WHERE side = 'away') INTO v_home,v_away
    FROM match_events WHERE session_id = v_session.id AND event_type = 'goal' AND lifecycle_status <> 'voided';
  v_delta := CASE WHEN v_after->>'eventType' = 'goal' THEN 1 ELSE 0 END - CASE WHEN v_before->>'eventType' = 'goal' THEN 1 ELSE 0 END;
  IF v_event_side = 'home' THEN v_home := v_home + v_delta; ELSE v_away := v_away + v_delta; END IF;
  INSERT INTO match_amendments(id, session_id, match_id, proposed_by_user_id, proposed_by_team_id,
    base_revision, action, canonical_event_id, observation_id, replacement, reason, approvals,before_event,after_event,proposed_score)
    VALUES(p_id, v_session.id, p_match, p_actor, v_team, v_session.report_revision, p_action, p_event,
      p_observation, p_replacement, p_reason,
      CASE WHEN v_role = 'coach' AND p_self_approve AND p_expected_revision IS NOT NULL THEN jsonb_build_object(v_side, p_actor) ELSE '{}'::jsonb END,
      v_before,v_after,jsonb_build_object('home',v_home,'away',v_away));
  RETURN p_id;
END;
$$;
--> statement-breakpoint
-- Preserve late observations as evidence without inserting into the official timeline.
ALTER FUNCTION ingest_match_session_event_observation(uuid,uuid,uuid,match_session_side,uuid,text,match_event_type,match_event_team,uuid,text,uuid,text,integer,integer,text,jsonb,text,timestamptz,boolean)
  RENAME TO ingest_match_session_event_observation_unlocked;
CREATE FUNCTION ingest_match_session_event_observation(
  p_observation_id uuid, p_match_id uuid, p_session_id uuid, p_side match_session_side,
  p_device_id uuid, p_actor_id text, p_event_type match_event_type, p_team match_event_team,
  p_athlete_id uuid, p_opponent_label text, p_opponent_player_id uuid, p_period text,
  p_elapsed_ms integer, p_minute integer, p_detail text, p_payload jsonb, p_payload_hash text,
  p_client_created_at timestamptz, p_manually_adjusted boolean
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_hash text; v_match uuid; v_result uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  SELECT canonical_event_id INTO v_result FROM match_event_memberships WHERE observation_id = p_observation_id;
  IF v_result IS NOT NULL OR p_event_type = 'injury' OR NOT EXISTS (SELECT 1 FROM match_sessions WHERE id = p_session_id AND finalised_at IS NOT NULL) THEN
    RETURN ingest_match_session_event_observation_unlocked(p_observation_id,p_match_id,p_session_id,p_side,p_device_id,
      p_actor_id,p_event_type,p_team,p_athlete_id,p_opponent_label,p_opponent_player_id,p_period,p_elapsed_ms,p_minute,
      p_detail,p_payload,p_payload_hash,p_client_created_at,p_manually_adjusted);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM matches WHERE id = p_match_id AND shared_match_id = p_session_id) THEN
    RAISE EXCEPTION 'Session identity mismatch' USING ERRCODE = '22000'; END IF;
  INSERT INTO match_event_observations(id,match_id,session_id,side,device_id,logged_by_user_id,event_type,team,
    athlete_id,opponent_label,opponent_player_id,period,match_elapsed_ms,payload,payload_hash,client_created_at)
    VALUES(p_observation_id,p_match_id,p_session_id,p_side,p_device_id,p_actor_id,p_event_type,p_team,p_athlete_id,
      p_opponent_label,p_opponent_player_id,p_period,p_elapsed_ms,p_payload,p_payload_hash,p_client_created_at)
    ON CONFLICT (id) DO NOTHING;
  SELECT payload_hash, match_id INTO v_hash,v_match FROM match_event_observations WHERE id = p_observation_id;
  IF v_hash IS DISTINCT FROM p_payload_hash OR v_match IS DISTINCT FROM p_match_id THEN
    RAISE EXCEPTION 'Offline operation id reused with different data' USING ERRCODE = '22000'; END IF;
  PERFORM propose_match_amendment(p_observation_id,p_match_id,p_actor_id,'add',NULL,p_observation_id,
    p_payload || jsonb_build_object('minute',p_minute),'Late observation received after confirmation');
  RETURN NULL;
END;
$$;
--> statement-breakpoint
-- A cross-team review records each team's position before applying a decision.
DROP FUNCTION resolve_match_session_event_candidate(uuid,uuid,uuid,text,uuid,text,jsonb);
CREATE FUNCTION resolve_match_session_event_candidate(
  p_review_id uuid, p_match_id uuid, p_session_id uuid, p_actor_id text,
  p_operation_id uuid, p_resolution text, p_causal_parents jsonb, p_note text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_review match_event_reviews%rowtype; v_side text; v_teams integer; v_existing match_event_operations%rowtype;
  v_result uuid; v_apply_id uuid; v_parents jsonb; v_sheet record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  IF EXISTS (SELECT 1 FROM match_sessions WHERE id = p_session_id AND finalised_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirmed report is locked. Request an amendment.' USING ERRCODE = '22000'; END IF;
  SELECT participant.side::text INTO v_side FROM match_session_participants participant
    JOIN team_members member ON member.team_id = participant.team_id
    WHERE participant.session_id = p_session_id AND member.user_id = p_actor_id AND member.role = 'coach';
  IF v_side IS NULL THEN RAISE EXCEPTION 'Participating coach required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_review FROM match_event_reviews WHERE id = p_review_id AND session_id = p_session_id AND match_id = p_match_id FOR UPDATE;
  IF NOT FOUND OR p_resolution NOT IN ('same_event','separate_events') THEN RAISE EXCEPTION 'Candidate review not found' USING ERRCODE = '22000'; END IF;
  SELECT * INTO v_existing FROM match_event_operations WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_id OR v_existing.match_id <> p_match_id
      OR v_existing.decision->>'reviewId' <> p_review_id::text OR v_existing.decision->>'resolution' <> p_resolution
      OR v_existing.decision->>'explanation' IS DISTINCT FROM p_note THEN
      RAISE EXCEPTION 'Offline operation id reused with different data' USING ERRCODE = '22000'; END IF;
    RETURN v_existing.canonical_event_id;
  END IF;
  SELECT count(DISTINCT e.team_id) INTO v_teams FROM match_event_observations obs
    JOIN matches m ON m.id = obs.match_id JOIN events e ON e.id = m.event_id
    WHERE obs.id IN (SELECT value::uuid FROM jsonb_array_elements_text(v_review.observation_ids));
  IF v_teams < 2 THEN
    v_result := resolve_match_event_candidate(p_review_id,p_match_id,p_actor_id,p_operation_id,p_resolution,p_causal_parents);
    UPDATE match_event_operations SET session_id = p_session_id WHERE id = p_operation_id;
    RETURN v_result;
  END IF;
  IF v_review.status = 'resolved' THEN
    IF v_review.resolution = p_resolution AND v_review.disputed_at IS NULL THEN RETURN v_review.canonical_event_id; END IF;
    v_review.team_decisions := '{}'::jsonb;
    v_review.team_decision_notes := '{}'::jsonb;
  END IF;
  v_review.team_decisions := v_review.team_decisions || jsonb_build_object(v_side,p_resolution);
  UPDATE match_event_reviews SET status = 'open', team_decisions = v_review.team_decisions,
    team_decision_notes = v_review.team_decision_notes || jsonb_build_object(v_side,p_note),
    disputed_at = NULL, disputed_by_user_id = NULL, updated_at = now() WHERE id = p_review_id;
  INSERT INTO match_event_operations(id,match_id,session_id,actor_user_id,operation_type,target_observation_ids,
    canonical_event_id,causal_parent_ids,decision)
    VALUES(p_operation_id,p_match_id,p_session_id,p_actor_id,'review_vote',v_review.observation_ids,
      v_review.canonical_event_id,p_causal_parents,jsonb_build_object('reviewId',p_review_id,'resolution',p_resolution,'side',v_side,'explanation',p_note));
  v_result := v_review.canonical_event_id;
  IF v_review.team_decisions->>'home' = p_resolution AND v_review.team_decisions->>'away' = p_resolution THEN
    v_apply_id := md5(p_operation_id::text || ':agreement')::uuid;
    SELECT COALESCE(jsonb_agg(id::text),'[]'::jsonb) INTO v_parents FROM match_event_operations WHERE decision->>'reviewId' = p_review_id::text;
    v_result := resolve_match_event_candidate(p_review_id,p_match_id,p_actor_id,v_apply_id,p_resolution,v_parents);
    UPDATE match_event_operations SET session_id = p_session_id WHERE id = v_apply_id;
  END IF;
  FOR v_sheet IN SELECT id FROM matches WHERE shared_match_id = p_session_id ORDER BY id LOOP
    PERFORM refresh_match_projection(v_sheet.id);
  END LOOP;
  RETURN v_result;
END;
$$;
--> statement-breakpoint
-- Publish scores and projections with the accepted report, in the same transaction.
CREATE FUNCTION publish_shared_report(p_session uuid, p_actor text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_home integer; v_away integer; v_fixture competition_fixtures%rowtype; v_winner uuid; v_sheet record;
BEGIN
  SELECT count(*) FILTER (WHERE side = 'home'), count(*) FILTER (WHERE side = 'away') INTO v_home,v_away
    FROM match_events WHERE session_id = p_session AND event_type = 'goal' AND lifecycle_status <> 'voided';
  SELECT * INTO v_fixture FROM competition_fixtures WHERE shared_session_id = p_session FOR UPDATE;
  IF FOUND THEN
    IF v_fixture.stage = 'league' AND (v_fixture.home_score IS DISTINCT FROM v_home OR v_fixture.away_score IS DISTINCT FROM v_away)
      AND EXISTS (SELECT 1 FROM competitions WHERE id = v_fixture.competition_id AND format = 'league_knockout')
      AND EXISTS (SELECT 1 FROM competition_fixtures WHERE competition_id = v_fixture.competition_id AND stage = 'knockout') THEN
      RAISE EXCEPTION 'League-phase results cannot change after the knockout stage has been created.' USING ERRCODE = '22000'; END IF;
    v_winner := CASE WHEN v_home > v_away THEN v_fixture.home_competition_team_id WHEN v_away > v_home THEN v_fixture.away_competition_team_id ELSE NULL END;
    IF v_fixture.stage = 'knockout' AND v_winner IS NULL THEN RAISE EXCEPTION 'Knockout result requires a winner' USING ERRCODE = '22000'; END IF;
    IF v_fixture.next_fixture_id IS NOT NULL AND v_fixture.winner_competition_team_id IS DISTINCT FROM v_winner AND EXISTS
      (SELECT 1 FROM competition_fixtures WHERE id = v_fixture.next_fixture_id AND
        (status <> 'scheduled' OR home_score IS NOT NULL OR away_score IS NOT NULL OR winner_competition_team_id IS NOT NULL OR linked_match_id IS NOT NULL OR legacy_result_id IS NOT NULL)) THEN
      RAISE EXCEPTION 'The next round has started; organiser review is required' USING ERRCODE = '22000'; END IF;
    UPDATE competition_fixtures SET status = 'completed', home_score = v_home, away_score = v_away,
      winner_competition_team_id = CASE WHEN stage = 'knockout' THEN v_winner ELSE NULL END, updated_at = now() WHERE id = v_fixture.id;
    IF v_fixture.stage = 'knockout' AND v_fixture.next_fixture_id IS NOT NULL THEN
      UPDATE competition_fixtures SET home_competition_team_id = CASE WHEN v_fixture.next_fixture_slot = 'home' THEN v_winner ELSE home_competition_team_id END,
        away_competition_team_id = CASE WHEN v_fixture.next_fixture_slot = 'away' THEN v_winner ELSE away_competition_team_id END, updated_at = now()
        WHERE id = v_fixture.next_fixture_id;
    END IF;
  END IF;
  FOR v_sheet IN SELECT id FROM matches WHERE shared_match_id = p_session ORDER BY id LOOP
    PERFORM refresh_match_projection(v_sheet.id);
  END LOOP;
  UPDATE match_projection_state SET finalisation_state = 'finalised', finalised_at = now(), finalised_by_user_id = p_actor,
    updated_at = now() WHERE session_id = p_session;
  UPDATE matches SET team_score = CASE WHEN is_home THEN v_home ELSE v_away END,
    opponent_score = CASE WHEN is_home THEN v_away ELSE v_home END, updated_at = now() WHERE shared_match_id = p_session;
  UPDATE match_sessions SET finalised_at = now(), finalised_by_user_id = p_actor, updated_at = now() WHERE id = p_session;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION withdraw_shared_confirmation(p_match uuid,p_actor text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_session uuid; v_side match_session_side;
BEGIN
  SELECT m.shared_match_id, participant.side INTO v_session,v_side FROM matches m JOIN events e ON e.id = m.event_id
    JOIN team_members member ON member.team_id = e.team_id AND member.user_id = p_actor AND member.role = 'coach'
    JOIN match_session_participants participant ON participant.session_id = m.shared_match_id AND participant.team_id = e.team_id
    WHERE m.id = p_match;
  IF v_session IS NULL THEN RAISE EXCEPTION 'Participating coach required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session::text,0));
  IF EXISTS(SELECT 1 FROM match_sessions WHERE id = v_session AND finalised_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirmed report is locked. Request an amendment.' USING ERRCODE = '22000'; END IF;
  UPDATE match_sessions SET
    home_confirmed_at = CASE WHEN v_side = 'home' THEN NULL ELSE home_confirmed_at END,
    home_confirmed_by_user_id = CASE WHEN v_side = 'home' THEN NULL ELSE home_confirmed_by_user_id END,
    away_confirmed_at = CASE WHEN v_side = 'away' THEN NULL ELSE away_confirmed_at END,
    away_confirmed_by_user_id = CASE WHEN v_side = 'away' THEN NULL ELSE away_confirmed_by_user_id END,
    updated_at = now() WHERE id = v_session;
  UPDATE match_session_participants SET confirmation_state = 'pending', updated_at = now() WHERE session_id = v_session AND side = v_side;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION confirm_shared_report(p_match uuid, p_actor text, p_revision integer) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v_session match_sessions%rowtype; v_side match_session_side;
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
  IF v_session.home_confirmed_at IS NOT NULL AND v_session.away_confirmed_at IS NOT NULL THEN
    PERFORM publish_shared_report(v_session.id,p_actor); RETURN true;
  END IF;
  RETURN false;
END;
$$;
--> statement-breakpoint
ALTER FUNCTION apply_match_event_mutation(uuid,uuid,text,uuid,text,jsonb,jsonb,jsonb,text) RENAME TO apply_match_event_mutation_unlocked;
CREATE FUNCTION apply_match_event_mutation(p_id uuid,p_match uuid,p_actor text,p_event uuid,p_type text,
  p_decision jsonb,p_effective jsonb,p_parents jsonb,p_reason text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_session uuid;
BEGIN
  SELECT session_id INTO v_session FROM match_events WHERE id = p_event AND match_id = p_match AND event_type <> 'injury';
  IF v_session IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_session::text,0));
    IF EXISTS (SELECT 1 FROM match_sessions WHERE id = v_session AND finalised_at IS NOT NULL)
      AND current_setting('gaffer.applying_amendment',true) IS DISTINCT FROM v_session::text THEN
      PERFORM propose_match_amendment(p_id,p_match,p_actor,CASE WHEN p_type = 'void' THEN 'void' ELSE 'correct' END,
        p_event,NULL,CASE WHEN p_type = 'propose_correction' THEN p_decision->'replacement' ELSE p_effective END,
        COALESCE(p_reason,'Correction received after confirmation'));
      RETURN;
    END IF;
  END IF;
  PERFORM apply_match_event_mutation_unlocked(p_id,p_match,p_actor,p_event,p_type,p_decision,p_effective,p_parents,p_reason);
END;
$$;
--> statement-breakpoint
ALTER FUNCTION void_match_session_event(uuid,uuid,text,uuid,jsonb,text) RENAME TO void_match_session_event_unlocked;
CREATE FUNCTION void_match_session_event(p_id uuid,p_match uuid,p_actor text,p_event uuid,p_parents jsonb,p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_session uuid;
BEGIN
  SELECT shared_match_id INTO v_session FROM matches WHERE id = p_match;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session::text,0));
  IF EXISTS (SELECT 1 FROM match_sessions WHERE id = v_session AND finalised_at IS NOT NULL)
    AND EXISTS (SELECT 1 FROM match_events WHERE id = p_event AND session_id = v_session AND event_type <> 'injury')
    AND current_setting('gaffer.applying_amendment',true) IS DISTINCT FROM v_session::text THEN
    PERFORM propose_match_amendment(p_id,p_match,p_actor,'void',p_event,NULL,'{}'::jsonb,
      COALESCE(p_reason,'Deletion received after confirmation'));
    RETURN;
  END IF;
  PERFORM void_match_session_event_unlocked(p_id,p_match,p_actor,p_event,p_parents,p_reason);
END;
$$;
--> statement-breakpoint
CREATE FUNCTION respond_match_amendment(p_id uuid,p_actor text,p_response text,p_reason text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_amendment match_amendments%rowtype; v_side text; v_session match_sessions%rowtype;
  v_data jsonb; v_id uuid; v_owner_match uuid; v_apply_actor text;
BEGIN
  SELECT * INTO v_amendment FROM match_amendments WHERE id = p_id;
  SELECT participant.side::text INTO v_side FROM match_session_participants participant JOIN team_members member ON member.team_id = participant.team_id
    WHERE participant.session_id = v_amendment.session_id AND member.user_id = p_actor AND member.role = 'coach';
  IF v_side IS NULL THEN RAISE EXCEPTION 'Participating coach required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_amendment.session_id::text,0));
  SELECT * INTO v_amendment FROM match_amendments WHERE id = p_id FOR UPDATE;
  IF v_amendment.status <> 'pending' THEN RETURN v_amendment.status; END IF;
  IF p_response NOT IN ('approve','reject','request_changes','withdraw') THEN RAISE EXCEPTION 'Invalid response' USING ERRCODE = '22000'; END IF;
  IF p_response = 'withdraw' AND NOT EXISTS (SELECT 1 FROM team_members WHERE user_id = p_actor AND team_id = v_amendment.proposed_by_team_id AND role = 'coach') THEN
    RAISE EXCEPTION 'Only proposing team can withdraw' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_session FROM match_sessions WHERE id = v_amendment.session_id;
  IF v_session.report_revision <> v_amendment.base_revision THEN
    UPDATE match_amendments SET status = 'stale', updated_at = now() WHERE id = p_id; RETURN 'stale'; END IF;
  IF p_response <> 'approve' THEN
    UPDATE match_amendments SET status = CASE p_response WHEN 'reject' THEN 'rejected' WHEN 'withdraw' THEN 'withdrawn' ELSE 'changes_requested' END,
      response_reason = p_reason, responded_by_user_id = p_actor, updated_at = now() WHERE id = p_id;
    RETURN CASE p_response WHEN 'reject' THEN 'rejected' WHEN 'withdraw' THEN 'withdrawn' ELSE 'changes_requested' END;
  END IF;
  v_amendment.approvals := v_amendment.approvals || jsonb_build_object(v_side,p_actor);
  -- A removed coach's earlier approval cannot authorize a later publication.
  SELECT COALESCE(jsonb_object_agg(approval.key,approval.value),'{}'::jsonb) INTO v_amendment.approvals
    FROM jsonb_each_text(v_amendment.approvals) approval
    WHERE EXISTS (SELECT 1 FROM match_session_participants participant JOIN team_members member ON member.team_id = participant.team_id
      WHERE participant.session_id = v_amendment.session_id AND participant.side::text = approval.key AND member.user_id = approval.value AND member.role = 'coach');
  UPDATE match_amendments SET approvals = v_amendment.approvals, updated_at = now() WHERE id = p_id;
  IF NOT (v_amendment.approvals ? 'home' AND v_amendment.approvals ? 'away') THEN RETURN 'pending'; END IF;
  PERFORM set_config('gaffer.applying_amendment',v_amendment.session_id::text,true);
  v_data := v_amendment.replacement;
  v_id := md5(p_id::text || ':accepted')::uuid;
  SELECT v_amendment.approvals->>CASE WHEN is_home THEN 'home' ELSE 'away' END INTO v_apply_actor FROM matches WHERE id = v_amendment.match_id;
  IF v_amendment.action = 'add' THEN
    INSERT INTO match_events(id,match_id,session_id,side,team,event_type,minute,period,match_elapsed_ms,athlete_id,
      opponent_label,opponent_player_id,detail,logged_by_user_id,manually_adjusted,client_request_id,structured_payload,lifecycle_status)
      SELECT COALESCE(v_amendment.observation_id,v_id),m.id,m.shared_match_id,
        CASE WHEN (m.is_home AND v_data->>'team' = 'own') OR (NOT m.is_home AND v_data->>'team' = 'opponent') THEN 'home'::match_session_side ELSE 'away'::match_session_side END,
        (v_data->>'team')::match_event_team,(v_data->>'eventType')::match_event_type,(v_data->>'minute')::integer,
        COALESCE(v_data->>'period','full_time'),COALESCE((v_data->>'matchElapsedMs')::integer,(v_data->>'minute')::integer*60000),
        (v_data->>'athleteId')::uuid,v_data->>'opponentLabel',(v_data->>'opponentPlayerId')::uuid,v_data->>'detail',
        v_amendment.proposed_by_user_id,true,COALESCE(v_amendment.observation_id,v_id),v_data,'confirmed'
        FROM matches m WHERE m.id = v_amendment.match_id;
    IF v_amendment.observation_id IS NOT NULL THEN
      INSERT INTO match_event_memberships(observation_id,canonical_event_id) VALUES(v_amendment.observation_id,v_amendment.observation_id);
    END IF;
  ELSIF v_amendment.action = 'void' THEN
    PERFORM void_match_session_event_unlocked(v_id,v_amendment.match_id,v_apply_actor,v_amendment.canonical_event_id,'[]'::jsonb,v_amendment.reason);
  ELSE
    SELECT match_id INTO v_owner_match FROM match_events WHERE id = v_amendment.canonical_event_id;
    SELECT v_amendment.approvals->>CASE WHEN is_home THEN 'home' ELSE 'away' END INTO v_apply_actor FROM matches WHERE id = v_owner_match;
    PERFORM apply_match_event_mutation_unlocked(v_id,v_owner_match,v_apply_actor,v_amendment.canonical_event_id,'correct',
      jsonb_build_object('replacement',v_data),v_data,'[]'::jsonb,v_amendment.reason);
  END IF;
  PERFORM publish_shared_report(v_amendment.session_id,p_actor);
  UPDATE match_amendments SET status = 'accepted', responded_by_user_id = p_actor, updated_at = now() WHERE id = p_id;
  UPDATE match_amendments SET status = 'stale', updated_at = now() WHERE session_id = v_amendment.session_id AND status = 'pending' AND id <> p_id;
  PERFORM set_config('gaffer.applying_amendment','',true);
  RETURN 'accepted';
END;
$$;
