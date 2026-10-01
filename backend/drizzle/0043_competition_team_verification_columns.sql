ALTER TABLE competition_teams ADD COLUMN IF NOT EXISTS original_display_name text;
--> statement-breakpoint
ALTER TABLE competition_invites ADD COLUMN IF NOT EXISTS proposed_name text;
--> statement-breakpoint
ALTER TABLE competition_invites ADD COLUMN IF NOT EXISTS proposed_team_id uuid REFERENCES teams(id);
--> statement-breakpoint
ALTER TABLE competition_invites ADD COLUMN IF NOT EXISTS requested_by_user_id text REFERENCES "user"(id);
--> statement-breakpoint
DROP INDEX IF EXISTS competition_invites_pending_slot_unique;
--> statement-breakpoint
CREATE UNIQUE INDEX competition_invites_pending_slot_unique ON competition_invites(competition_team_id) WHERE status IN ('pending','verification');
--> statement-breakpoint
CREATE UNIQUE INDEX competition_invites_verification_team_unique ON competition_invites(competition_id,proposed_team_id) WHERE status = 'verification' AND proposed_team_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX competition_invites_verification_user_unique ON competition_invites(competition_id,requested_by_user_id) WHERE status = 'verification';
