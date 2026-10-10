CREATE OR REPLACE FUNCTION set_match_clock_operation_session_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.session_id IS NULL THEN
    SELECT shared_match_id INTO NEW.session_id
    FROM matches
    WHERE id = NEW.match_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER match_clock_operation_session_id
BEFORE INSERT ON match_clock_operations
FOR EACH ROW
EXECUTE FUNCTION set_match_clock_operation_session_id();
