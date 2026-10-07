ALTER TABLE match_sessions
  ADD COLUMN home_confirmed_at timestamptz,
  ADD COLUMN away_confirmed_at timestamptz,
  ADD COLUMN finalised_at timestamptz,
  ADD COLUMN finalised_by_user_id text REFERENCES "user"(id);
