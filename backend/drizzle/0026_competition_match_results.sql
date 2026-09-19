ALTER TABLE "competitions" ADD COLUMN "result_tracking_started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "opponent_competition_team_id" uuid;--> statement-breakpoint
CREATE TABLE "competition_matches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid NOT NULL,
  "home_competition_team_id" uuid NOT NULL,
  "away_competition_team_id" uuid NOT NULL,
  "home_score" integer DEFAULT 0 NOT NULL,
  "away_score" integer DEFAULT 0 NOT NULL,
  "played_at" timestamp with time zone NOT NULL,
  "created_by_user_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_opponent_competition_team_id_competition_teams_id_fk" FOREIGN KEY ("opponent_competition_team_id") REFERENCES "public"."competition_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_home_competition_team_id_competition_teams_id_fk" FOREIGN KEY ("home_competition_team_id") REFERENCES "public"."competition_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_away_competition_team_id_competition_teams_id_fk" FOREIGN KEY ("away_competition_team_id") REFERENCES "public"."competition_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_matches" ADD CONSTRAINT "competition_matches_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "matches_opponent_competition_team_id_index" ON "matches" USING btree ("opponent_competition_team_id");--> statement-breakpoint
CREATE INDEX "competition_matches_competition_id_index" ON "competition_matches" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "competition_matches_home_team_id_index" ON "competition_matches" USING btree ("home_competition_team_id");--> statement-breakpoint
CREATE INDEX "competition_matches_away_team_id_index" ON "competition_matches" USING btree ("away_competition_team_id");--> statement-breakpoint
