CREATE TABLE "match_clock_operations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"period" text NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"running" boolean NOT NULL,
	"base_revision" integer NOT NULL,
	"applied_revision" integer NOT NULL,
	"outcome" text NOT NULL,
	"payload_hash" text NOT NULL,
	"client_created_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_client_telemetry" (
	"device_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"team_id" uuid,
	"pending_count" integer DEFAULT 0 NOT NULL,
	"rejected_count" integer DEFAULT 0 NOT NULL,
	"oldest_pending_at" timestamp with time zone,
	"last_successful_sync_at" timestamp with time zone,
	"deployment" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "clock_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_upload_receipts" ADD COLUMN "processing_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "match_clock_operations" ADD CONSTRAINT "match_clock_operations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_clock_operations" ADD CONSTRAINT "match_clock_operations_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_client_telemetry" ADD CONSTRAINT "sync_client_telemetry_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_client_telemetry" ADD CONSTRAINT "sync_client_telemetry_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_clock_operations_match_revision_index" ON "match_clock_operations" USING btree ("match_id","applied_revision");--> statement-breakpoint
CREATE INDEX "match_clock_operations_actor_index" ON "match_clock_operations" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "sync_client_telemetry_team_index" ON "sync_client_telemetry" USING btree ("team_id","updated_at");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION apply_match_clock_operation(
  p_operation_id uuid,
  p_match_id uuid,
  p_actor_user_id text,
  p_period text,
  p_elapsed_ms integer,
  p_running boolean,
  p_base_revision integer,
  p_payload_hash text,
  p_client_created_at timestamptz
) RETURNS TABLE (revision integer, operation_outcome text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_hash text;
  v_existing_revision integer;
  v_existing_outcome text;
  v_current_period text;
  v_current_running boolean;
  v_current_revision integer;
  v_outcome text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_match_id::text, 1));

  SELECT payload_hash, applied_revision, outcome
    INTO v_existing_hash, v_existing_revision, v_existing_outcome
    FROM match_clock_operations
   WHERE id = p_operation_id;
  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
      RAISE EXCEPTION 'clock operation id reused with different data'
        USING ERRCODE = '22000';
    END IF;
    RETURN QUERY SELECT v_existing_revision, v_existing_outcome;
    RETURN;
  END IF;

  SELECT clock_period, clock_started_at IS NOT NULL, clock_revision
    INTO v_current_period, v_current_running, v_current_revision
    FROM matches
   WHERE id = p_match_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_period = p_period AND v_current_running = p_running THEN
    v_outcome := 'redundant';
  ELSE
    v_current_revision := v_current_revision + 1;
    UPDATE matches
       SET clock_period = p_period,
           clock_elapsed_ms = p_elapsed_ms,
           clock_started_at = CASE WHEN p_running THEN now() ELSE NULL END,
           clock_revision = v_current_revision,
           updated_at = now()
     WHERE id = p_match_id;
    v_outcome := CASE
      WHEN p_base_revision = v_current_revision - 1 THEN 'applied'
      ELSE 'applied_after_stale_base'
    END;
  END IF;

  INSERT INTO match_clock_operations (
    id, match_id, actor_user_id, period, elapsed_ms, running,
    base_revision, applied_revision, outcome, payload_hash,
    client_created_at
  ) VALUES (
    p_operation_id, p_match_id, p_actor_user_id, p_period, p_elapsed_ms,
    p_running, p_base_revision, v_current_revision, v_outcome,
    p_payload_hash, p_client_created_at
  );

  RETURN QUERY SELECT v_current_revision, v_outcome;
END;
$$;
