CREATE TYPE "public"."match_insight_status" AS ENUM('pending', 'ready', 'failed', 'stale');--> statement-breakpoint
CREATE TABLE "match_insights" (
	"match_id" uuid PRIMARY KEY NOT NULL,
	"status" "match_insight_status" DEFAULT 'pending' NOT NULL,
	"narrative_text" text,
	"highlights" jsonb,
	"model" text,
	"prompt_version" integer DEFAULT 1 NOT NULL,
	"input_digest" text,
	"projection_revision" integer,
	"generated_at" timestamp with time zone,
	"failure_reason" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_insights" ADD CONSTRAINT "match_insights_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;