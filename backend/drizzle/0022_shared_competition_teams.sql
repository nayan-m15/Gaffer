ALTER TABLE "competitions" ADD COLUMN "admin_user_id" text;--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "competition_teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"team_id" uuid,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "competition_teams" ADD CONSTRAINT "competition_teams_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competition_teams" ADD CONSTRAINT "competition_teams_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competition_teams_competition_id_index" ON "competition_teams" USING btree ("competition_id");--> statement-breakpoint
CREATE INDEX "competition_teams_team_id_index" ON "competition_teams" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competition_teams_competition_team_unique" ON "competition_teams" USING btree ("competition_id","team_id") WHERE "team_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "competition_teams_competition_display_name_unique" ON "competition_teams" USING btree ("competition_id",lower("display_name"));--> statement-breakpoint

-- Backfill 1: resolve each existing competition's admin. The competition's
-- teamId keeps representing the owning team; its coach member (role 'coach')
-- becomes the admin. Competitions on teams with no coach member (or with
-- several, which the one-team-per-user invariant makes impossible in real
-- data) keep a NULL admin and remain manageable through the legacy
-- team-scoped statistics endpoints.
UPDATE "competitions" c
SET "admin_user_id" = tm."user_id"
FROM "team_members" tm
WHERE tm."team_id" = c."team_id" AND tm."role" = 'coach';--> statement-breakpoint

-- Backfill 2: legacy duplicate names must not silently collide under the new
-- globally-unique (case-insensitive) index. Duplicates are distinguished by
-- appending the owning team's id, which is stable, unique per row and never
-- clashes with a future real name. The canonical (earliest-created) spelling
-- of each lower-cased name keeps its original name untouched.
UPDATE "competitions" c
SET "name" = c."name" || ' (' || c."team_id" || ')'
WHERE EXISTS (
	SELECT 1 FROM "competitions" other
	WHERE lower(other."name") = lower(c."name")
		AND (other."created_at", other."id") < (c."created_at", c."id")
);--> statement-breakpoint
CREATE UNIQUE INDEX "competitions_name_lower_unique" ON "competitions" USING btree (lower("name"));--> statement-breakpoint

-- Backfill 3: every existing competition gains a participant row for its
-- owning team, named after the team itself so the slot matches what the coach
-- already sees in standings. ON CONFLICT DO NOTHING guards re-runs.
INSERT INTO "competition_teams" ("competition_id", "team_id", "display_name")
SELECT c."id", c."team_id", t."name"
FROM "competitions" c
INNER JOIN "teams" t ON t."id" = c."team_id"
ON CONFLICT DO NOTHING;
