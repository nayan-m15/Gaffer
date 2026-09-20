-- Surface generated shared-competition fixtures through the existing team Events
-- calendar. One event is created per linked participating team and fixture.
-- Existing generated fixtures are backfilled at the end of this migration.

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "competition_fixture_id" uuid;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "events_competition_fixture_id_index"
  ON "events" USING btree ("competition_fixture_id");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "events_team_competition_fixture_unique"
  ON "events" USING btree ("team_id", "competition_fixture_id");
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_competition_fixture_id_competition_fixtures_id_fk'
      AND conrelid = 'events'::regclass
  ) THEN
    ALTER TABLE "events"
      ADD CONSTRAINT "events_competition_fixture_id_competition_fixtures_id_fk"
      FOREIGN KEY ("competition_fixture_id")
      REFERENCES "public"."competition_fixtures"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint

-- Reconcile the normal team events belonging to one generated fixture. The
-- fixture/participant tables remain authoritative; this function only mirrors
-- linked-team fixtures into the calendar.
CREATE OR REPLACE FUNCTION sync_competition_fixture_events(p_fixture_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_competition_id uuid;
  v_competition_name text;
  v_stage competition_fixture_stage;
  v_round integer;
  v_scheduled_at timestamptz;
  v_fixture_status competition_fixture_status;
  v_linked_match_id uuid;
  v_home_team_id uuid;
  v_away_team_id uuid;
  v_home_name text;
  v_away_name text;
  v_title text;
  v_notes text;
  v_event_status event_status;
  v_linked_event_id uuid;
  v_linked_event_team_id uuid;
BEGIN
  SELECT
    f.competition_id,
    c.name,
    f.stage,
    f.round,
    f.scheduled_at,
    f.status,
    f.linked_match_id,
    home_slot.team_id,
    away_slot.team_id,
    home_slot.display_name,
    away_slot.display_name
  INTO
    v_competition_id,
    v_competition_name,
    v_stage,
    v_round,
    v_scheduled_at,
    v_fixture_status,
    v_linked_match_id,
    v_home_team_id,
    v_away_team_id,
    v_home_name,
    v_away_name
  FROM competition_fixtures f
  JOIN competitions c ON c.id = f.competition_id
  LEFT JOIN competition_teams home_slot
    ON home_slot.id = f.home_competition_team_id
   AND home_slot.competition_id = f.competition_id
  LEFT JOIN competition_teams away_slot
    ON away_slot.id = f.away_competition_team_id
   AND away_slot.competition_id = f.competition_id
  WHERE f.id = p_fixture_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_title := v_competition_name || ': '
    || coalesce(v_home_name, 'TBD') || ' vs ' || coalesce(v_away_name, 'TBD');
  v_notes := 'Generated ' ||
    CASE WHEN v_stage = 'knockout' THEN 'knockout' ELSE 'league' END ||
    ' fixture · Round ' || v_round::text || '.';
  v_event_status := CASE v_fixture_status
    WHEN 'completed' THEN 'completed'::event_status
    WHEN 'cancelled' THEN 'cancelled'::event_status
    ELSE 'scheduled'::event_status
  END;

  -- If this fixture was completed from an older, manually-created team event,
  -- attach that existing event to the fixture rather than creating a duplicate
  -- for that same team. A pre-existing generated event wins if one already
  -- exists, preserving its RSVPs and other team-event data.
  IF v_linked_match_id IS NOT NULL THEN
    SELECT e.id, e.team_id
      INTO v_linked_event_id, v_linked_event_team_id
    FROM matches m
    JOIN events e ON e.id = m.event_id
    WHERE m.id = v_linked_match_id
    LIMIT 1;

    IF v_linked_event_id IS NOT NULL
       AND (v_linked_event_team_id = v_home_team_id OR v_linked_event_team_id = v_away_team_id)
       AND NOT EXISTS (
         SELECT 1
         FROM events existing
         WHERE existing.team_id = v_linked_event_team_id
           AND existing.competition_fixture_id = p_fixture_id
           AND existing.id <> v_linked_event_id
       ) THEN
      UPDATE events
      SET competition_fixture_id = p_fixture_id,
          competition_id = v_competition_id,
          type = 'match',
          title = v_title,
          scheduled_at = v_scheduled_at,
          status = v_event_status,
          updated_at = now()
      WHERE id = v_linked_event_id;
    END IF;
  END IF;

  -- Remove generated calendar rows for teams that no longer occupy this
  -- fixture (for example if a participant link is removed before activity).
  DELETE FROM events e
  WHERE e.competition_fixture_id = p_fixture_id
    AND e.team_id IS DISTINCT FROM v_home_team_id
    AND e.team_id IS DISTINCT FROM v_away_team_id;

  IF v_home_team_id IS NOT NULL THEN
    INSERT INTO events (
      team_id,
      title,
      type,
      status,
      scheduled_at,
      location,
      notes,
      competition_id,
      competition_fixture_id
    ) VALUES (
      v_home_team_id,
      v_title,
      'match',
      v_event_status,
      v_scheduled_at,
      'To be confirmed',
      v_notes,
      v_competition_id,
      p_fixture_id
    )
    ON CONFLICT (team_id, competition_fixture_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      type = 'match',
      status = EXCLUDED.status,
      scheduled_at = EXCLUDED.scheduled_at,
      competition_id = EXCLUDED.competition_id,
      updated_at = now();
  END IF;

  IF v_away_team_id IS NOT NULL THEN
    INSERT INTO events (
      team_id,
      title,
      type,
      status,
      scheduled_at,
      location,
      notes,
      competition_id,
      competition_fixture_id
    ) VALUES (
      v_away_team_id,
      v_title,
      'match',
      v_event_status,
      v_scheduled_at,
      'To be confirmed',
      v_notes,
      v_competition_id,
      p_fixture_id
    )
    ON CONFLICT (team_id, competition_fixture_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      type = 'match',
      status = EXCLUDED.status,
      scheduled_at = EXCLUDED.scheduled_at,
      competition_id = EXCLUDED.competition_id,
      updated_at = now();
  END IF;
END $$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION sync_competition_fixture_events_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM sync_competition_fixture_events(NEW.id);
  RETURN NEW;
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS competition_fixture_event_sync ON competition_fixtures;
--> statement-breakpoint
CREATE TRIGGER competition_fixture_event_sync
AFTER INSERT OR UPDATE OF
  competition_id,
  home_competition_team_id,
  away_competition_team_id,
  scheduled_at,
  status,
  linked_match_id
ON competition_fixtures
FOR EACH ROW EXECUTE FUNCTION sync_competition_fixture_events_trigger();
--> statement-breakpoint

-- Linking an external competition participant to a real Gaffer team must also
-- surface all already-generated fixtures for that team. Display-name changes
-- refresh the event titles too.
CREATE OR REPLACE FUNCTION sync_competition_team_fixture_events_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fixture_row record;
BEGIN
  FOR fixture_row IN
    SELECT f.id
    FROM competition_fixtures f
    WHERE f.competition_id = NEW.competition_id
      AND (
        f.home_competition_team_id = NEW.id
        OR f.away_competition_team_id = NEW.id
      )
  LOOP
    PERFORM sync_competition_fixture_events(fixture_row.id);
  END LOOP;
  RETURN NEW;
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS competition_team_fixture_event_sync ON competition_teams;
--> statement-breakpoint
CREATE TRIGGER competition_team_fixture_event_sync
AFTER INSERT OR UPDATE OF team_id, display_name
ON competition_teams
FOR EACH ROW EXECUTE FUNCTION sync_competition_team_fixture_events_trigger();
--> statement-breakpoint

-- Keep generated event titles current if the competition itself is renamed.
CREATE OR REPLACE FUNCTION sync_competition_name_fixture_events_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  fixture_row record;
BEGIN
  FOR fixture_row IN
    SELECT f.id
    FROM competition_fixtures f
    WHERE f.competition_id = NEW.id
  LOOP
    PERFORM sync_competition_fixture_events(fixture_row.id);
  END LOOP;
  RETURN NEW;
END $$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS competition_name_fixture_event_sync ON competitions;
--> statement-breakpoint
CREATE TRIGGER competition_name_fixture_event_sync
AFTER UPDATE OF name
ON competitions
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name)
EXECUTE FUNCTION sync_competition_name_fixture_events_trigger();
--> statement-breakpoint

-- Backfill every fixture that was generated before this feature existed.
DO $$
DECLARE
  fixture_row record;
BEGIN
  FOR fixture_row IN
    SELECT id FROM competition_fixtures ORDER BY created_at, id
  LOOP
    PERFORM sync_competition_fixture_events(fixture_row.id);
  END LOOP;
END $$;
