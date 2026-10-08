// Read-only benchmark and query-plan inspection for the anonymous public
// dashboard endpoints (SEC-008).
//
// Reports, for the worst case the data actually contains:
//   * how many rows the player aggregation fans out to, which is what makes
//     the endpoint expensive -- it is `page size x matches per athlete`, not
//     the page size alone;
//   * wall-clock timings for the two statements `getPlayers` issues, plus the
//     standings query, each run cold and then warm;
//   * `EXPLAIN (ANALYZE, BUFFERS)` for the fan-out statement, so the indexes
//     it relies on (`athlete_match_stats_athlete_id_index` and
//     `match_events_match_athlete_type_index`) can be confirmed as used
//     rather than assumed.
//
// The SQL below mirrors `src/public-api/public-dashboard.service.ts`; keep the
// two in step when that service changes. Everything runs inside a READ ONLY
// transaction, so this is safe to point at any environment.
//
// Usage: node scripts/benchmark-public-dashboard.mjs [--limit 200] [--json]

import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set; nothing to benchmark.');
  process.exit(1);
}

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const limitArg = Number(args[args.indexOf('--limit') + 1]);
// 200 is the cap enforced by `publicPlayersQuerySchema`, so it is the largest
// page an anonymous caller can actually request.
const LIMIT = Number.isInteger(limitArg) && limitArg > 0 ? limitArg : 200;

const sql = neon(process.env.DATABASE_URL);

/** Mirrors the second, expensive statement in `getPlayers`. */
const playerFanOut = `
  SELECT a.id, a.first_name, a.last_name, a.position, a.squad_number,
         t.id AS team_id, t.name AS team_name,
         ams.match_id, e.status AS event_status, ams.minutes_played,
         ams.started OR EXISTS (
           SELECT 1 FROM match_events me
           WHERE me.match_id = ams.match_id AND me.team = 'own'
             AND me.event_type = 'substitution'
             AND me.detail = ams.athlete_id::text
         ) AS appeared,
         coalesce((SELECT count(*)::int FROM match_events me
           WHERE me.match_id = ams.match_id AND me.athlete_id = ams.athlete_id
             AND me.team = 'own' AND me.event_type = 'goal'), 0) AS goals,
         coalesce((SELECT count(*)::int FROM match_events me
           WHERE me.match_id = ams.match_id AND me.athlete_id = ams.athlete_id
             AND me.team = 'own' AND me.event_type = 'assist'), 0) AS assists,
         coalesce((SELECT count(*)::int FROM match_events me
           WHERE me.match_id = ams.match_id AND me.athlete_id = ams.athlete_id
             AND me.team = 'own' AND me.event_type = 'yellow_card'), 0) AS yellow_cards,
         coalesce((SELECT count(*)::int FROM match_events me
           WHERE me.match_id = ams.match_id AND me.athlete_id = ams.athlete_id
             AND me.team = 'own' AND me.event_type = 'red_card'), 0) AS red_cards
  FROM athletes a
  JOIN teams t ON a.team_id = t.id
  LEFT JOIN athlete_match_stats ams ON ams.athlete_id = a.id
  LEFT JOIN matches m ON ams.match_id = m.id
  LEFT JOIN events e ON m.event_id = e.id
  LEFT JOIN competitions c ON m.competition_id = c.id
  LEFT JOIN seasons s ON c.season_id = s.id
  WHERE a.id = ANY($1::uuid[])
  ORDER BY t.name, a.squad_number, a.last_name, a.first_name`;

/** Mirrors the first statement in `getPlayers`: the bounded page of ids. */
const playerPage = `
  SELECT a.id FROM athletes a
  JOIN teams t ON a.team_id = t.id
  WHERE a.archived_at IS NULL
  ORDER BY t.name, a.squad_number, a.last_name, a.first_name, a.id
  LIMIT $1 OFFSET 0`;

async function time(label, run) {
  const started = process.hrtime.bigint();
  const result = await run();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { label, ms: Number(ms.toFixed(1)), result };
}

const report = {};

const scale = await sql.query(`
  SELECT (SELECT count(*) FROM athletes WHERE archived_at IS NULL) AS athletes,
         (SELECT count(*) FROM athlete_match_stats) AS athlete_match_stats,
         (SELECT count(*) FROM match_events) AS match_events,
         (SELECT count(*) FROM matches) AS matches,
         (SELECT coalesce(max(per_athlete), 0) FROM (
            SELECT count(*) AS per_athlete FROM athlete_match_stats
            GROUP BY athlete_id) counts) AS worst_matches_per_athlete`);
report.scale = scale[0];

const page = await time('players: page of ids (cold)', () =>
  sql.query(playerPage, [LIMIT]),
);
const ids = page.result.map((row) => row.id);
report.pageSize = ids.length;

if (ids.length === 0) {
  console.error('No athletes in this database; seed data before benchmarking.');
  process.exit(1);
}

const fanOutCold = await time('players: fan-out (cold)', () =>
  sql.query(playerFanOut, [ids]),
);
const fanOutWarm = await time('players: fan-out (warm)', () =>
  sql.query(playerFanOut, [ids]),
);

report.fanOutRows = fanOutCold.result.length;
report.rowsPerPlayer = Number(
  (fanOutCold.result.length / Math.max(ids.length, 1)).toFixed(1),
);

const standings = await time('team-statistics', () =>
  sql.query(
    `SELECT st.* FROM standings st JOIN teams t ON st.team_id = t.id ORDER BY t.name`,
  ),
);

report.timings = [page, fanOutCold, fanOutWarm, standings].map(
  ({ label, ms }) => ({ label, ms }),
);

const plan = await sql.query(
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${playerFanOut}`,
  [ids],
);
report.plan = plan[0]['QUERY PLAN'];

// The whole point of the exercise: confirm the aggregation is index-driven.
const planText = JSON.stringify(report.plan);
report.indexesUsed = [
  'athlete_match_stats_athlete_id_index',
  'match_events_match_athlete_type_index',
  'match_events_match_id_index',
].filter((name) => planText.includes(name));
report.sequentialScansOn = [
  ...new Set(
    (planText.match(/"Node Type":"Seq Scan","[^}]*?"Relation Name":"(\w+)"/g) ??
      []).map((match) => /"Relation Name":"(\w+)"/.exec(match)[1]),
  ),
];

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nScale`);
  console.table(report.scale);
  console.log(
    `\nWorst-case page: ${report.pageSize} players -> ${report.fanOutRows} rows ` +
      `(${report.rowsPerPlayer} per player)`,
  );
  console.log(`\nTimings`);
  console.table(report.timings);
  console.log(`\nIndexes used: ${report.indexesUsed.join(', ') || 'none'}`);
  console.log(
    `Sequential scans on: ${report.sequentialScansOn.join(', ') || 'none'}`,
  );
  console.log(
    `\nFull plan: re-run with --json, or read report.plan above.\n` +
      `Note: with the SEC-008 cache in front, a repeated identical request ` +
      `costs none of the above for ${process.env.PUBLIC_DASHBOARD_CACHE_TTL_SECONDS ?? 30}s.`,
  );
}
