CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'prefer_not_to_say');--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "sex" "sex";--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "date_of_birth" date;