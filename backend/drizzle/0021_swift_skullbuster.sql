CREATE TABLE "match_event_memberships" (
	"observation_id" uuid PRIMARY KEY NOT NULL,
	"canonical_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_event_observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"logged_by_user_id" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"event_type" "match_event_type" NOT NULL,
	"team" "match_event_team" NOT NULL,
	"athlete_id" uuid,
	"opponent_label" text,
	"opponent_player_id" uuid,
	"period" text NOT NULL,
	"match_elapsed_ms" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"client_created_at" timestamp with time zone NOT NULL,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_event_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"canonical_event_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "period" text DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "match_elapsed_ms" integer;--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "structured_payload" jsonb;--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "lifecycle_status" text DEFAULT 'provisional' NOT NULL;--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "rules_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "match_event_memberships" ADD CONSTRAINT "match_event_memberships_observation_id_match_event_observations_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."match_event_observations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_memberships" ADD CONSTRAINT "match_event_memberships_canonical_event_id_match_events_id_fk" FOREIGN KEY ("canonical_event_id") REFERENCES "public"."match_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_observations" ADD CONSTRAINT "match_event_observations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_observations" ADD CONSTRAINT "match_event_observations_logged_by_user_id_user_id_fk" FOREIGN KEY ("logged_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_observations" ADD CONSTRAINT "match_event_observations_athlete_id_athletes_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "public"."athletes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_observations" ADD CONSTRAINT "match_event_observations_opponent_player_id_opponent_match_players_id_fk" FOREIGN KEY ("opponent_player_id") REFERENCES "public"."opponent_match_players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_reviews" ADD CONSTRAINT "match_event_reviews_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_reviews" ADD CONSTRAINT "match_event_reviews_canonical_event_id_match_events_id_fk" FOREIGN KEY ("canonical_event_id") REFERENCES "public"."match_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_event_reviews" ADD CONSTRAINT "match_event_reviews_resolved_by_user_id_user_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_event_memberships_canonical_index" ON "match_event_memberships" USING btree ("canonical_event_id");--> statement-breakpoint
CREATE INDEX "match_event_observations_match_index" ON "match_event_observations" USING btree ("match_id","period","match_elapsed_ms");--> statement-breakpoint
CREATE INDEX "match_event_observations_actor_index" ON "match_event_observations" USING btree ("logged_by_user_id");--> statement-breakpoint
CREATE INDEX "match_event_reviews_match_status_index" ON "match_event_reviews" USING btree ("match_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "match_event_reviews_open_canonical_unique" ON "match_event_reviews" USING btree ("canonical_event_id") WHERE "match_event_reviews"."status" = 'open';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ingest_match_event_observation(
  p_observation_id uuid,
  p_match_id uuid,
  p_device_id uuid,
  p_actor_id text,
  p_event_type match_event_type,
  p_team match_event_team,
  p_athlete_id uuid,
  p_opponent_label text,
  p_opponent_player_id uuid,
  p_period text,
  p_elapsed_ms integer,
  p_minute integer,
  p_detail text,
  p_payload jsonb,
  p_payload_hash text,
  p_client_created_at timestamptz,
  p_manually_adjusted boolean
) RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_hash text;
  v_existing_match uuid;
  v_canonical_id uuid;
BEGIN
  -- Serialise all reconciliation for one match without holding an application
  -- connection across requests. This lock is released when the function's
  -- statement transaction commits or rolls back.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 0));

  INSERT INTO match_event_observations (
    id, match_id, device_id, logged_by_user_id, event_type, team,
    athlete_id, opponent_label, opponent_player_id, period,
    match_elapsed_ms, payload, payload_hash, client_created_at
  ) VALUES (
    p_observation_id, p_match_id, p_device_id, p_actor_id, p_event_type, p_team,
    p_athlete_id, p_opponent_label, p_opponent_player_id, p_period,
    p_elapsed_ms, p_payload, p_payload_hash, p_client_created_at
  ) ON CONFLICT (id) DO NOTHING;

  SELECT payload_hash, match_id
    INTO v_existing_hash, v_existing_match
    FROM match_event_observations
    WHERE id = p_observation_id;
  IF v_existing_hash IS DISTINCT FROM p_payload_hash
     OR v_existing_match IS DISTINCT FROM p_match_id THEN
    RAISE EXCEPTION 'offline operation id reused with different data'
      USING ERRCODE = '22000';
  END IF;

  SELECT mem.canonical_event_id
    INTO v_canonical_id
    FROM match_event_memberships mem
    WHERE mem.observation_id = p_observation_id;
  IF v_canonical_id IS NOT NULL THEN
    RETURN v_canonical_id;
  END IF;

  SELECT mem.canonical_event_id
    INTO v_canonical_id
    FROM match_event_observations obs
    JOIN match_event_memberships mem ON mem.observation_id = obs.id
    WHERE obs.match_id = p_match_id
      AND obs.id <> p_observation_id
      AND obs.period = p_period
      AND obs.event_type = p_event_type
      AND obs.team = p_team
      AND obs.athlete_id IS NOT DISTINCT FROM p_athlete_id
      AND obs.opponent_player_id IS NOT DISTINCT FROM p_opponent_player_id
      AND obs.opponent_label IS NOT DISTINCT FROM p_opponent_label
      AND abs(obs.match_elapsed_ms - p_elapsed_ms) <= 5000
    ORDER BY mem.canonical_event_id::text
    LIMIT 1;

  IF v_canonical_id IS NULL OR p_observation_id::text < v_canonical_id::text THEN
    INSERT INTO match_events (
      id, match_id, athlete_id, team, opponent_label, opponent_player_id,
      event_type, minute, detail, logged_by_user_id, manually_adjusted,
      client_request_id, period, match_elapsed_ms, structured_payload,
      lifecycle_status
    ) VALUES (
      p_observation_id, p_match_id, p_athlete_id, p_team, p_opponent_label,
      p_opponent_player_id, p_event_type, p_minute, p_detail, p_actor_id,
      p_manually_adjusted, p_observation_id, p_period, p_elapsed_ms, p_payload,
      CASE WHEN v_canonical_id IS NULL THEN 'provisional' ELSE 'needs_review' END
    ) ON CONFLICT (id) DO NOTHING;

    IF v_canonical_id IS NOT NULL THEN
      UPDATE match_event_memberships
        SET canonical_event_id = p_observation_id
        WHERE canonical_event_id = v_canonical_id;
      DELETE FROM match_events WHERE id = v_canonical_id;
    END IF;
    v_canonical_id := p_observation_id;
  END IF;

  INSERT INTO match_event_memberships (observation_id, canonical_event_id)
    VALUES (p_observation_id, v_canonical_id)
    ON CONFLICT (observation_id) DO NOTHING;

  IF EXISTS (
    SELECT 1 FROM match_event_memberships
    WHERE canonical_event_id = v_canonical_id
      AND observation_id <> p_observation_id
  ) THEN
    UPDATE match_events SET lifecycle_status = 'needs_review', updated_at = now()
      WHERE id = v_canonical_id;
    INSERT INTO match_event_reviews (match_id, canonical_event_id, reason)
      VALUES (p_match_id, v_canonical_id, 'possible_duplicate')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_canonical_id;
END;
$$;
