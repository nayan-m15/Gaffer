CREATE TYPE "public"."injury_body_region" AS ENUM('head', 'neck', 'shoulder_left', 'shoulder_right', 'upper_arm_left', 'upper_arm_right', 'forearm_left', 'forearm_right', 'wrist_hand_left', 'wrist_hand_right', 'chest', 'abdomen', 'groin', 'back_upper', 'back_lower', 'glute_left', 'glute_right', 'hamstring_left', 'hamstring_right', 'quad_left', 'quad_right', 'knee_left', 'knee_right', 'calf_left', 'calf_right', 'achilles_left', 'achilles_right', 'ankle_left', 'ankle_right', 'foot_left', 'foot_right');--> statement-breakpoint
CREATE TYPE "public"."injury_context" AS ENUM('match', 'training', 'other');--> statement-breakpoint
CREATE TYPE "public"."injury_severity" AS ENUM('minor', 'moderate', 'severe');--> statement-breakpoint
CREATE TYPE "public"."injury_status" AS ENUM('reported', 'assessment', 'rehab', 'return_to_training', 'returned', 'season_ending');--> statement-breakpoint
CREATE TYPE "public"."injury_timeline_kind" AS ENUM('sustained', 'assessment', 'rehab_started', 'reassessment', 'setback', 'return_to_training', 'returned', 'note', 'estimated_return');--> statement-breakpoint
CREATE TYPE "public"."injury_type" AS ENUM('strain', 'sprain', 'tear', 'fracture', 'contusion', 'dislocation', 'tendinopathy', 'concussion', 'laceration', 'illness', 'other');--> statement-breakpoint
CREATE TABLE "injuries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"body_region" "injury_body_region" NOT NULL,
	"injury_type" "injury_type" NOT NULL,
	"severity" "injury_severity" NOT NULL,
	"status" "injury_status" DEFAULT 'reported' NOT NULL,
	"context" "injury_context" DEFAULT 'other' NOT NULL,
	"occurred_on" date NOT NULL,
	"match_id" uuid,
	"match_event_id" uuid,
	"minute" integer,
	"estimated_return_min_days" integer NOT NULL,
	"estimated_return_max_days" integer NOT NULL,
	"estimated_return_from" date NOT NULL,
	"estimated_return_to" date NOT NULL,
	"actual_return_on" date,
	"diagnosed_by" text,
	"description" text,
	"notes" text,
	"rehab_phases" jsonb,
	"closed_at" timestamp with time zone,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "injury_timeline_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"injury_id" uuid NOT NULL,
	"kind" "injury_timeline_kind" NOT NULL,
	"occurred_on" date NOT NULL,
	"title" text NOT NULL,
	"detail" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_match_event_id_match_events_id_fk" FOREIGN KEY ("match_event_id") REFERENCES "public"."match_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injuries" ADD CONSTRAINT "injuries_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury_timeline_entries" ADD CONSTRAINT "injury_timeline_entries_injury_id_injuries_id_fk" FOREIGN KEY ("injury_id") REFERENCES "public"."injuries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "injury_timeline_entries" ADD CONSTRAINT "injury_timeline_entries_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "injuries_team_id_index" ON "injuries" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "injuries_athlete_id_index" ON "injuries" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "injuries_team_status_index" ON "injuries" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "injuries_athlete_region_index" ON "injuries" USING btree ("athlete_id","body_region");--> statement-breakpoint
CREATE UNIQUE INDEX "injuries_match_event_unique" ON "injuries" USING btree ("match_event_id") WHERE "injuries"."match_event_id" is not null;--> statement-breakpoint
CREATE INDEX "injury_timeline_entries_injury_index" ON "injury_timeline_entries" USING btree ("injury_id","occurred_on");