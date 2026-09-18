CREATE TYPE "public"."competition_invite_status" AS ENUM('pending', 'used', 'revoked');--> statement-breakpoint
CREATE TABLE "competition_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid NOT NULL CONSTRAINT "competition_invites_competition_id_competitions_id_fk" REFERENCES "competitions"("id") ON DELETE cascade,
  "competition_team_id" uuid NOT NULL CONSTRAINT "competition_invites_competition_team_id_competition_teams_id_fk" REFERENCES "competition_teams"("id") ON DELETE cascade,
  "email" text NOT NULL,
  "token_hash" text NOT NULL CONSTRAINT "competition_invites_token_hash_unique" UNIQUE,
  "status" "competition_invite_status" DEFAULT 'pending' NOT NULL,
  "created_by_user_id" text NOT NULL CONSTRAINT "competition_invites_created_by_user_id_user_id_fk" REFERENCES "user"("id"),
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "used_by_user_id" text CONSTRAINT "competition_invites_used_by_user_id_user_id_fk" REFERENCES "user"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "competition_invites_competition_id_index" ON "competition_invites" ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_invites_pending_slot_unique" ON "competition_invites" ("competition_team_id") WHERE "status" = 'pending';
