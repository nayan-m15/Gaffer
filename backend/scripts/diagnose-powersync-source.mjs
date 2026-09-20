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
    },
    null,
    2,
  ),
);
