ALTER TABLE "events" ADD COLUMN "competition_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_competition_id_index" ON "events" USING btree ("competition_id");
