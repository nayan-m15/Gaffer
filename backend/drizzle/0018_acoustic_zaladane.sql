ALTER TABLE "events" ADD COLUMN "venue_address" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "timezone" text;