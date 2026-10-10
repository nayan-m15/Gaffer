import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { planMigrations } from './migration-plan.mjs';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backendRoot, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const folder = resolve(backendRoot, 'drizzle');
const journal = JSON.parse(
  readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'),
);
const migrations = readMigrationFiles({ migrationsFolder: folder }).map(
  (migration, index) => ({
    ...migration,
    tag: journal.entries[index].tag,
    source: readFileSync(
      resolve(folder, `${journal.entries[index].tag}.sql`),
      'utf8',
    ),
  }),
);
const dryRun = process.argv.includes('--dry-run');
if (process.argv.slice(2).some((argument) => argument !== '--dry-run')) {
  throw new Error('Supported migration option: --dry-run');
}
const sql = neon(databaseUrl);

if (!dryRun) {
  await sql.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await sql.query(`
  CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY,
    hash text NOT NULL,
    created_at bigint
  )
`);
}

// The merged journal can move already-applied SQL to a later timestamp. Its
// recorded content, including Windows line-ending equivalents, is proof that
// it ran; column presence alone is not. Leave the historical records intact.
const [table] = await sql.query(
  "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS present",
);
const recorded = table.present
  ? await sql.query(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id',
    )
  : [];
const { pending, alreadyRecorded } = planMigrations(migrations, recorded);
for (const migration of alreadyRecorded) {
  console.log(
    `Already recorded: ${migration.tag}; skipping moved journal timestamp.`,
  );
}

if (dryRun) {
  console.log(
    `Dry run: ${pending.length} pending migration(s); no database changes.`,
  );
  for (const migration of pending)
    console.log(`Pending: ${migration.tag} (${migration.folderMillis})`);
} else if (pending.length === 0) {
  console.log('No pending database migrations.');
} else {
  for (const migration of pending) {
    console.log(`Applying ${migration.tag} (${migration.folderMillis})...`);
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
