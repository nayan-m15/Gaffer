-- Confirmations apply to the current public canonical timeline and review state.
-- Preserve published results for the existing amendment workflow.
CREATE FUNCTION invalidate_pending_session_confirmations()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_session_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND
     (to_jsonb(NEW) - ARRAY['updated_at', 'projection_revision']) =
     (to_jsonb(OLD) - ARRAY['updated_at', 'projection_revision']) THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'match_events' THEN
    IF TG_OP = 'INSERT' AND NEW.event_type = 'injury' THEN RETURN NEW; END IF;
    IF TG_OP = 'DELETE' AND OLD.event_type = 'injury' THEN RETURN OLD; END IF;
    IF TG_OP = 'UPDATE' AND NEW.event_type = 'injury' AND OLD.event_type = 'injury' THEN RETURN NEW; END IF;
  END IF;
  v_session_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  IF v_session_id IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_session_id::text, 0));
  UPDATE match_sessions SET
    home_confirmed_at = NULL, home_confirmed_by_user_id = NULL,
    away_confirmed_at = NULL, away_confirmed_by_user_id = NULL,
    updated_at = now()
  WHERE id = v_session_id AND finalised_at IS NULL
    AND (home_confirmed_at IS NOT NULL OR away_confirmed_at IS NOT NULL);
  IF FOUND THEN
    UPDATE match_session_participants
    SET confirmation_state = 'pending', updated_at = now()
    WHERE session_id = v_session_id;
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER match_event_invalidate_session_confirmations
AFTER INSERT OR UPDATE OR DELETE ON match_events
FOR EACH ROW EXECUTE FUNCTION invalidate_pending_session_confirmations();
--> statement-breakpoint
CREATE TRIGGER match_review_invalidate_session_confirmations
AFTER INSERT OR UPDATE OR DELETE ON match_event_reviews
FOR EACH ROW EXECUTE FUNCTION invalidate_pending_session_confirmations();
