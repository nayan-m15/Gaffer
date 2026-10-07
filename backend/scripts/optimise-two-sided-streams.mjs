// Compare rewritten SQL with current visibility before updating local rules.
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
const sql = neon(process.env.DATABASE_URL);
const source = readFileSync(
  resolve(root, 'powersync/sync-config.yaml'),
  'utf8',
).replace(/\r\n/g, '\n');
const headers = [...source.matchAll(/^  (\w+):$/gm)];
const blocks = headers.map((m, i) => ({
  name: m[1],
  start: m.index,
  end: headers[i + 1]?.index ?? source.length,
  body: source.slice(m.index, headers[i + 1]?.index ?? source.length),
}));
let updated = source;
const checks = [];
for (const name of [
  'shared_session_match_reviews',
  'shared_session_match_operations',
  'shared_session_match_memberships',
  'shared_session_match_events',
  'shared_session_match_observations',
  'shared_session_match_projections',
  'shared_session_match_clock_operations',
]) {
  const block = blocks.find((b) => b.name === name);
  const table = {
    shared_session_match_reviews: 'match_event_reviews',
    shared_session_match_operations: 'match_event_operations',
    shared_session_match_memberships: 'match_event_memberships',
    shared_session_match_events: 'match_events',
    shared_session_match_observations: 'match_event_observations',
    shared_session_match_projections: 'match_projection_state',
    shared_session_match_clock_operations: 'match_clock_operations',
  }[name];
  const membership = table === 'match_event_memberships';
  const dataTable = membership ? 'match_event_observations' : table;
  const from = `      FROM ${table}`;
  const select = block.body.slice(
    block.body.indexOf('      SELECT'),
    block.body.indexOf(from),
  );
  const canonical = ['match_event_reviews', 'match_event_operations'].includes(
    table,
  );
  const join = membership
    ? `      JOIN match_event_observations ON match_event_observations.id = match_event_memberships.observation_id\n`
    : canonical
      ? `      JOIN match_events AS public_event ON public_event.id || '/' || public_event.session_id = ${table}.canonical_event_id || '/' || ${table}.session_id\n`
      : '';
  let query =
    select +
    from +
    '\n' +
    join +
    `      JOIN matches AS peer_sheet ON peer_sheet.id || '/' || peer_sheet.shared_match_id = ${dataTable}.match_id || '/' || ${dataTable}.session_id\n` +
    `      JOIN match_session_participants AS participant ON participant.session_id || '/' || CASE participant.side WHEN 'home' THEN 0 ELSE 1 END = peer_sheet.shared_match_id || '/' || CASE peer_sheet.is_home WHEN true THEN 1 ELSE 0 END\n` +
    `      WHERE ${dataTable}.session_id IS NOT NULL\n` +
    (membership ||
    canonical ||
    ['match_events', 'match_event_observations'].includes(table)
      ? `        AND ${membership ? 'match_event_observations' : canonical ? 'public_event' : table}.event_type <> 'injury'\n`
      : '') +
    (canonical
      ? `        AND public_event.session_id IN (SELECT match_session_participants.session_id FROM match_session_participants WHERE match_session_participants.team_id = auth.parameter('team_id'))\n`
      : '') +
    `        AND auth.parameter('two_sided_live_logging') = 'true'\n` +
    `        AND participant.team_id = auth.parameter('team_id')\n` +
    `        AND participant.team_id IN (SELECT team_members.team_id FROM team_members WHERE team_members.user_id = auth.parameter('user_id'))\n` +
    (table === 'match_event_operations'
      ? `        AND (match_event_operations.operation_type = 'merge' OR match_event_operations.operation_type = 'separate')\n`
      : '');
  const oldQuery = block.body.slice(block.body.indexOf('      SELECT')).trim();
  const teams = await sql.query(
    `SELECT tm.team_id,tm.user_id FROM team_members tm WHERE tm.role='coach' AND tm.team_id IN ('4d33f355-5c40-4830-8a3c-6b84c2f991b9','c21b2ad0-4c84-4f62-9d31-dc2c4f8fadff')`,
  );
  for (const team of [
    ...teams,
    ...teams.map((t) => ({ ...t, user_id: 'revoked-or-outsider' })),
  ]) {
    const bind = (q) =>
      q
        .replaceAll("auth.parameter('team_id')", `'${team.team_id}'`)
        .replaceAll("auth.parameter('user_id')", `'${team.user_id}'`)
        .replaceAll("auth.parameter('two_sided_live_logging')", "'true'");
    const [, difference] = await sql.transaction((tx) => [
      tx.query('SET TRANSACTION READ ONLY'),
      tx.query(
        `(${bind(oldQuery)} EXCEPT ${bind(query)}) UNION ALL (${bind(query)} EXCEPT ${bind(oldQuery)})`,
      ),
    ]);
    assert.equal(difference.length, 0, `Visibility changed: ${name}`);
  }
  updated = updated.replace(
    block.body,
    `  ${name}:\n    auto_subscribe: true\n    query: |\n${query}\n`,
  );
  checks.push({
    stream: name,
    visibilityEquivalentForBothCoachesAndOutsider: true,
  });
}
const directory = resolve(root, 'docs/phase-stream-validation');
mkdirSync(directory, { recursive: true });
if (!existsSync(resolve(directory, 'sync-before.yaml')))
  writeFileSync(resolve(directory, 'sync-before.yaml'), source, { flag: 'wx' });
// Related default queries share parameter lookups and buckets within one stream.
// Keep named streams available for existing explicit subscriptions/diagnostics.
updated = updated.replace(
  /^  shared_session_review_data:\n[\s\S]*?(?=^  \w+:|$(?![\s\S]))/m,
  '',
);
for (const [group, names] of [
  [
    'team_data',
    blocks
      .filter((b) => b.name.startsWith('team_') && b.name !== 'team_data')
      .map((b) => b.name),
  ],
  [
    'shared_session_data',
    blocks
      .filter(
        (b) =>
          b.name.startsWith('shared_session_') &&
          !['shared_session_data', 'shared_session_review_data'].includes(
            b.name,
          ),
      )
      .map((b) => b.name),
  ],
]) {
  const queries = [];
  for (const name of names) {
    const pattern = new RegExp(
      `(^  ${name}:\\n)([\\s\\S]*?)(?=^  \\w+:|$(?![\\s\\S]))`,
      'm',
    );
    const found = updated.match(pattern);
    const body = found[2];
    queries.push(body.slice(body.indexOf('      SELECT')).trimEnd());
    updated = updated.replace(
      found[0],
      found[1] + body.replace('auto_subscribe: true', 'auto_subscribe: false'),
    );
  }
  const grouped = `  ${group}:\n    auto_subscribe: true\n    queries:\n${queries
    .map(
      (q) =>
        '      - |\n' +
        q
          .split('\n')
          .map((l) => '  ' + l)
          .join('\n'),
    )
    .join('\n')}\n\n`;
  const existing = new RegExp(
    `^  ${group}:\\n[\\s\\S]*?(?=^  \\w+:|$(?![\\s\\S]))`,
    'm',
  );
  updated = existing.test(updated)
    ? updated.replace(existing, grouped)
    : updated + '\n' + grouped;
}
writeFileSync(resolve(root, 'powersync/sync-config.yaml'), updated.replace(/[ \t]+$/gm, '').trimEnd()+'\n');
console.log(JSON.stringify(checks, null, 2));
