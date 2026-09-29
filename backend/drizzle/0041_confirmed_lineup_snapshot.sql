ALTER TABLE "event_lineups"
ADD COLUMN IF NOT EXISTS "formation_id" text;

--> statement-breakpoint

ALTER TABLE "event_lineups"
ADD COLUMN IF NOT EXISTS "pitch_assignments" jsonb;

--> statement-breakpoint

ALTER TABLE "event_lineups"
ADD COLUMN IF NOT EXISTS "custom_positions" jsonb;