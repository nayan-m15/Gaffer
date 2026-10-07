// Read-only equivalence check against the pre-0055 rules and a derived-column
// simulation. Does not apply the migration to DATABASE_URL.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
const sql = neon(process.env.DATABASE_URL);
if (!process.argv[2])
  throw new Error(
    'Pass a file containing the pre-0055 sync-config.yaml from commit 3a2cc540.',
  );
const baseline = readFileSync(resolve(root, process.argv[2]), 'utf8');
const current = readFileSync(
  resolve(root, 'powersync/sync-config.yaml'),
  'utf8',
);
function query(source, name) {
  return source
    .split(`  ${name}:`)[1]
    .split(/\n {2}[a-z_]+:/)[0]
    .split(/query:\s*\|\s*\n/)[1]
    .trim();
}
const [, coaches] = await sql.transaction((tx) => [
  tx.query('SET TRANSACTION READ ONLY'),
  tx.query(
    "SELECT DISTINCT tm.team_id, tm.user_id FROM team_members tm JOIN match_session_participants p ON p.team_id=tm.team_id WHERE tm.role='coach'",
  ),
]);
assert.ok(coaches.length > 0, 'No participant coaches found; visibility was not exercised');
let checked = 0;
for (const table of ['match_event_reviews', 'match_event_operations']) {
  const name = `shared_session_${table.replace('match_event_', 'match_')}`;
  // The CTE derives exactly the value produced by migration 0055, even when
  // the inspected database has not yet installed its columns.
  const derived = `WITH ${table} AS (SELECT dependent.*,
    EXISTS (SELECT 1 FROM public.match_events canonical
      WHERE canonical.id = dependent.canonical_event_id
        AND canonical.session_id = dependent.session_id
        AND canonical.event_type <> 'injury') AS public_canonical_event
    FROM public.${table} dependent)`;
  for (const coach of coaches)
    for (const enabled of ['true', 'false']) {
      for (const userId of [coach.user_id, 'revoked-or-outsider']) {
        const claims = {
          team_id: coach.team_id,
          user_id: userId,
          two_sided_live_logging: enabled,
        };
        const bind = (statement) =>
          statement.replace(
            /auth\.parameter\('([^']+)'\)/g,
            (_match, key) => `'${claims[key].replaceAll("'", "''")}'`,
          );
        const [, difference] = await sql.transaction((tx) => [
          tx.query('SET TRANSACTION READ ONLY'),
          tx.query(`${derived}
          (${bind(query(baseline, name))} EXCEPT ${bind(query(current, name))})
          UNION ALL
          (${bind(query(current, name))} EXCEPT ${bind(query(baseline, name))})`),
        ]);
        assert.equal(difference.length, 0, `${name}: visibility changed`);
        checked++;
      }
    }
}
console.log(
  JSON.stringify({
    equivalentChecks: checked,
    coaches: coaches.length,
    readOnly: true,
    simulatedMigration: '0055',
  }),
);
