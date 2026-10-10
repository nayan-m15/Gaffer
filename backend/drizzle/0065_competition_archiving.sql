ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hidden_competitions" (
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "competition_id" uuid NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  CONSTRAINT "hidden_competitions_pk" PRIMARY KEY("user_id", "competition_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hidden_competitions_competition_idx" ON "hidden_competitions"("competition_id");
