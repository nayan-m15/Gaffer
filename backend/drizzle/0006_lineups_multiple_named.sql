ALTER TABLE "lineups" DROP CONSTRAINT "lineups_team_id_unique";--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "lineups" SET "name" = 'My Lineup' WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "lineups" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "lineups_team_id_index" ON "lineups" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lineups_team_name_unique" ON "lineups" USING btree ("team_id","name");
