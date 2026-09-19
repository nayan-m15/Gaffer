-- Repair migration for environments whose Drizzle journal records 0022/0023
-- as applied even though the shared competition tables/columns are missing.
-- Every DDL step is guarded so this migration is safe on environments where
-- some or all of the original schema already exists.

ALTER TABLE "public"."competitions"
  ADD COLUMN IF NOT EXISTS "admin_user_id" text;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.competitions'::regclass
      AND conname = 'competitions_admin_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "public"."competitions"
      ADD CONSTRAINT "competitions_admin_user_id_user_id_fk"
      FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "competitions_admin_user_id_index"
  ON "public"."competitions" USING btree ("admin_user_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "public"."competition_teams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid NOT NULL,
  "team_id" uuid,
  "display_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.competition_teams'::regclass
      AND conname = 'competition_teams_competition_id_competitions_id_fk'
  ) THEN
    ALTER TABLE "public"."competition_teams"
      ADD CONSTRAINT "competition_teams_competition_id_competitions_id_fk"
      FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.competition_teams'::regclass
      AND conname = 'competition_teams_team_id_teams_id_fk'
  ) THEN
    ALTER TABLE "public"."competition_teams"
      ADD CONSTRAINT "competition_teams_team_id_teams_id_fk"
      FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "competition_teams_competition_id_index"
  ON "public"."competition_teams" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competition_teams_team_id_index"
  ON "public"."competition_teams" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_teams_competition_team_unique"
  ON "public"."competition_teams" USING btree ("competition_id", "team_id")
  WHERE "team_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_teams_competition_display_name_unique"
  ON "public"."competition_teams" USING btree ("competition_id", lower("display_name"));--> statement-breakpoint

-- Resolve a legacy competition admin from the owning team's coach where the
-- admin is still missing. Existing admin assignments are never overwritten.
UPDATE "public"."competitions" c
SET "admin_user_id" = tm."user_id"
FROM "public"."team_members" tm
WHERE tm."team_id" = c."team_id"
  AND tm."role" = 'coach'
  AND c."admin_user_id" IS NULL;--> statement-breakpoint

-- Make legacy names compatible with the global case-insensitive unique index.
-- The UUID suffix guarantees uniqueness without deleting any competition.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY lower("name")
      ORDER BY "created_at", "id"
    ) AS rn
  FROM "public"."competitions"
)
UPDATE "public"."competitions" c
SET "name" = c."name" || ' (' || c."id" || ')'
FROM ranked r
WHERE r."id" = c."id"
  AND r.rn > 1;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "competitions_name_lower_unique"
  ON "public"."competitions" USING btree (lower("name"));--> statement-breakpoint

-- Backfill the creator/legacy team as a participant for every competition.
INSERT INTO "public"."competition_teams" (
  "competition_id",
  "team_id",
  "display_name"
)
SELECT c."id", c."team_id", t."name"
FROM "public"."competitions" c
INNER JOIN "public"."teams" t ON t."id" = c."team_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."competition_teams" ct
  WHERE ct."competition_id" = c."id"
    AND ct."team_id" = c."team_id"
)
ON CONFLICT DO NOTHING;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    INNER JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'competition_invite_status'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."competition_invite_status"
      AS ENUM ('pending', 'used', 'revoked');
  END IF;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "public"."competition_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid NOT NULL,
  "competition_team_id" uuid NOT NULL,
  "email" text NOT NULL,
  "token_hash" text NOT NULL,
  "status" "public"."competition_invite_status" DEFAULT 'pending' NOT NULL,
  "created_by_user_id" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "used_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.competition_invites'::regclass
      AND conname = 'competition_invites_competition_id_competitions_id_fk'
  ) THEN
    ALTER TABLE "public"."competition_invites"
      ADD CONSTRAINT "competition_invites_competition_id_competitions_id_fk"
      FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.competition_invites'::regclass
      AND conname = 'competition_invites_competition_team_id_competition_teams_id_fk'
  ) THEN
    ALTER TABLE "public"."competition_invites"
      ADD CONSTRAINT "competition_invites_competition_team_id_competition_teams_id_fk"
      FOREIGN KEY ("competition_team_id") REFERENCES "public"."competition_teams"("id")
      ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.competition_invites'::regclass
      AND conname = 'competition_invites_created_by_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "public"."competition_invites"
      ADD CONSTRAINT "competition_invites_created_by_user_id_user_id_fk"
      FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.competition_invites'::regclass
      AND conname = 'competition_invites_used_by_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "public"."competition_invites"
      ADD CONSTRAINT "competition_invites_used_by_user_id_user_id_fk"
      FOREIGN KEY ("used_by_user_id") REFERENCES "public"."user"("id");
  END IF;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "competition_invites_token_hash_unique"
  ON "public"."competition_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competition_invites_competition_id_index"
  ON "public"."competition_invites" USING btree ("competition_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "competition_invites_pending_slot_unique"
  ON "public"."competition_invites" USING btree ("competition_team_id")
  WHERE "status" = 'pending';
