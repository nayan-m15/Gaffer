CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "season_id" uuid;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seasons_team_id_index" ON "seasons" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "seasons_team_start_date_index" ON "seasons" USING btree ("team_id","start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_team_name_unique" ON "seasons" USING btree ("team_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "seasons_team_current_unique" ON "seasons" USING btree ("team_id") WHERE "seasons"."is_current";--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "competitions_season_id_index" ON "competitions" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "match_events_match_athlete_type_index" ON "match_events" USING btree ("match_id","athlete_id","event_type");--> statement-breakpoint

-- Backfill: one season per team, not one per free-text competition label.
-- Labels are unparseable ("2025/26", "Summer", "") and any invented date
-- padding would make sibling ranges overlap, violating the non-overlap
-- invariant enforced from here on. One-per-team is trivially non-overlapping
-- and single-current, links every existing competition, and covers every
-- existing and near-future match. Coaches split/rename via the seasons UI.
INSERT INTO "seasons" ("team_id", "name", "start_date", "end_date", "is_current")
SELECT
	t.id,
	COALESCE(
		(SELECT btrim(c.season) FROM "competitions" c
		  WHERE c.team_id = t.id AND btrim(COALESCE(c.season, '')) <> ''
		  ORDER BY c.created_at DESC LIMIT 1),
		to_char(CURRENT_DATE, 'YYYY')
	),
	COALESCE(
		(SELECT min(e.scheduled_at)::date FROM "events" e
		  WHERE e.team_id = t.id AND e.type = 'match'),
		CURRENT_DATE
	),
	(GREATEST(
		COALESCE(
			(SELECT max(e.scheduled_at)::date FROM "events" e
			  WHERE e.team_id = t.id AND e.type = 'match'),
			CURRENT_DATE
		),
		CURRENT_DATE
	) + INTERVAL '1 year')::date,
	true
FROM "teams" t
ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "competitions" c SET "season_id" = s.id
FROM "seasons" s WHERE s.team_id = c.team_id;
