import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backendRoot, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const migrations = readMigrationFiles({
  migrationsFolder: resolve(backendRoot, 'drizzle'),
});
const sql = neon(databaseUrl);

await sql.query('CREATE SCHEMA IF NOT EXISTS drizzle');
await sql.query(`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )
`);

const [latest] = await sql.query(
  `SELECT created_at
     FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 1`,
);
const latestTimestamp = latest ? Number(latest.created_at) : -1;
const pending = migrations.filter(
  (migration) => migration.folderMillis > latestTimestamp,
);

if (pending.length === 0) {
  console.log('No pending database migrations.');
} else {
  for (const migration of pending) {
    console.log(`Applying migration ${migration.folderMillis}...`);
    const statements = migration.sql.filter((statement) => statement.trim());
    await sql.transaction((tx) => [
      ...statements.map((statement) => tx.query(statement)),
      tx.query(
        `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
         VALUES ($1, $2)`,
        [migration.hash, migration.folderMillis],
      ),
    ]);
  }

  console.log(`Applied ${pending.length} database migration(s).`);
}
