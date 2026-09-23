-- Metadata-only migration.
-- The shared competition schema was already applied by
-- 0024_repair_shared_competitions.
-- This migration synchronizes Drizzle snapshot metadata
-- without recreating existing database objects.

SELECT 1;
