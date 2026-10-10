// Read-only benchmark and query-plan inspection for the anonymous public
// dashboard endpoints (SEC-008).
//
// Reports the first display-order player page and its grouped SQL totals,
// first/repeat wall-clock timings, standings timings and the player query plan.
// This samples one page; it does not establish the worst case or reset caches.
// Queries are separate read-only SELECT statements, not a shared transaction.
// Keep this SQL aligned with src/public-api/public-dashboard.service.ts.
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
const LIMIT = args.includes('--limit') ? limitArg : 200;
if (!Number.isInteger(LIMIT) || LIMIT < 1 || LIMIT > 200) {
  console.error('--limit must be an integer between 1 and 200.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

/** Mirrors the grouped, page-bounded statement in getPlayers. */
const playerTotals = `
  SELECT a.id, a.first_name, a.last_name, a.position, a.squad_number,
         t.id AS team_id, t.name AS team_name,
         coalesce(sum(CASE WHEN e.status = 'completed' AND (ams.started OR EXISTS (
           SELECT 1 FROM match_events me WHERE me.match_id = ams.match_id
             AND me.team = 'own' AND me.event_type = 'substitution'
             AND me.detail = ams.athlete_id::text
         )) THEN 1 ELSE 0 END), 0)::int AS appearances,
         coalesce(sum(CASE WHEN e.status = 'completed' THEN coalesce(ams.minutes_played, 0) ELSE 0 END), 0)::int AS minutes_played,
         coalesce(sum(CASE WHEN e.status = 'completed' THEN coalesce(et.goals, 0) ELSE 0 END), 0)::int AS goals,
         coalesce(sum(CASE WHEN e.status = 'completed' THEN coalesce(et.assists, 0) ELSE 0 END), 0)::int AS assists,
         coalesce(sum(CASE WHEN e.status = 'completed' THEN coalesce(et.yellow_cards, 0) ELSE 0 END), 0)::int AS yellow_cards,
         coalesce(sum(CASE WHEN e.status = 'completed' THEN coalesce(et.red_cards, 0) ELSE 0 END), 0)::int AS red_cards
  FROM athletes a JOIN teams t ON a.team_id = t.id
  LEFT JOIN athlete_match_stats ams ON ams.athlete_id = a.id
  LEFT JOIN matches m ON ams.match_id = m.id
  LEFT JOIN events e ON m.event_id = e.id
  LEFT JOIN competitions c ON m.competition_id = c.id
  LEFT JOIN seasons s ON c.season_id = s.id
  LEFT JOIN (
    SELECT match_id, athlete_id,
      count(*) FILTER (WHERE event_type = 'goal')::int AS goals,
      count(*) FILTER (WHERE event_type = 'assist')::int AS assists,
      count(*) FILTER (WHERE event_type = 'yellow_card')::int AS yellow_cards,
      count(*) FILTER (WHERE event_type = 'red_card')::int AS red_cards
    FROM match_events WHERE team = 'own' AND athlete_id = ANY($1::uuid[])
    GROUP BY match_id, athlete_id
  ) et ON et.match_id = ams.match_id AND et.athlete_id = a.id
  WHERE a.id = ANY($1::uuid[])
  GROUP BY a.id, t.id ORDER BY t.name, a.squad_number, a.last_name, a.first_name, a.id`;

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

const page = await time('players: page of ids (first run)', () =>
  sql.query(playerPage, [LIMIT]),
);
const ids = page.result.map((row) => row.id);
report.pageSize = ids.length;

if (ids.length === 0) {
  console.error('No athletes in this database; seed data before benchmarking.');
  process.exit(1);
}

const totalsFirst = await time('players: grouped totals (first run)', () =>
  sql.query(playerTotals, [ids]),
);
const totalsRepeat = await time('players: grouped totals (repeat)', () =>
  sql.query(playerTotals, [ids]),
);

report.returnedPlayerRows = totalsFirst.result.length;
report.rowsPerPlayer = Number(
  (totalsFirst.result.length / Math.max(ids.length, 1)).toFixed(1),
);

const standings = await time('team-statistics', () =>
  sql.query(
    `SELECT st.*, t.id AS owner_team_id, t.name AS owner_team_name, c.name AS competition_name, s.name AS season_name FROM standings st JOIN competitions c ON st.competition_id = c.id JOIN teams t ON c.team_id = t.id LEFT JOIN seasons s ON c.season_id = s.id ORDER BY c.name, st.position`,
  ),
);

report.timings = [page, totalsFirst, totalsRepeat, standings].map(
  ({ label, ms }) => ({ label, ms }),
);

const plan = await sql.query(
  `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${playerTotals}`,
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
    (
      planText.match(
        /"Node Type":"Seq Scan","[^}]*?"Relation Name":"(\w+)"/g,
      ) ?? []
    ).map((match) => /"Relation Name":"(\w+)"/.exec(match)[1]),
  ),
];

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`\nScale`);
  console.table(report.scale);
  console.log(
    `\nFirst display-order page: ${report.pageSize} players -> ${report.returnedPlayerRows} rows ` +
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
