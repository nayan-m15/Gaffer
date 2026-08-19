ALTER TYPE "public"."event_type" RENAME VALUE 'team_meeting' TO 'meeting';--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "notes" text;
