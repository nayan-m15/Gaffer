import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backendRoot, '..', '.env'), quiet: true });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

const databaseUrl = new URL(process.env.DATABASE_URL);
const sql = neon(process.env.DATABASE_URL);
const [schema] = await sql.query(`
  SELECT current_database() AS database,
         current_user AS user_name,
         to_regclass('public.match_clock_operations') AS clock_table,
         to_regclass('public.sync_client_telemetry') AS telemetry_table,
         to_regprocedure(
           'public.apply_match_clock_operation(uuid,uuid,text,text,integer,boolean,integer,text,timestamp with time zone)'
         ) AS clock_function,
         EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'matches'
              AND column_name = 'clock_revision'
         ) AS clock_revision,
         EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'sync_upload_receipts'
              AND column_name = 'processing_duration_ms'
         ) AS receipt_duration
`);
const migrations = await sql.query(`
  SELECT id, hash, created_at
    FROM drizzle.__drizzle_migrations
   ORDER BY created_at DESC
   LIMIT 5
`);
const published = await sql.query(`
  SELECT tablename
    FROM pg_publication_tables
   WHERE pubname = 'powersync'
   ORDER BY tablename
`);
const slots = await sql.query(`
  SELECT slot_name,
         plugin,
         slot_type,
         database,
         active,
         active_pid,
         temporary,
         confirmed_flush_lsn IS NOT NULL AS has_confirmed_flush_lsn
    FROM pg_replication_slots
   ORDER BY slot_name
`);
const settings = await sql.query(`
  SELECT name, setting
    FROM pg_settings
   WHERE name IN ('wal_level', 'max_replication_slots', 'max_wal_senders')
   ORDER BY name
`);
const [role] = await sql.query(`
  SELECT rolname, rolcanlogin, rolreplication, rolbypassrls
    FROM pg_roles
   WHERE rolname = 'powersync_role'
`);
const grants = await sql.query(`
  SELECT table_name
    FROM information_schema.role_table_grants
   WHERE grantee = 'powersync_role'
     AND privilege_type = 'SELECT'
     AND table_schema = 'public'
   ORDER BY table_name
`);
const [publication] = await sql.query(`
  SELECT pubname, pubinsert, pubupdate, pubdelete, pubtruncate, pubviaroot
    FROM pg_publication
   WHERE pubname = 'powersync'
`);
const publishedTableHealth = await sql.query(`
  SELECT c.relname AS table_name,
         c.relreplident AS replica_identity,
         EXISTS (
           SELECT 1
             FROM pg_index i
            WHERE i.indrelid = c.oid
              AND i.indisprimary
         ) AS has_primary_key
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN (
       SELECT tablename
         FROM pg_publication_tables
        WHERE pubname = 'powersync'
     )
   ORDER BY c.relname
`);

console.log(
  JSON.stringify(
    {
      connection: {
        host: databaseUrl.hostname,
        database: databaseUrl.pathname.slice(1),
        pooled: databaseUrl.hostname.includes('-pooler'),
      },
      schema,
      migrations,
      published: published.map((row) => row.tablename),
      replication: {
        settings: Object.fromEntries(
          settings.map((row) => [row.name, row.setting]),
        ),
        slots,
      },
      powersyncRole: role ?? null,
      selectGrants: grants.map((row) => row.table_name),
      publication: publication ?? null,
      publishedTableHealth,
    },
    null,
    2,
  ),
);
