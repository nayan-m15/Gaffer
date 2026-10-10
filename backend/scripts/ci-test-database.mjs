import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { appendFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Gives one CI job (or one local test run) a private, throwaway database.
 *
 * Every pipeline used to share the single database behind TEST_DATABASE_URL.
 * Jobs from different branches and PRs ran at the same time, and each one
 * either reset that database (`db:migrate:test`) or migrated it forward
 * (`db:migrate`), so a job could have its schema wiped or replaced by
 * another branch's mid-run. Incremental migration also skips migrations
 * older than the newest one already applied, so a database last migrated by
 * another branch could end up with functions but not the tables they use.
 *
 *   node scripts/ci-test-database.mjs create [label]
 *   node scripts/ci-test-database.mjs drop
 *
 * `create` connects with CI_TEST_DATABASE_BASE_URL (falling back to
 * TEST_DATABASE_URL), creates a new database next to it on the same server,
 * and prints its URL. Under Actions it instead exports it as
 * TEST_DATABASE_URL for later steps through $GITHUB_ENV. `drop` removes the
 * database that TEST_DATABASE_URL points at, but only if it is one this
 * script created.
 */

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backendRoot, '..', '.env'), quiet: true });

const PREFIX = 'ci_test_';
// Longer than any job's timeout, so only databases from runs that were
// cancelled or crashed before their drop step are swept.
const STALE_AFTER_SECONDS = 3 * 60 * 60;

const [command, label = ''] = process.argv.slice(2);
const baseUrl =
  process.env.CI_TEST_DATABASE_BASE_URL ?? process.env.TEST_DATABASE_URL;

if (!baseUrl) {
  throw new Error(
    'CI_TEST_DATABASE_BASE_URL or TEST_DATABASE_URL is required to manage test databases.',
  );
}

function databaseNameOf(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

function withDatabase(url, name) {
  const next = new URL(url);
  next.pathname = `/${name}`;
  return next.toString();
}

function quoteIdent(name) {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Refusing to use unexpected database name "${name}".`);
  }
  return `"${name}"`;
}

/** Connects to the server's maintenance database, never a test database. */
function adminSql() {
  const baseName = databaseNameOf(baseUrl);
  if (baseName.startsWith(PREFIX)) {
    throw new Error(
      'The base URL must point at a regular database, not a per-run one.',
    );
  }
  return neon(baseUrl);
}

async function dropStaleDatabases(sql) {
  const now = Math.floor(Date.now() / 1000);
  const rows = await sql.query(
    `SELECT datname FROM pg_database WHERE datname LIKE $1`,
    [`${PREFIX}%`],
  );
  for (const { datname } of rows) {
    const createdAt = Number(datname.slice(PREFIX.length).split('_')[0]);
    if (Number.isFinite(createdAt) && now - createdAt > STALE_AFTER_SECONDS) {
      await sql.query(
        `DROP DATABASE IF EXISTS ${quoteIdent(datname)} WITH (FORCE)`,
      );
      console.log(`Dropped stale test database ${datname}.`);
    }
  }
}

async function create() {
  const sql = adminSql();
  await dropStaleDatabases(sql);

  const suffix = [
    process.env.GITHUB_RUN_ID,
    process.env.GITHUB_RUN_ATTEMPT,
    label,
    Math.random().toString(36).slice(2, 8),
  ]
    .filter(Boolean)
    .join('_')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  // The creation time leads the name so stale databases can be swept later.
  const name = `${PREFIX}${Math.floor(Date.now() / 1000)}_${suffix}`.slice(
    0,
    63,
  );

  await sql.query(`CREATE DATABASE ${quoteIdent(name)}`);
  const url = withDatabase(baseUrl, name);

  if (process.env.GITHUB_ENV) {
    // The URL embeds the secret's password, so keep it out of the logs.
    console.log(`::add-mask::${url}`);
    appendFileSync(process.env.GITHUB_ENV, `TEST_DATABASE_URL=${url}\n`);
    console.log(`Created isolated test database ${name}.`);
  } else {
    console.log(url);
  }
}

async function drop() {
  const target = process.env.TEST_DATABASE_URL;
  const name = target ? databaseNameOf(target) : '';
  if (!name.startsWith(PREFIX)) {
    console.log('No per-run test database to drop.');
    return;
  }
  await adminSql().query(
    `DROP DATABASE IF EXISTS ${quoteIdent(name)} WITH (FORCE)`,
  );
  console.log(`Dropped test database ${name}.`);
}

if (command === 'create') {
  await create();
} else if (command === 'drop') {
  await drop();
} else {
  throw new Error('Usage: ci-test-database.mjs <create [label]|drop>');
}
