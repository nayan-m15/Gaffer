CREATE UNIQUE INDEX "team_members_user_unique" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "athletes_team_user_unique" ON "athletes" USING btree ("team_id","user_id") WHERE "user_id" is not null;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "clock_period" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "clock_elapsed_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "clock_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_match_request_unique" ON "match_events" USING btree ("match_id","client_request_id") WHERE "client_request_id" is not null;
