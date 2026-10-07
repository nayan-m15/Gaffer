ALTER TABLE "game_plans" ADD COLUMN "player_instructions" jsonb DEFAULT '{}'::jsonb NOT NULL;
