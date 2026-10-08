CREATE TYPE match_session_side AS ENUM ('home', 'away');
--> statement-breakpoint
CREATE TYPE match_session_confirmation_state AS ENUM ('pending', 'confirmed');
--> statement-breakpoint
CREATE TABLE match_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE match_session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  competition_team_id uuid REFERENCES competition_teams(id) ON DELETE CASCADE,
  side match_session_side NOT NULL,
  confirmation_state match_session_confirmation_state NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_session_participants_identity_check
    CHECK (team_id IS NOT NULL OR competition_team_id IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX match_session_participants_session_side_unique
  ON match_session_participants(session_id, side);
--> statement-breakpoint
CREATE INDEX match_session_participants_team_id_index
  ON match_session_participants(team_id);
--> statement-breakpoint
CREATE INDEX match_session_participants_competition_team_id_index
  ON match_session_participants(competition_team_id);
--> statement-breakpoint
ALTER TABLE matches ADD COLUMN shared_match_id uuid;
--> statement-breakpoint
ALTER TABLE friendly_fixtures ADD COLUMN shared_session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE competition_fixtures ADD COLUMN shared_session_id uuid REFERENCES match_sessions(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX matches_shared_match_id_index ON matches(shared_match_id);
--> statement-breakpoint
CREATE UNIQUE INDEX friendly_fixtures_shared_session_unique
  ON friendly_fixtures(shared_session_id);
--> statement-breakpoint
CREATE UNIQUE INDEX competition_fixtures_shared_session_unique
  ON competition_fixtures(shared_session_id);
--> statement-breakpoint
-- Preserve every existing match primary key and give each legacy match a
-- separate one-sided session. Historical fixture records are deliberately
-- left unlinked so this migration never pairs or merges old match sheets.
UPDATE matches SET shared_match_id = gen_random_uuid();
--> statement-breakpoint
INSERT INTO match_sessions (id, created_at, updated_at)
SELECT shared_match_id, created_at, updated_at
FROM matches
WHERE shared_match_id IS NOT NULL;
--> statement-breakpoint
INSERT INTO match_session_participants
  (session_id, team_id, competition_team_id, side, created_at, updated_at)
SELECT m.shared_match_id,
       e.team_id,
       ct.id,
       CASE WHEN m.is_home THEN 'home'::match_session_side ELSE 'away'::match_session_side END,
       m.created_at,
       m.updated_at
FROM matches m
JOIN events e ON e.id = m.event_id
LEFT JOIN competition_teams ct
  ON ct.competition_id = m.competition_id
 AND ct.team_id = e.team_id
WHERE m.shared_match_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE matches
  ADD CONSTRAINT matches_shared_match_id_match_sessions_id_fk
  FOREIGN KEY (shared_match_id) REFERENCES match_sessions(id) ON DELETE SET NULL;
