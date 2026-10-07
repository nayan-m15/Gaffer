import { neon } from '@neondatabase/serverless';
import { parse } from 'dotenv';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

const backend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(backend, '..');
const config = {
  ...parse(readFileSync(resolve(root, '.env'))),
  ...process.env,
};
const target = config.TEST_DATABASE_URL;
const expected = {
  host: 'ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech',
  database: 'neondb',
  branch: 'br-misty-moon-b2be9vmt',
  endpoint: 'ep-royal-star-b253pvlk',
};
const url = new URL(target);
if (url.hostname !== expected.host || url.pathname !== '/neondb')
  throw new Error('STOP: effective test endpoint changed');
const sql = neon(target);
const [identity] = await sql.query(
  "SELECT current_database() AS database, current_setting('neon.branch_id') AS branch, current_setting('neon.endpoint_id') AS endpoint",
);
if (
  identity.branch !== expected.branch ||
  identity.endpoint !== expected.endpoint ||
  identity.database !== expected.database
)
  throw new Error('STOP: effective database identity changed');
const git = (...args) =>
  spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trimEnd();
const allowed = new Set([
  'backend/drizzle/meta/_journal.json',
  'backend/drizzle/0052_shared_session_integrity.sql',
  'backend/src/competitions/competition-fixture-results.ts',
  'backend/src/competitions/competition-fixtures.spec.ts',
  'backend/src/events/events.service.ts',
  'backend/src/matches/matches.service.ts',
  'backend/src/matches/match-session-integrity.ts',
  'backend/src/matches/shared-session-integrity.spec.ts',
  'backend/src/sync/sync.controller.ts',
  'backend/test/team-isolation.e2e-spec.ts',
  'docs/phase1-shared-session-integrity-verification.md',
  'backend/scripts/validate-phase15.mjs',
  'backend/test/phase15-integrity.e2e-spec.ts',
  'docs/phase15-validation/',
  'docs/phase15-real-environment-validation.md',
]);
const files = git('status', '--porcelain')
  .split('\n')
  .filter(Boolean)
  .map((line) => line.slice(3));
const unexpected = files.filter((file) => !allowed.has(file));
if (unexpected.length)
  throw new Error(`STOP: unexpected working diff: ${unexpected.join(', ')}`);
const info = {
  ...expected,
  confirmedDisposable: true,
  confirmation: 'Explicit user authorization for this exact Neon branch',
  gitBranch: git('branch', '--show-current'),
  sha: git('rev-parse', 'HEAD'),
  workingDiffExpected: true,
  files,
  flag: 'true',
};
console.log(JSON.stringify(info, null, 2));
const directory = resolve(root, 'docs/phase15-validation');
mkdirSync(directory, { recursive: true });
writeFileSync(
  resolve(directory, 'environment.json'),
  JSON.stringify(info, null, 2),
);
const env = {
  ...config,
  TEST_DATABASE_URL: target,
  TWO_SIDED_LIVE_LOGGING_ENABLED: 'true',
  OFFLINE_SYNC_ENABLED: 'true',
  BREVO_API_KEY: '',
  PHASE15_EVIDENCE_DIR: directory,
};

async function snapshot() {
  const tables = await sql.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const results = await sql.transaction((tx) => [
    tx.query('SET TRANSACTION READ ONLY'),
    ...tables.map(({ tablename }) => {
      const name = '"' + tablename.replaceAll('"', '""') + '"';
      return tx.query(
        `SELECT '${tablename}' AS table_name, count(*)::int AS rows, md5(coalesce(string_agg(row_to_json(t)::text, '' ORDER BY row_to_json(t)::text), '')) AS digest FROM public.${name} t`,
      );
    }),
    tx.query(
      "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position",
    ),
  ]);
  return { rows: results.slice(1, -1).flat(), columns: results.at(-1) };
}
async function run(args, migration = false) {
  // Pin process environment; dotenv does not override these values.
  const childEnv = {
    ...env,
    DATABASE_URL: migration ? target : config.DATABASE_URL,
  };
  const started = Date.now();
  let output = '';
  const child = spawn(process.execPath, args, {
    cwd: backend,
    env: childEnv,
    windowsHide: true,
  });
  child.stdout.on('data', (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
    process.stderr.write(chunk);
  });
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  const label = process.argv[2];
  writeFileSync(resolve(directory, `${label}.log`), output);
  writeFileSync(
    resolve(directory, `${label}-process.json`),
    JSON.stringify(
      {
        command: [process.execPath, ...args],
        exitCode: code,
        durationSeconds: (Date.now() - started) / 1000,
      },
      null,
      2,
    ),
  );
  const [after] = await sql.query(
    "SELECT current_setting('neon.branch_id') AS branch, current_setting('neon.endpoint_id') AS endpoint",
  );
  if (after.branch !== expected.branch || after.endpoint !== expected.endpoint)
    throw new Error('STOP: endpoint changed during run');
  if (code !== 0) process.exitCode = code;
}
const mode = process.argv[2];
if (mode === 'migrate') {
  const before = await snapshot();
  await run(['scripts/migrate.mjs'], true);
  if (process.exitCode) throw new Error('Migration command failed; stop');
  const after = await snapshot();
  const unchanged = JSON.stringify(before) === JSON.stringify(after);
  const migration = readMigrationFiles({
    migrationsFolder: resolve(backend, 'drizzle'),
  }).at(-1);
  const journal = await sql.query(
    'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations WHERE created_at = $1',
    [migration.folderMillis],
  );
  const functions = await sql.query(
    "SELECT proname, pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('attach_match_session_if_safe', 'refresh_match_projection') AND pronamespace = 'public'::regnamespace ORDER BY proname",
  );
  const result = {
    before,
    after,
    publicDataAndColumnsUnchanged: unchanged,
    expectedJournal: {
      hash: migration.hash,
      timestamp: migration.folderMillis,
    },
    journal,
    functions,
  };
  writeFileSync(
    resolve(directory, 'migration.json'),
    JSON.stringify(result, null, 2),
  );
  if (
    !unchanged ||
    !journal.some((row) => row.hash === migration.hash) ||
    functions.length !== 2 ||
    !functions
      .find((f) => f.proname === 'refresh_match_projection')
      ?.definition.includes('session_id = EXCLUDED.session_id')
  )
    throw new Error('Migration verification failed');
  console.log(
    '0052 journal, functions, and unchanged public data/columns verified.',
  );
} else if (mode === 'e2e' || mode === 'e2e-rerun') {
  await run([
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/friendly-fixtures.e2e-spec.ts',
    'test/competitions.e2e-spec.ts',
    'test/offline-sync.e2e-spec.ts',
    'test/team-isolation.e2e-spec.ts',
  ]);
} else if (mode === 'phase15' || mode === 'phase15-rerun') {
  await run([
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/phase15-integrity.e2e-spec.ts',
  ]);
} else throw new Error('Expected migrate, e2e or phase15');
