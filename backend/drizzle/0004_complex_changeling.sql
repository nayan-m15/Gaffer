CREATE TYPE "public"."match_event_team" AS ENUM('own', 'opponent');--> statement-breakpoint
CREATE TYPE "public"."match_event_type" AS ENUM('goal', 'assist', 'key_pass', 'yellow_card', 'red_card', 'substitution', 'penalty', 'injury');--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"athlete_id" uuid,
	"team" "match_event_team" NOT NULL,
	"opponent_label" text,
	"event_type" "match_event_type" NOT NULL,
	"minute" integer NOT NULL,
	"detail" text,
	"logged_by_user_id" text NOT NULL,
	"manually_adjusted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_logged_by_user_id_user_id_fk" FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_events_match_id_index" ON "match_events" USING btree ("match_id");