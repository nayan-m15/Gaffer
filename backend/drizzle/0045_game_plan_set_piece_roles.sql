ALTER TABLE "game_plans" ADD COLUMN "long_free_kick_taker_id" uuid;--> statement-breakpoint
ALTER TABLE "game_plans" ADD COLUMN "right_corner_taker_id" uuid;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_long_free_kick_taker_id_athletes_id_fk" FOREIGN KEY ("long_free_kick_taker_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_right_corner_taker_id_athletes_id_fk" FOREIGN KEY ("right_corner_taker_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;
