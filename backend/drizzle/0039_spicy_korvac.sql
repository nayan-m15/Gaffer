CREATE TYPE "public"."season_insight_status" AS ENUM('pending', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "season_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"season_id" uuid,
	"status" "season_insight_status" DEFAULT 'pending' NOT NULL,
	"narrative_text" text,
	"model" text,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"input_digest" text,
	"generated_at" timestamp with time zone,
	"failure_reason" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"generated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_insights" ADD CONSTRAINT "season_insights_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_insights" ADD CONSTRAINT "season_insights_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_insights" ADD CONSTRAINT "season_insights_generated_by_user_id_user_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_insights_team_id_index" ON "season_insights" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_insights_team_season_unique" ON "season_insights" USING btree ("team_id","season_id") WHERE "season_insights"."season_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "season_insights_team_all_time_unique" ON "season_insights" USING btree ("team_id") WHERE "season_insights"."season_id" is null;