DO $$ BEGIN
 CREATE TYPE "public"."opponent_squad_visibility" AS ENUM('none', 'numbers', 'full');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opponent_match_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"shirt_number" integer NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "opponent_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "game_plan_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_squad_visibility" "opponent_squad_visibility" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "team_color" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "opponent_color" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN IF NOT EXISTS "primary_color" text;--> statement-breakpoint
DO $$ BEGIN
 IF EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'matches' AND column_name = 'lineup_id'
 ) THEN
  UPDATE "matches" SET "game_plan_id" = "lineup_id" WHERE "game_plan_id" IS NULL;
  ALTER TABLE "matches" DROP COLUMN "lineup_id";
 END IF;

 UPDATE "matches"
 SET "game_plan_id" = NULL
 WHERE "game_plan_id" IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM "game_plans" "gp" WHERE "gp"."id" = "matches"."game_plan_id"
   );
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opponent_match_players" ADD CONSTRAINT "opponent_match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opponent_match_players_match_id_index" ON "opponent_match_players" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opponent_match_players_match_number_unique" ON "opponent_match_players" USING btree ("match_id","shirt_number");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_events" ADD CONSTRAINT "match_events_opponent_player_id_opponent_match_players_id_fk" FOREIGN KEY ("opponent_player_id") REFERENCES "public"."opponent_match_players"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "matches" ADD CONSTRAINT "matches_game_plan_id_game_plans_id_fk" FOREIGN KEY ("game_plan_id") REFERENCES "public"."game_plans"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_events_opponent_player_id_index" ON "match_events" USING btree ("opponent_player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_game_plan_id_index" ON "matches" USING btree ("game_plan_id");
