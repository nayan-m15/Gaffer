-- Keep the canonical-event privacy gate on the synced row. Joining both a
-- canonical event and an opponent sheet multiplies PowerSync buckets.
ALTER TABLE match_event_reviews
  ADD COLUMN public_canonical_event boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE match_event_operations
  ADD COLUMN public_canonical_event boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX match_event_reviews_canonical_index
  ON match_event_reviews(canonical_event_id);
--> statement-breakpoint
CREATE INDEX match_event_operations_canonical_index
  ON match_event_operations(canonical_event_id);
--> statement-breakpoint
CREATE FUNCTION derive_public_canonical_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  -- A missing canonical event, null session, or a different canonical session
  -- fails closed. Callers cannot make an injury public by setting this column.
  -- Serialize with a concurrent canonical privacy edit before publishing a
  -- dependent row. FOR SHARE also rechecks the row after waiting for an update.
  SELECT session_id = NEW.session_id AND event_type <> 'injury'
    INTO NEW.public_canonical_event
    FROM match_events WHERE id = NEW.canonical_event_id FOR SHARE;
  NEW.public_canonical_event := COALESCE(NEW.public_canonical_event, false);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER match_reviews_derive_public_canonical_event
BEFORE INSERT OR UPDATE OF canonical_event_id, session_id, public_canonical_event
ON match_event_reviews FOR EACH ROW
EXECUTE FUNCTION derive_public_canonical_event();
--> statement-breakpoint
CREATE TRIGGER match_operations_derive_public_canonical_event
BEFORE INSERT OR UPDATE OF canonical_event_id, session_id, public_canonical_event
ON match_event_operations FOR EACH ROW
EXECUTE FUNCTION derive_public_canonical_event();
--> statement-breakpoint
CREATE FUNCTION refresh_public_canonical_event_dependents() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE match_event_reviews
    SET public_canonical_event = false
    WHERE canonical_event_id = NEW.id;
  UPDATE match_event_operations
    SET public_canonical_event = false
    WHERE canonical_event_id = NEW.id;
  -- The BEFORE triggers derive the new value, including a move to/from injury.
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER match_events_refresh_public_canonical_event
AFTER UPDATE OF session_id, event_type ON match_events
FOR EACH ROW WHEN (
  OLD.session_id IS DISTINCT FROM NEW.session_id
  OR OLD.event_type IS DISTINCT FROM NEW.event_type
)
EXECUTE FUNCTION refresh_public_canonical_event_dependents();
--> statement-breakpoint
-- Backfill through the same trigger used for future writes.
-- The derived visibility does not change existing evidence or confirmations.
-- ALTER TABLE holds a transaction lock until migration commit; no concurrent
-- review writes can bypass confirmation invalidation while this is disabled.
ALTER TABLE match_event_reviews
  DISABLE TRIGGER match_review_invalidate_session_confirmations;
--> statement-breakpoint
UPDATE match_event_reviews SET public_canonical_event = false;
--> statement-breakpoint
UPDATE match_event_operations SET public_canonical_event = false;
--> statement-breakpoint
ALTER TABLE match_event_reviews
  ENABLE TRIGGER match_review_invalidate_session_confirmations;
