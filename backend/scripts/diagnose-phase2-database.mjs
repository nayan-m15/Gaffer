import { neon } from '@neondatabase/serverless';
import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...parse(readFileSync(resolve(root, '.env'))), ...process.env };
const target = new URL(env.TEST_DATABASE_URL);
if (
  target.hostname !==
    'ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech' ||
  target.pathname !== '/neondb'
)
  throw new Error('STOP: unapproved database');
const sql = neon(env.TEST_DATABASE_URL);
const [identity] = await sql.query(
  "SELECT current_database() AS database, current_setting('neon.branch_id') AS branch, current_setting('neon.endpoint_id') AS endpoint",
);
if (
  identity.branch !== 'br-misty-moon-b2be9vmt' ||
  identity.endpoint !== 'ep-royal-star-b253pvlk'
)
  throw new Error('STOP: branch mismatch');
const functions = await sql.query(
  "SELECT n.nspname AS schema, p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN ('attach_match_session_if_safe', 'refresh_match_projection', 'apply_match_clock_operation') ORDER BY p.proname",
);
const journal = await sql.query(
  'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 3',
);
const result = {
  capturedAt: new Date().toISOString(),
  identity,
  functions,
  journal,
};
writeFileSync(
  resolve(root, 'docs/phase2-validation/database-diagnosis.json'),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
