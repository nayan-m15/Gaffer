CREATE TYPE "public"."athlete_status" AS ENUM('available', 'injured', 'suspended');--> statement-breakpoint
ALTER TABLE "athletes" ADD COLUMN "status" "athlete_status" DEFAULT 'available' NOT NULL;