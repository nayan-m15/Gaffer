CREATE TYPE "public"."opponent_squad_visibility" AS ENUM('none', 'numbers', 'full');--> statement-breakpoint
CREATE TABLE "opponent_match_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"shirt_number" integer NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "opponent_player_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "lineup_id" uuid;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "opponent_squad_visibility" "opponent_squad_visibility" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "team_color" text;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "opponent_color" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "primary_color" text;--> statement-breakpoint
ALTER TABLE "opponent_match_players" ADD CONSTRAINT "opponent_match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opponent_match_players_match_id_index" ON "opponent_match_players" USING btree ("match_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opponent_match_players_match_number_unique" ON "opponent_match_players" USING btree ("match_id","shirt_number");--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_opponent_player_id_opponent_match_players_id_fk" FOREIGN KEY ("opponent_player_id") REFERENCES "public"."opponent_match_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_events_opponent_player_id_index" ON "match_events" USING btree ("opponent_player_id");--> statement-breakpoint
CREATE INDEX "matches_lineup_id_index" ON "matches" USING btree ("lineup_id");