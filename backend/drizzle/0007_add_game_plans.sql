CREATE TYPE "public"."defensive_style" AS ENUM('drop_back', 'balanced', 'pressure_on_heavy_touch', 'press_after_possession_loss', 'constant_pressure');--> statement-breakpoint
CREATE TYPE "public"."offensive_style" AS ENUM('possession', 'balanced', 'fast_build_up', 'long_ball');--> statement-breakpoint
CREATE TABLE "game_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"formation_id" text DEFAULT '4-3-3' NOT NULL,
	"defensive_style" "defensive_style" DEFAULT 'balanced' NOT NULL,
	"defensive_width" integer DEFAULT 5 NOT NULL,
	"defensive_depth" integer DEFAULT 5 NOT NULL,
	"offensive_style" "offensive_style" DEFAULT 'balanced' NOT NULL,
	"offensive_width" integer DEFAULT 5 NOT NULL,
	"players_in_box" integer DEFAULT 4 NOT NULL,
	"corners_commitment" integer DEFAULT 3 NOT NULL,
	"free_kicks_commitment" integer DEFAULT 3 NOT NULL,
	"captain_id" uuid,
	"free_kick_taker_id" uuid,
	"penalty_taker_id" uuid,
	"corner_taker_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_captain_id_athletes_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_free_kick_taker_id_athletes_id_fk" FOREIGN KEY ("free_kick_taker_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_penalty_taker_id_athletes_id_fk" FOREIGN KEY ("penalty_taker_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_corner_taker_id_athletes_id_fk" FOREIGN KEY ("corner_taker_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_plans_team_id_index" ON "game_plans" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_plans_team_name_unique" ON "game_plans" USING btree ("team_id","name");