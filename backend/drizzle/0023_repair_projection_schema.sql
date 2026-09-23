-- Migration 0022 was skipped by some long-lived test databases whose migration
-- history had already advanced on another branch. Keep this repair idempotent
-- so divergent and freshly-created databases converge on the declared schema.
CREATE TABLE IF NOT EXISTS "match_event_operations" (
  "id" uuid PRIMARY KEY NOT NULL,
  "match_id" uuid NOT NULL,
  "actor_user_id" text NOT NULL,
  "operation_type" text NOT NULL,
  "target_observation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "canonical_event_id" uuid,
  "causal_parent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "decision" jsonb NOT NULL,
  "reason" text,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_projection_state" (
  "match_id" uuid PRIMARY KEY NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "input_digest" text NOT NULL,
  "rules_version" integer DEFAULT 1 NOT NULL,
  "confirmed_team_score" integer DEFAULT 0 NOT NULL,
  "confirmed_opponent_score" integer DEFAULT 0 NOT NULL,
  "provisional_team_score" integer DEFAULT 0 NOT NULL,
  "provisional_opponent_score" integer DEFAULT 0 NOT NULL,
  "possible_effects" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "disciplinary_projection" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "unresolved_review_count" integer DEFAULT 0 NOT NULL,
  "finalisation_state" text DEFAULT 'open' NOT NULL,
  "finalised_by_user_id" text,
  "finalised_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_upload_receipts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "submitted_by_user_id" text NOT NULL,
  "match_id" uuid NOT NULL,
  "item_type" text NOT NULL,
  "payload_hash" text NOT NULL,
  "outcome" text NOT NULL,
  "safe_error_code" text,
  "canonical_event_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_event_memberships"
  ADD COLUMN IF NOT EXISTS "projection_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "match_events"
  ADD COLUMN IF NOT EXISTS "projection_revision" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "match_event_operations" ADD CONSTRAINT "match_event_operations_match_id_matches_id_fk"
    FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "match_event_operations" ADD CONSTRAINT "match_event_operations_actor_user_id_user_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "match_event_operations" ADD CONSTRAINT "match_event_operations_canonical_event_id_match_events_id_fk"
    FOREIGN KEY ("canonical_event_id") REFERENCES "public"."match_events"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "match_projection_state" ADD CONSTRAINT "match_projection_state_match_id_matches_id_fk"
    FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "match_projection_state" ADD CONSTRAINT "match_projection_state_finalised_by_user_id_user_id_fk"
    FOREIGN KEY ("finalised_by_user_id") REFERENCES "public"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_upload_receipts" ADD CONSTRAINT "sync_upload_receipts_submitted_by_user_id_user_id_fk"
    FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."user"("id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_upload_receipts" ADD CONSTRAINT "sync_upload_receipts_match_id_matches_id_fk"
    FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "sync_upload_receipts" ADD CONSTRAINT "sync_upload_receipts_canonical_event_id_match_events_id_fk"
    FOREIGN KEY ("canonical_event_id") REFERENCES "public"."match_events"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_event_operations_match_index"
  ON "match_event_operations" ("match_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "match_event_operations_actor_index"
  ON "match_event_operations" ("actor_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_upload_receipts_user_index"
  ON "sync_upload_receipts" ("submitted_by_user_id", "created_at");
--> statement-breakpoint
UPDATE "match_events"
SET "structured_payload" = CASE
  WHEN "event_type" = 'goal' AND "detail" = 'Penalty' THEN
    jsonb_build_object('legacy', true, 'goalKind', 'penalty', 'outcome', 'scored')
  WHEN "event_type" = 'penalty' THEN
    jsonb_build_object('legacy', true, 'goalKind', 'penalty', 'outcome', 'missed')
  WHEN "event_type" = 'substitution' THEN
    jsonb_build_object('legacy', true, 'incomingPlayerId', "detail")
  ELSE jsonb_build_object('legacy', true, 'detail', "detail")
END
WHERE "structured_payload" IS NULL;
--> statement-breakpoint
INSERT INTO "match_event_observations" (
  "id", "match_id", "device_id", "logged_by_user_id", "schema_version",
  "event_type", "team", "athlete_id", "opponent_label",
  "opponent_player_id", "period", "match_elapsed_ms", "payload",
  "payload_hash", "client_created_at", "server_received_at"
)
SELECT
  me."id", me."match_id", me."id", me."logged_by_user_id", 1,
  me."event_type", me."team", me."athlete_id", me."opponent_label",
  me."opponent_player_id", me."period",
  COALESCE(me."match_elapsed_ms", me."minute" * 60000),
  COALESCE(me."structured_payload", '{}'::jsonb) || jsonb_build_object('trustedLegacy', true),
  md5((COALESCE(me."structured_payload", '{}'::jsonb) || jsonb_build_object('trustedLegacy', true))::text),
  me."created_at", me."created_at"
FROM "match_events" me
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "match_event_memberships" (
  "observation_id", "canonical_event_id", "projection_revision"
)
SELECT me."id", me."id", 0
FROM "match_events" me
ON CONFLICT ("observation_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "match_projection_state" (
  "match_id", "revision", "input_digest", "rules_version",
  "confirmed_team_score", "confirmed_opponent_score",
  "provisional_team_score", "provisional_opponent_score",
  "possible_effects", "disciplinary_projection",
  "unresolved_review_count", "finalisation_state"
)
SELECT
  m."id", 1, 'legacy-backfill-' || m."id"::text, 1,
  count(DISTINCT me."id") FILTER (
    WHERE me."team" = 'own' AND me."event_type" = 'goal'
      AND me."lifecycle_status" = 'confirmed'
  )::int,
  count(DISTINCT me."id") FILTER (
    WHERE me."team" = 'opponent' AND me."event_type" = 'goal'
      AND me."lifecycle_status" = 'confirmed'
  )::int,
  count(DISTINCT me."id") FILTER (
    WHERE me."team" = 'own' AND me."event_type" = 'goal'
      AND me."lifecycle_status" <> 'voided'
  )::int,
  count(DISTINCT me."id") FILTER (
    WHERE me."team" = 'opponent' AND me."event_type" = 'goal'
      AND me."lifecycle_status" <> 'voided'
  )::int,
  '{}'::jsonb, '{}'::jsonb,
  count(DISTINCT r."id") FILTER (WHERE r."status" = 'open')::int,
  'open'
FROM "matches" m
LEFT JOIN "match_events" me ON me."match_id" = m."id"
LEFT JOIN "match_event_reviews" r ON r."match_id" = m."id"
GROUP BY m."id"
ON CONFLICT ("match_id") DO NOTHING;
