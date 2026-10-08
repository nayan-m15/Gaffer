ALTER TABLE match_sessions
  ADD COLUMN home_confirmed_by_user_id text REFERENCES "user"(id),
  ADD COLUMN away_confirmed_by_user_id text REFERENCES "user"(id);
