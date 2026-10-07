import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrationContentHashes, planMigrations } from './migration-plan.mjs';

const migration = (tag, folderMillis, source) => ({
  tag,
  folderMillis,
  source,
  hash: [...migrationContentHashes(source)][0],
  sql: [source],
});
const old = migration(
  'old',
  20,
  'ALTER TABLE example ADD COLUMN existing integer;\n',
);
const next = migration(
  'new',
  30,
  'ALTER TABLE example ADD COLUMN added integer;\n',
);

test('a fresh database applies every migration in journal order', () => {
  assert.deepEqual(planMigrations([old, next], []).pending, [old, next]);
});
test('moved timestamps do not replay exactly recorded SQL', () => {
  const recorded = [{ hash: old.hash, created_at: '10' }];
  const original = structuredClone(recorded);
  const plan = planMigrations([old, next], recorded);
  assert.deepEqual(plan.pending, [next]);
  assert.deepEqual(plan.alreadyRecorded, [old]);
  assert.deepEqual(
    recorded,
    original,
    'Historical records must remain unchanged',
  );
});
test('LF and CRLF are equivalent migration content', () => {
  const windows = migration('old', 20, old.source.replaceAll('\n', '\r\n'));
  assert.equal(
    planMigrations([windows], [{ hash: old.hash, created_at: 10 }]).pending
      .length,
    0,
  );
  assert.equal(
    planMigrations([old], [{ hash: windows.hash, created_at: 10 }]).pending
      .length,
    0,
  );
});
test('different SQL is not accepted on the strength of a moved timestamp', () => {
  const changed = migration(
    'old',
    20,
    old.source + 'CREATE INDEX changed ON example(existing);\n',
  );
  assert.deepEqual(
    planMigrations([changed], [{ hash: old.hash, created_at: 10 }]).pending,
    [changed],
  );
});
test('unmatched older history is not automatically replayed', () => {
  assert.deepEqual(
    planMigrations(
      [old, next],
      [{ hash: 'historical-content', created_at: 20 }],
    ).pending,
    [next],
  );
});
test('an applied new migration leaves no pending work', () => {
  assert.deepEqual(
    planMigrations(
      [old, next],
      [
        { hash: old.hash, created_at: 10 },
        { hash: next.hash, created_at: 30 },
      ],
    ).pending,
    [],
  );
});
test('real SQL skips an existing column, applies the new migration once and retains history', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE example (id integer);
      CREATE TABLE migration_records (hash text, created_at bigint);
      ${old.source}`);
    await pg.query('INSERT INTO migration_records VALUES ($1,$2)', [
      old.hash,
      10,
    ]);
    const { rows: recorded } = await pg.query(
      'SELECT * FROM migration_records',
    );
    for (const pending of planMigrations([old, next], recorded).pending) {
      await pg.transaction(async (tx) => {
        await tx.exec(pending.source);
        await tx.query('INSERT INTO migration_records VALUES ($1,$2)', [
          pending.hash,
          pending.folderMillis,
        ]);
      });
    }
    const { rows: after } = await pg.query(
      'SELECT * FROM migration_records ORDER BY created_at',
    );
    assert.equal(after.length, 2);
    assert.equal(Number(after[0].created_at), 10);
    assert.equal(after[0].hash, old.hash);
    assert.equal(planMigrations([old, next], after).pending.length, 0);
    await pg.exec('INSERT INTO example (id, existing, added) VALUES (1, 2, 3)');
  } finally {
    await pg.close();
  }
});

test('shared report migration supports prepared queries and records successful application once', async () => {
  const pg = new PGlite();
  try {
    const folder = fileURLToPath(new URL('../drizzle/', import.meta.url));
    const journal = JSON.parse(readFileSync(`${folder}/meta/_journal.json`, 'utf8'));
    const migrations = readMigrationFiles({ migrationsFolder: folder }).map((entry, index) => ({
      ...entry,
      tag: journal.entries[index].tag,
      source: readFileSync(`${folder}/${journal.entries[index].tag}.sql`, 'utf8'),
    }));
    const targetIndex = migrations.findIndex(entry => entry.tag === '0057_shared_report_approvals');
    assert.notEqual(targetIndex, -1);
    for (const previous of migrations.slice(0, targetIndex)) await pg.exec(previous.source);
    await pg.exec('CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations (hash text NOT NULL, created_at bigint)');
    for (const previous of migrations.slice(0, targetIndex)) {
      await pg.query('INSERT INTO drizzle.__drizzle_migrations VALUES ($1, $2)', [previous.hash, previous.folderMillis]);
    }
    const target = migrations[targetIndex];
    const { rows: before } = await pg.query('SELECT * FROM drizzle.__drizzle_migrations');
    assert.deepEqual(planMigrations(migrations, before).pending[0], target);
    await pg.transaction(async tx => {
      // Match Neon: each breakpoint chunk is one prepared query, not exec().
      for (const statement of target.sql.filter(statement => statement.trim())) await tx.query(statement);
      await tx.query('INSERT INTO drizzle.__drizzle_migrations VALUES ($1, $2)', [target.hash, target.folderMillis]);
    });
    const { rows: after } = await pg.query('SELECT * FROM drizzle.__drizzle_migrations');
    assert.equal(after.length, before.length + 1);
    assert.equal(planMigrations(migrations, after).pending.some(entry => entry.tag === target.tag), false);
    const { rows: objects } = await pg.query(`SELECT
      to_regclass('match_amendments') IS NOT NULL AS amendments,
      to_regclass('match_amendments_session_index') IS NOT NULL AS amendment_index,
      to_regprocedure('confirm_shared_report(uuid,text,integer)') IS NOT NULL AS confirmation,
      to_regprocedure('respond_match_amendment(uuid,text,text,text)') IS NOT NULL AS response`);
    assert.deepEqual(objects, [{ amendments: true, amendment_index: true, confirmation: true, response: true }]);
  } finally {
    await pg.close();
  }
});
