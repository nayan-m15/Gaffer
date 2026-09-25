ALTER TABLE "competitions" ADD COLUMN "players_per_side" integer DEFAULT 11 NOT NULL;
--> statement-breakpoint
ALTER TABLE "competitions" DROP CONSTRAINT IF EXISTS "competitions_settings_valid";
--> statement-breakpoint
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_settings_valid" CHECK (
  ("configured_team_count" is null or "configured_team_count" between 2 and 128)
  and "players_per_side" in (5,7,11)
  and "max_substitutes" between 0 and 99
  and "red_card_suspension_matches" between 0 and 99
  and "accumulated_yellow_threshold" between 1 and 99
  and "yellow_suspension_matches" between 0 and 99
  and cardinality("allowed_playing_days") between 1 and 7
  and "allowed_playing_days" <@ ARRAY[0,1,2,3,4,5,6]::integer[]
  and array_position("allowed_playing_days", null) is null
  and "default_kickoff_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  and "fixtures_per_opponent" in (1,2)
  and "points_win" between 0 and 99 and "points_draw" between 0 and 99 and "points_loss" between 0 and 99
  and ("format" is null or ("type" = 'league' and "format" = 'league') or ("type" = 'cup' and "format" in ('knockout','league_knockout')))
  and ("format" is distinct from 'knockout' or "configured_team_count" is null or "configured_team_count" in (4,8,16,32))
  and ("qualifier_count" is null or ("format" is not null and "format" = 'league_knockout' and "qualifier_count" in (4,8,16,32) and "configured_team_count" is not null and "qualifier_count" <= "configured_team_count"))
);
