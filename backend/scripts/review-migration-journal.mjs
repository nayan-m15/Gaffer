// Read-only review: match journal hashes to current and historical SQL blobs.
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
assert.equal(process.argv[2], '--blue-hill');
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname.replace('-pooler.', '.'), 'ep-blue-hill-b1j037cs.c-5.eu-central-1.aws.neon.tech');
const sql = neon(url.toString());
const [, identities, recorded, columns, indexes, constraints, enums] = await sql.transaction(tx => [
  tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'),
  tx.query(`SELECT current_database() AS database, current_setting('neon.branch_id') AS branch,
    current_setting('neon.endpoint_id') AS endpoint`),
  tx.query('SELECT * FROM drizzle.__drizzle_migrations ORDER BY created_at, id'),
  tx.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"),
  tx.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname"),
  tx.query("SELECT c.relname AS table_name,co.conname,pg_get_constraintdef(co.oid) AS definition FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,co.conname"),
  tx.query("SELECT t.typname,array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname"),
]);
assert.equal(identities[0].endpoint, 'ep-blue-hill-b1j037cs');
assert.equal(identities[0].branch, 'br-odd-cell-b1onih3h');
assert.equal(identities[0].database, 'neondb');
const hash = value => createHash('sha256').update(value).digest('hex');
const hashes = value => [...new Set([hash(value), hash(value.replace(/\r\n/g, '\n')), hash(value.replace(/\r?\n/g, '\r\n'))])];
const entries = JSON.parse(readFileSync(resolve(root, 'backend/drizzle/meta/_journal.json'), 'utf8')).entries;
const current = entries.map(entry => ({ ...entry, hashes: hashes(readFileSync(resolve(root, `backend/drizzle/${entry.tag}.sql`), 'utf8')) }));
const historical = new Map();
const objects = execFileSync('git', ['rev-list', '--objects', '--all', '--', 'backend/drizzle'], { cwd: root, encoding: 'utf8' });
for (const line of objects.trim().split('\n')) {
  const [oid, path] = line.split(' ');
  if (!path?.match(/^backend\/drizzle\/[^/]+\.sql$/)) continue;
  const body = execFileSync('git', ['cat-file', 'blob', oid], { cwd: root, encoding: 'utf8' });
  for (const digest of hashes(body)) {
    const matches = historical.get(digest) ?? [];
    matches.push({ path, blob: oid }); historical.set(digest, matches);
  }
}
const rows = recorded.map(row => ({ id: row.id, timestamp: Number(row.created_at), hash: row.hash,
  currentMatches: current.filter(entry => entry.hashes.includes(row.hash)).map(entry => entry.tag),
  historicalMatches: historical.get(row.hash) ?? [],
  expectedAtTimestamp: current.filter(entry => entry.when === Number(row.created_at)).map(entry => entry.tag),
}));
const review = current.map(entry => ({ tag: entry.tag, timestamp: entry.when,
  contentRecorded: rows.filter(row => row.currentMatches.includes(entry.tag)).map(row => ({ id: row.id, timestamp: row.timestamp })),
  timestampRows: rows.filter(row => row.timestamp === entry.when).map(row => row.id),
}));
const result = { checkedAt: new Date().toISOString(), identity: identities[0], rows, review,
  duplicateSourceTimestamps: entries.filter((entry, i) => entries.some((other, j) => i !== j && entry.when === other.when)).map(entry => ({ tag: entry.tag, timestamp: entry.when })),
  unmatchedRows: rows.filter(row => !row.currentMatches.length && !row.historicalMatches.length),
  contentAbsent: review.filter(entry => !entry.contentRecorded.length),
  catalog: { columns, indexes, constraints, enums },
  note: 'No journal/schema changes. Presence of current catalog objects does not prove historical backfills ran. Unknown hashes must not be replaced with current hashes.',
};
const directory = resolve(root, 'docs/phase-history-validation'); mkdirSync(directory, { recursive: true });
const path = resolve(directory, `journal-${result.checkedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(path, JSON.stringify(result, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ checkedAt: result.checkedAt, identity: result.identity, evidencePath: path,
  recordedCount: rows.length, duplicateSourceTimestamps: result.duplicateSourceTimestamps,
  displacedCurrentContent: rows.filter(row => row.currentMatches.length && !row.currentMatches.some(tag => row.expectedAtTimestamp.includes(tag))),
  historicalOnly: rows.filter(row => !row.currentMatches.length && row.historicalMatches.length),
  unmatchedRows: result.unmatchedRows, contentAbsent: result.contentAbsent,
}, null, 2));
