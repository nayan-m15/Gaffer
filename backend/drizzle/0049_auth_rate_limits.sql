CREATE TABLE IF NOT EXISTS "auth_rate_limits" (
	"key" text PRIMARY KEY,
	"count" integer NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL
);
