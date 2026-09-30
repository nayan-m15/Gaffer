import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backendRoot, '..', '.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const developmentDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required to migrate the test database.',
  );
}

if (testDatabaseUrl === developmentDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must differ from DATABASE_URL before migrations can run.',
  );
}

const sql = neon(testDatabaseUrl);

// Reset only the dedicated integration test database so the full migration
// history is replayed from a clean schema every time.
await sql.query('DROP SCHEMA IF EXISTS public CASCADE');
await sql.query('CREATE SCHEMA public');
await sql.query('DROP SCHEMA IF EXISTS drizzle CASCADE');

process.env.DATABASE_URL = testDatabaseUrl;
await import('./migrate.mjs');