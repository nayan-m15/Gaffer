// Explicit, additive deployment to the authorized blue-hill source only.
// Never reset a schema or replay divergent historical migrations.
import { neon } from '@neondatabase/serverless';
import { PGlite } from '@electric-sql/pglite';
import { config } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
if (process.argv[2] !== '--apply-blue-hill') throw new Error('Specify --apply-blue-hill for the authorized development source.');
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname.replace('-pooler.', '.'), 'ep-blue-hill-b1j037cs.c-5.eu-central-1.aws.neon.tech');
assert.equal(url.pathname, '/neondb');
const sql = neon(url.toString());
const [identity] = await sql.query(`SELECT current_database() AS database,
  current_setting('neon.branch_id') AS branch, current_setting('neon.endpoint_id') AS endpoint`);
assert.equal(identity.endpoint, 'ep-blue-hill-b1j037cs');
assert.equal(identity.branch, 'br-odd-cell-b1onih3h');
const folder = resolve(root, 'backend/drizzle');
const journal = JSON.parse(readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'));
const migrations = readMigrationFiles({ migrationsFolder: folder });
const selected = journal.entries.map((entry, i) => ({ ...entry, migration: migrations[i] }))
  .filter(({ tag }) => ['0052_shared_session_integrity', '0053_session_confirmation_invalidation'].includes(tag));
assert.equal(selected.length, 2);
const [, recorded, functions, triggers] = await sql.transaction(tx => [
  tx.query('SET TRANSACTION READ ONLY'),
  tx.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at'),
  tx.query(`SELECT p.proname, pg_get_functiondef(p.oid) AS definition FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    AND p.proname IN ('refresh_match_projection', 'attach_match_session_if_safe', 'invalidate_pending_session_confirmations')`),
  tx.query(`SELECT tgname, pg_get_triggerdef(oid) AS definition FROM pg_trigger
    WHERE tgname IN ('match_event_invalidate_session_confirmations', 'match_review_invalidate_session_confirmations')`),
]);
assert.equal(triggers.length, 0, 'Expected confirmation triggers to be absent before deployment.');
for (const entry of selected) assert(!recorded.some(row => Number(row.created_at) === entry.when), `${entry.tag} already recorded`);
assert(recorded.some(row => Number(row.created_at) === 1790976000000), 'Prerequisite 0051 must be recorded.');

// Save the complete objects changed by these DDL-only migrations. Existing
// rows are untouched; this is an object rollback, not a full database backup.
const rollback = [
  'DROP TRIGGER IF EXISTS match_event_invalidate_session_confirmations ON public.match_events;',
  'DROP TRIGGER IF EXISTS match_review_invalidate_session_confirmations ON public.match_event_reviews;',
  'DROP FUNCTION IF EXISTS public.invalidate_pending_session_confirmations();',
  'DROP FUNCTION IF EXISTS public.attach_match_session_if_safe(uuid,uuid,boolean);',
  ...functions.map(row => row.definition + ';'),
  ...triggers.map(row => row.definition + ';'),
  `DELETE FROM drizzle.__drizzle_migrations WHERE created_at IN (${selected.map(entry => entry.when).join(',')});`,
].join('\n');
const directory = resolve(root, 'docs/phase-delivery-validation');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'migration-object-backup.json'), JSON.stringify({ identity, recorded, functions, triggers }, null, 2));
writeFileSync(resolve(directory, 'migration-object-rollback.sql'), rollback);

// Prove forward install and exact function restoration in an isolated database.
const pg = new PGlite();
try {
  for (const entry of journal.entries.filter(entry => entry.when <= 1790976000000))
    await pg.exec(readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf8'));
  await pg.exec('CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations (created_at bigint);');
  for (const row of functions) await pg.exec(row.definition);
  for (const entry of selected) await pg.exec(readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf8'));
  await pg.exec(rollback);
  for (const row of functions) {
    const restored = await pg.query('SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname = $1', [row.proname]);
    assert.equal(restored.rows[0].definition, row.definition);
  }
} finally { await pg.close(); }

// Both migrations and their journal records commit atomically. Concurrent
// deployers serialize and fail rather than applying a migration twice.
await sql.transaction(tx => [
  tx.query("SET LOCAL lock_timeout = '10s'"),
  tx.query("SET LOCAL statement_timeout = '60s'"),
  tx.query("SELECT pg_advisory_xact_lock(hashtextextended('two-sided-0052-0053-deployment', 0))"),
  tx.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations
    WHERE created_at IN (1791062400000,1791158400000)) THEN RAISE EXCEPTION 'Migration state changed'; END IF; END $$`),
  ...selected.flatMap(entry => [
    ...entry.migration.sql.filter(statement => statement.trim()).map(statement => tx.query(statement)),
    tx.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES ($1,$2)', [entry.migration.hash, entry.when]),
  ]),
]);
const result = { checkedAt: new Date().toISOString(), identity,
  applied: selected.map(entry => entry.tag), rollbackRestoredInPGlite: true,
  backupScope: 'Affected function/trigger definitions and migration journal; no historical data changes.' };
writeFileSync(resolve(directory, 'migration-deployment.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
