// Export exact historical fixture evidence without changing the database.
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
assert.equal(process.argv[2], '--blue-hill', 'Specify the intended --blue-hill development source.');
const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname.replace('-pooler.', '.'), 'ep-blue-hill-b1j037cs.c-5.eu-central-1.aws.neon.tech');
assert.equal(url.pathname, '/neondb');
const query = readFileSync(resolve(root, 'docs/two-sided-test-data-repair.md'), 'utf8')
  .match(/```sql\s+BEGIN TRANSACTION READ ONLY;([\s\S]*?)ROLLBACK;\s*```/)?.[1];
assert(query, 'Documented historical query missing.');
const sql = neon(url.toString());
const [, identity, exported] = await sql.transaction(tx => [
  tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY'),
  tx.query(`SELECT current_database() AS database, current_setting('neon.branch_id') AS branch,
    current_setting('neon.endpoint_id') AS endpoint`),
  tx.query(`WITH findings AS (${query.trim().replace(/;$/, '')}),
    fixtures AS (
      SELECT 'competition' AS kind, id, shared_session_id, to_jsonb(f) AS data
      FROM competition_fixtures f WHERE id IN (SELECT fixture_id FROM findings WHERE kind = 'competition')
      UNION ALL SELECT 'friendly', id, shared_session_id, to_jsonb(f)
      FROM friendly_fixtures f WHERE id IN (SELECT fixture_id FROM findings WHERE kind = 'friendly')
    ), selected_events AS (
      SELECT e.* FROM events e JOIN fixtures f ON
        (f.kind = 'competition' AND e.competition_fixture_id = f.id)
        OR (f.kind = 'friendly' AND e.friendly_fixture_id = f.id)
    ), sheets AS (SELECT m.* FROM matches m WHERE event_id IN (SELECT id FROM selected_events)),
    sessions AS (
      SELECT shared_session_id AS id FROM fixtures WHERE shared_session_id IS NOT NULL
      UNION SELECT shared_match_id FROM sheets WHERE shared_match_id IS NOT NULL
    ), evidence AS (
      SELECT 'findings' AS name, to_jsonb(f) AS data FROM findings f
      UNION ALL SELECT kind || '_fixtures', data FROM fixtures
      UNION ALL SELECT 'events', to_jsonb(e) FROM selected_events e
      UNION ALL SELECT 'matches', to_jsonb(m) FROM sheets m
      UNION ALL SELECT 'match_sessions', to_jsonb(s) FROM match_sessions s WHERE id IN (SELECT id FROM sessions)
      UNION ALL SELECT 'match_session_participants', to_jsonb(p) FROM match_session_participants p WHERE session_id IN (SELECT id FROM sessions)
      ${['match_projection_state', 'match_event_observations', 'match_events', 'match_event_operations', 'match_event_reviews', 'match_clock_operations'].map(table =>
        `UNION ALL SELECT '${table}', to_jsonb(r) FROM ${table} r WHERE match_id IN (SELECT id FROM sheets) OR session_id IN (SELECT id FROM sessions)`
      ).join('\n')}
      UNION ALL SELECT 'match_event_memberships', to_jsonb(r) FROM match_event_memberships r
        WHERE observation_id IN (SELECT id FROM match_event_observations WHERE match_id IN (SELECT id FROM sheets) OR session_id IN (SELECT id FROM sessions))
        OR canonical_event_id IN (SELECT id FROM match_events WHERE match_id IN (SELECT id FROM sheets) OR session_id IN (SELECT id FROM sessions))
      UNION ALL SELECT 'competition_teams', to_jsonb(r) FROM competition_teams r
        WHERE competition_id IN (SELECT competition_id FROM sheets)
      UNION ALL SELECT 'competition_matches', to_jsonb(r) FROM competition_matches r
        WHERE competition_id IN (SELECT competition_id FROM sheets)
      UNION ALL SELECT 'team_members', to_jsonb(r) FROM team_members r WHERE team_id IN (SELECT team_id FROM selected_events)
    ) SELECT name, jsonb_agg(data ORDER BY data::text) AS rows FROM evidence GROUP BY name ORDER BY name`),
]);
assert.equal(identity[0].endpoint, 'ep-blue-hill-b1j037cs');
assert.equal(identity[0].branch, 'br-odd-cell-b1onih3h');
const tables = Object.fromEntries(exported.map(row => [row.name, row.rows]));
const assessments = (tables.findings ?? [])
  .filter(row => row.finding !== 'duplicate_completed_fixture_result_candidates')
  .map(finding => {
    const fixture = tables[`${finding.kind}_fixtures`].find(row => row.id === finding.fixture_id);
    const events = tables.events.filter(row => row[`${finding.kind}_fixture_id`] === fixture.id);
    const sheets = tables.matches.filter(row => events.some(event => event.id === row.event_id));
    const expectedHomeTeam = finding.kind === 'friendly' ? fixture.requester_team_id
      : tables.competition_teams.find(row => row.id === fixture.home_competition_team_id)?.team_id;
    const expectedAwayTeam = finding.kind === 'friendly' ? fixture.opponent_team_id
      : tables.competition_teams.find(row => row.id === fixture.away_competition_team_id)?.team_id;
    return {
      kind: finding.kind, fixtureId: fixture.id, finding: finding.finding,
      publishedScore: finding.kind === 'competition' ? [fixture.home_score, fixture.away_score] : null,
      sheets: sheets.map(sheet => {
        const event = events.find(row => row.id === sheet.event_id);
        const expectedIsHome = event.team_id === expectedHomeTeam ? true
          : event.team_id === expectedAwayTeam ? false : null;
        const goals = (tables.match_events ?? []).filter(row => row.match_id === sheet.id && row.event_type === 'goal' && row.lifecycle_status !== 'voided');
        return { matchId: sheet.id, sessionId: sheet.shared_match_id, eventStatus: event.status,
          storedIsHome: sheet.is_home, expectedIsHome,
          ownGoals: goals.filter(row => row.team === 'own').length,
          opponentGoals: goals.filter(row => row.team === 'opponent').length,
          observationCount: (tables.match_event_observations ?? []).filter(row => row.match_id === sheet.id).length,
          finalisationState: (tables.match_projection_state ?? []).find(row => row.match_id === sheet.id)?.finalisation_state,
        };
      }),
      disposition: 'Explicit reconciliation required; do not attach completed sheets or choose between recorded goals automatically.',
    };
  });
const snapshot = { checkedAt: new Date().toISOString(), identity: identity[0], tables,
  assessments,
  scope: 'Exact fixture evidence export; read-only, not a full database backup.' };
const directory = resolve(root, 'docs/phase-history-validation');
mkdirSync(directory, { recursive: true });
const path = resolve(directory, `history-${snapshot.checkedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(path, JSON.stringify(snapshot, null, 2), { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ checkedAt: snapshot.checkedAt, identity: snapshot.identity, evidencePath: path,
  counts: Object.fromEntries(exported.map(row => [row.name, row.rows.length])),
  assessments,
}, null, 2));
