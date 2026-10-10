ALTER TABLE match_event_reviews
  ADD COLUMN disputed_by_user_id text REFERENCES "user"(id),
  ADD COLUMN disputed_at timestamptz;
