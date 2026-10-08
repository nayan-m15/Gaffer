ALTER TABLE match_event_observations
  ADD COLUMN session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL,
  ADD COLUMN side match_session_side;
--> statement-breakpoint
ALTER TABLE match_events
  ADD COLUMN session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL,
  ADD COLUMN side match_session_side;
--> statement-breakpoint
ALTER TABLE match_event_reviews
  ADD COLUMN session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE match_event_operations
  ADD COLUMN session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE match_clock_operations
  ADD COLUMN session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE match_projection_state
  ADD COLUMN session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
UPDATE match_event_observations observation
SET session_id = match.shared_match_id,
    side = CASE
      WHEN observation.team = 'own' AND match.is_home THEN 'home'::match_session_side
      WHEN observation.team = 'own' AND NOT match.is_home THEN 'away'::match_session_side
      WHEN observation.team = 'opponent' AND match.is_home THEN 'away'::match_session_side
      ELSE 'home'::match_session_side
    END
FROM matches match
WHERE observation.match_id = match.id;
--> statement-breakpoint
UPDATE match_events event
SET session_id = match.shared_match_id,
    side = CASE
      WHEN event.team = 'own' AND match.is_home THEN 'home'::match_session_side
      WHEN event.team = 'own' AND NOT match.is_home THEN 'away'::match_session_side
      WHEN event.team = 'opponent' AND match.is_home THEN 'away'::match_session_side
      ELSE 'home'::match_session_side
    END
FROM matches match
WHERE event.match_id = match.id;
--> statement-breakpoint
UPDATE match_event_reviews review
SET session_id = match.shared_match_id
FROM matches match
WHERE review.match_id = match.id;
--> statement-breakpoint
UPDATE match_event_operations operation
SET session_id = match.shared_match_id
FROM matches match
WHERE operation.match_id = match.id;
--> statement-breakpoint
UPDATE match_clock_operations operation
SET session_id = match.shared_match_id
FROM matches match
WHERE operation.match_id = match.id;
--> statement-breakpoint
UPDATE match_projection_state projection
SET session_id = match.shared_match_id
FROM matches match
WHERE projection.match_id = match.id;
--> statement-breakpoint
CREATE INDEX match_event_observations_session_side_index
  ON match_event_observations(session_id, side, period, match_elapsed_ms);
--> statement-breakpoint
CREATE INDEX match_events_session_side_index
  ON match_events(session_id, side, period, match_elapsed_ms);
--> statement-breakpoint
CREATE INDEX match_event_reviews_session_status_index
  ON match_event_reviews(session_id, status);
--> statement-breakpoint
CREATE INDEX match_event_operations_session_index
  ON match_event_operations(session_id, created_at);
--> statement-breakpoint
CREATE INDEX match_clock_operations_session_index
  ON match_clock_operations(session_id, applied_revision);
--> statement-breakpoint
CREATE INDEX match_projection_state_session_index
  ON match_projection_state(session_id);
