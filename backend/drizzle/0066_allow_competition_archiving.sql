-- Archiving is an operational status change, not a structural competition edit.
-- Preserve the existing protection on match format, rules and other locked fields.
CREATE OR REPLACE FUNCTION guard_competition_settings() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.type = 'friendly' AND NEW.type = 'friendly' THEN RETURN NEW; END IF;
  IF (to_jsonb(NEW) - ARRAY['name','season','season_id','updated_at','admin_user_id','result_tracking_started_at','archived_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['name','season','season_id','updated_at','admin_user_id','result_tracking_started_at','archived_at'])
     AND (EXISTS (SELECT 1 FROM competition_fixtures WHERE competition_id = OLD.id)
          OR competition_has_recorded_activity(OLD.id)) THEN
    RAISE EXCEPTION 'Structural settings cannot change after fixtures or results exist.';
  END IF;
  RETURN NEW;
END $$;
