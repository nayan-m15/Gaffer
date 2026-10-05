// Read-only release evidence for one explicitly selected database.
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: resolve(root, '.env'), quiet: true });
const target = process.argv[2];
if (!['dev', 'test'].includes(target)) {
  throw new Error('Specify dev or test; deployment names must be verified separately.');
}
const url = process.env[target === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL'];
if (!url) throw new Error(`No database URL configured for ${target}.`);
if (target === 'test' && url === process.env.DATABASE_URL) {
  throw new Error('The test database must be separate from development.');
}
const endpoint = new URL(url);
const databaseIdentity = { host: endpoint.hostname, database: decodeURIComponent(endpoint.pathname.slice(1)) };
const journal = JSON.parse(readFileSync(resolve(root, 'backend/drizzle/meta/_journal.json'), 'utf8'));
const expected = readMigrationFiles({ migrationsFolder: resolve(root, 'backend/drizzle') });
const repairDocument = readFileSync(resolve(root, 'docs/two-sided-test-data-repair.md'), 'utf8');
const repairQuery = repairDocument.match(/```sql\s+BEGIN TRANSACTION READ ONLY;([\s\S]*?)ROLLBACK;\s*```/)?.[1];
if (!repairQuery) throw new Error('Cannot locate the documented read-only repair query.');
const sql = neon(url);
const [, missingSchemaColumns] = await sql.transaction((tx) => [
  tx.query('SET TRANSACTION READ ONLY'),
  tx.query(`WITH required(table_name, column_name) AS (VALUES
    ('competition_fixtures', 'shared_session_id'),
    ('friendly_fixtures', 'shared_session_id'),
    ('matches', 'shared_match_id'),
    ('match_sessions', 'home_confirmed_by_user_id'),
    ('match_sessions', 'away_confirmed_by_user_id'),
    ('match_clock_operations', 'session_id'))
    SELECT r.table_name, r.column_name FROM required r
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c
      WHERE c.table_schema = 'public' AND c.table_name = r.table_name
        AND c.column_name = r.column_name)
    ORDER BY r.table_name, r.column_name`),
]);
if (missingSchemaColumns.length) {
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), target, databaseIdentity,
    latestRequiredMigration: journal.entries.at(-1).tag, missingSchemaColumns,
    note: 'No writes. Schema prerequisites are missing; the historical data audit was not run. Apply reviewed migrations on the intended target before paired-account tests.' }, null, 2));
  process.exit(1);
}
const [, migrations, findings, missingSourceTables, replication, clockTrigger, missingIntegrityObjects, integrityFunctions] = await sql.transaction((tx) => [
  tx.query('SET TRANSACTION READ ONLY'),
  tx.query('SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at'),
  tx.query(repairQuery),
  tx.query(`WITH required(name) AS (VALUES
    ('match_sessions'), ('match_session_participants'), ('team_members'),
    ('matches'), ('events'), ('athletes'), ('athlete_match_stats'),
    ('opponent_match_players'), ('match_events'), ('match_event_reviews'),
    ('match_event_observations'), ('match_event_memberships'),
    ('match_event_operations'), ('match_projection_state'),
    ('match_clock_operations'), ('competition_fixtures'))
    SELECT name,
      EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = name) AS published,
      EXISTS (SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = 'powersync_role' AND privilege_type = 'SELECT'
          AND table_schema = 'public' AND table_name = name) AS selectable
    FROM required WHERE NOT (
      EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = name)
      AND EXISTS (SELECT 1 FROM information_schema.role_table_grants
        WHERE grantee = 'powersync_role' AND privilege_type = 'SELECT'
          AND table_schema = 'public' AND table_name = name))`),
  tx.query("SELECT slot_name, active FROM pg_replication_slots WHERE plugin = 'pgoutput'"),
  tx.query(`SELECT EXISTS (SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.match_clock_operations'::regclass
      AND tgname = 'match_clock_operation_session_id' AND NOT tgisinternal
      AND tgenabled IN ('O', 'A')) AS installed`),
  tx.query(`WITH required(table_name, trigger_name, function_name) AS (VALUES
    ('match_events', 'match_event_invalidate_session_confirmations', 'invalidate_pending_session_confirmations'),
    ('match_event_reviews', 'match_review_invalidate_session_confirmations', 'invalidate_pending_session_confirmations'))
    SELECT trigger_name AS missing_object FROM required r WHERE NOT EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = 'public' AND c.relname = r.table_name
        AND t.tgname = r.trigger_name AND NOT t.tgisinternal
        AND t.tgenabled IN ('O', 'A') AND p.proname = r.function_name)
    UNION ALL
    SELECT 'attach_match_session_if_safe(uuid,uuid,boolean)' WHERE
      to_regprocedure('public.attach_match_session_if_safe(uuid,uuid,boolean)') IS NULL`),
  tx.query(`SELECT p.proname AS name, p.prosrc AS body FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
    AND p.proname IN ('refresh_match_projection', 'attach_match_session_if_safe', 'invalidate_pending_session_confirmations')`),
]);
const integrityFunctionChecks = [
  ['refresh_match_projection', '0052_shared_session_integrity'],
  ['attach_match_session_if_safe', '0052_shared_session_integrity'],
  ['invalidate_pending_session_confirmations', '0053_session_confirmation_invalidation'],
].map(([name, migration]) => {
  const source = readFileSync(resolve(root, `backend/drizzle/${migration}.sql`), 'utf8');
  const expectedBody = source.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION ${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`))?.[1];
  if (!expectedBody) throw new Error(`Cannot locate required function ${name}`);
  const installed = integrityFunctions.filter(row => row.name === name);
  const normalize = value => value.replace(/\r\n/g, '\n').trim();
  return { name, migration, installed: installed.length === 1,
    bodyMatches: installed.length === 1 && normalize(installed[0].body) === normalize(expectedBody) };
});
const migrationChecks = expected.map((migration, index) => {
  const tag = journal.entries[index].tag;
  // Git can change SQL line endings on Windows; identify this separately
  // from a genuinely missing/changed migration rather than claiming drift.
  const source = readFileSync(resolve(root, `backend/drizzle/${tag}.sql`), 'utf8');
  const lfHash = createHash('sha256').update(source.replace(/\r\n/g, '\n')).digest('hex');
  const crlfHash = createHash('sha256').update(source.replace(/\r?\n/g, '\r\n')).digest('hex');
  const recorded = migrations.filter((entry) => Number(entry.created_at) === migration.folderMillis);
  // Legacy journal entries can share a timestamp; match the content as well.
  const equivalent = migrations.filter((entry) => [migration.hash, lfHash, crlfHash].includes(entry.hash));
  const row = recorded.find((entry) => [migration.hash, lfHash, crlfHash].includes(entry.hash)) ?? equivalent[0] ?? recorded[0];
  return { tag, applied: Boolean(row), hashMatches: row?.hash === migration.hash,
    lineEndingEquivalent: Boolean(row && (row.hash === lfHash || row.hash === crlfHash)),
    equivalentRecordedTimestamps: equivalent.map((entry) => Number(entry.created_at)) };
});
const unknownMigrationCount = migrations.filter((row) => !expected.some(
  (migration) => Number(row.created_at) === migration.folderMillis,
)).length;
const result = {
  checkedAt: new Date().toISOString(), target, databaseIdentity,
  latestRequiredMigration: journal.entries.at(-1).tag,
  migrationCount: migrationChecks.length,
  missingOrChangedMigrations: migrationChecks.filter((migration) => !migration.applied || (!migration.hashMatches && !migration.lineEndingEquivalent)),
  lineEndingOnlyDifferences: migrationChecks.filter((migration) => !migration.hashMatches && migration.lineEndingEquivalent).map((migration) => migration.tag),
  unknownMigrationCount,
  missingSourceTables,
  replication,
  clockSessionTriggerInstalled: clockTrigger[0]?.installed === true,
  missingIntegrityObjects,
  integrityFunctionChecks,
  findings: findings.map((finding) => ({ finding: finding.finding, kind: finding.kind, fixtureId: finding.fixture_id })),
  note: 'No writes. This is database evidence only, not deployed flags, Cloud stream validation, backup/restore or browser approval.',
};
console.log(JSON.stringify(result, null, 2));
if (result.missingOrChangedMigrations.length || missingSourceTables.length || missingIntegrityObjects.length || integrityFunctionChecks.some(check => !check.bodyMatches) || findings.length || unknownMigrationCount || !result.clockSessionTriggerInstalled) {
  process.exitCode = 1;
}
