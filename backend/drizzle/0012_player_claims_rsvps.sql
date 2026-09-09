CREATE TYPE "public"."claim_invite_status" AS ENUM('pending', 'used', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."rsvp_status" AS ENUM('going', 'not_going', 'maybe');--> statement-breakpoint
CREATE TABLE "event_rsvps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"athlete_id" uuid NOT NULL,
	"status" "rsvp_status" NOT NULL,
	"note" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "player_claim_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "claim_invite_status" DEFAULT 'pending' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "player_claim_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "athletes" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvps" ADD CONSTRAINT "event_rsvps_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_claim_invites" ADD CONSTRAINT "player_claim_invites_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_claim_invites" ADD CONSTRAINT "player_claim_invites_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_claim_invites" ADD CONSTRAINT "player_claim_invites_used_by_user_id_user_id_fk" FOREIGN KEY ("used_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_rsvps_event_id_index" ON "event_rsvps" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvps_event_athlete_unique" ON "event_rsvps" USING btree ("event_id","athlete_id");--> statement-breakpoint
CREATE INDEX "player_claim_invites_athlete_id_index" ON "player_claim_invites" USING btree ("athlete_id");--> statement-breakpoint
CREATE INDEX "player_claim_invites_token_hash_index" ON "player_claim_invites" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "athletes" ADD CONSTRAINT "athletes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "athletes_user_id_index" ON "athletes" USING btree ("user_id");