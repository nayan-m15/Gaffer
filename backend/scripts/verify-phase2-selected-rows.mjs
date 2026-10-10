import { neon } from '@neondatabase/serverless';
import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...parse(readFileSync(resolve(root, '.env'))), ...process.env };
const url = new URL(env.TEST_DATABASE_URL);
if (
  url.hostname !==
    'ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech' ||
  url.pathname !== '/neondb'
)
  throw new Error('STOP: unapproved target');
const sql = neon(env.TEST_DATABASE_URL);
const [identity] = await sql.query(
  "SELECT current_database() AS database, current_setting('neon.branch_id') AS branch, current_setting('neon.endpoint_id') AS endpoint",
);
if (
  identity.branch !== 'br-misty-moon-b2be9vmt' ||
  identity.endpoint !== 'ep-royal-star-b253pvlk'
)
  throw new Error('STOP: branch mismatch');
const evidence = JSON.parse(
  readFileSync(
    resolve(root, 'docs/phase2-validation/http-evidence.json'),
    'utf8',
  ),
);
const streams = JSON.parse(
  readFileSync(
    resolve(root, 'docs/phase2-validation/shared-stream-audit.json'),
    'utf8',
  ),
);
const result = {
  identity,
  actualClientReceipt: false,
  scope:
    'Supplemental SQL only, using retained claims from fresh Phase 2 HTTP accounts',
  fixtures: {},
};
for (const kind of ['friendly', 'competition']) {
  const fixture = evidence[kind];
  if (!fixture?.sessionId)
    throw new Error('STOP: missing passing HTTP fixture evidence');
  const sheets = await sql.query(
    'SELECT m.id, m.shared_match_id, e.team_id, t.name FROM matches m JOIN events e ON e.id=m.event_id JOIN teams t ON t.id=e.team_id WHERE m.id IN ($1,$2)',
    [fixture.matchA, fixture.matchB],
  );
  if (
    sheets.length !== 2 ||
    sheets.some(
      (s) =>
        s.shared_match_id !== fixture.sessionId ||
        !/^phase2-(home|away) Test Team /.test(s.name),
    )
  )
    throw new Error('STOP: retained sheets are not these synthetic fixtures');
  // Migration 0052 was restored after this HTTP run. Refresh only the two
  // named synthetic projections to verify the future-write identity path.
  for (const sheet of sheets)
    await sql.query('SELECT refresh_match_projection($1::uuid)', [sheet.id]);
  const fixtureResult = {
    fixtureId: fixture.fixtureId,
    sessionId: fixture.sessionId,
    sheets: sheets.map((s) => s.id),
    participants: [],
  };
  for (const tokenEvidence of evidence.auth) {
    const claims = tokenEvidence.claims;
    const selected = {};
    for (const stream of streams) {
      const query = stream.query.replace(
        /auth\.parameter\('([^']+)'\)/g,
        (_whole, key) => `'${String(claims[key]).replaceAll("'", "''")}'`,
      );
      const rows = await sql.query(query);
      selected[stream.name] = rows.filter(
        (row) =>
          row.session_id === fixture.sessionId ||
          row.shared_session_id === fixture.sessionId ||
          (stream.name.endsWith('report_state') &&
            row.id === fixture.sessionId) ||
          stream.name.endsWith('memberships'),
      );
      if (selected[stream.name].some((row) => row.event_type === 'injury'))
        throw new Error('Shared injury row selected');
    }
    fixtureResult.participants.push({
      userId: claims.user_id,
      teamId: claims.team_id,
      selected,
    });
  }
  for (const stream of streams) {
    if (
      kind === 'friendly' &&
      stream.name === 'shared_session_report_fixture_scores'
    )
      continue;
    if (
      !fixtureResult.participants.some(
        (p) => p.selected[stream.name].length > 0,
      )
    )
      throw new Error(`No selected rows for ${kind}/${stream.name}`);
  }
  result.fixtures[kind] = fixtureResult;
}
writeFileSync(
  resolve(root, 'docs/phase2-validation/selected-rows.json'),
  JSON.stringify(result, null, 2),
);
console.log(
  'Both fresh fixture types select shared rows across the two participants; the competition-score stream applies only to competitions. This is SQL evidence, not client receipt.',
);
