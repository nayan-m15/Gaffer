ALTER TABLE "game_plans" ADD COLUMN "assignments" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_plans" ADD COLUMN "substitute_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "game_plans" "gp" SET
	"formation_id" = "l"."formation_id",
	"assignments" = "l"."assignments",
	"substitute_ids" = "l"."substitute_ids",
	"updated_at" = now()
FROM "lineups" "l"
WHERE "l"."team_id" = "gp"."team_id" AND "l"."name" = "gp"."name";--> statement-breakpoint
INSERT INTO "game_plans" ("team_id", "name", "formation_id", "assignments", "substitute_ids", "created_at", "updated_at")
SELECT "l"."team_id", "l"."name", "l"."formation_id", "l"."assignments", "l"."substitute_ids", "l"."created_at", "l"."updated_at"
FROM "lineups" "l"
WHERE NOT EXISTS (
	SELECT 1 FROM "game_plans" "gp"
	WHERE "gp"."team_id" = "l"."team_id" AND "gp"."name" = "l"."name"
);--> statement-breakpoint
DROP TABLE "lineups" CASCADE;
