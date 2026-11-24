CREATE TABLE IF NOT EXISTS "weather_forecast_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"provider" text NOT NULL,
	"hourly" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
