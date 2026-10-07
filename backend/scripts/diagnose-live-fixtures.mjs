// Read-only inspection of recent paired fixtures and the installed clock function.
import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
const sql = neon(process.env.DATABASE_URL);
const [, clock, sheets] = await sql.transaction((tx) => [
  tx.query('SET TRANSACTION READ ONLY'),
  tx.query(`SELECT position('shared_match_id = v_session_id' in prosrc) > 0 AS shared_clock_installed
    FROM pg_proc WHERE proname = 'apply_match_clock_operation'`),
  tx.query(`SELECT t.name AS team, e.title, e.created_at, e.status, m.id AS match_id,
    m.is_home, m.shared_match_id, p.side AS participant_side,
    coalesce(f.shared_session_id, c.shared_session_id) AS fixture_session,
    m.clock_period, m.clock_revision, m.clock_elapsed_ms,
    l.formation_id, jsonb_array_length(to_jsonb(l.starting_athlete_ids)) AS starters,
    (SELECT count(*) FROM jsonb_each_text(coalesce(l.pitch_assignments, '{}'::jsonb)) WHERE value IS NOT NULL) AS assigned_slots,
    (SELECT count(*) FROM match_events me WHERE me.match_id=m.id AND me.event_type='goal' AND me.lifecycle_status<>'voided') AS own_sheet_goals,
    (SELECT count(*) FROM match_events me WHERE me.session_id=m.shared_match_id AND me.event_type='goal' AND me.lifecycle_status<>'voided') AS session_goals
    FROM events e JOIN teams t ON t.id=e.team_id
    LEFT JOIN matches m ON m.event_id=e.id
    LEFT JOIN friendly_fixtures f ON f.id=e.friendly_fixture_id
    LEFT JOIN competition_fixtures c ON c.id=e.competition_fixture_id
    LEFT JOIN match_session_participants p ON p.session_id=m.shared_match_id AND p.team_id=e.team_id
    LEFT JOIN event_lineups l ON l.event_id=e.id
    WHERE e.created_at > now() - interval '2 days'
      AND (e.friendly_fixture_id IS NOT NULL OR e.competition_fixture_id IS NOT NULL)
    ORDER BY e.created_at DESC LIMIT 30`),
]);
console.log(JSON.stringify({ clock, sheets }, null, 2));
