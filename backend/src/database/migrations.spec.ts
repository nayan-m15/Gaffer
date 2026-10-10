import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('repairs a branch history that skipped competition results and fixtures', async () => {
  const pg = new PGlite();
  const folder = resolve(__dirname, '../../drizzle');
  const journal = JSON.parse(
    readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: { tag: string }[] };
  try {
    for (const entry of journal.entries) {
      if (
        entry.tag === '0026_competition_match_results' ||
        entry.tag === '0027_competition_fixtures'
      ) {
        continue;
      }
      if (entry.tag === '0045_two_sided_match_sessions') {
        const teamId = '10000000-0000-4000-8000-000000000001';
        const awayTeamId = '10000000-0000-4000-8000-000000000002';
        const eventId = '20000000-0000-4000-8000-000000000001';
        const awayEventId = '20000000-0000-4000-8000-000000000002';
        const matchId = '30000000-0000-4000-8000-000000000001';
        const awayMatchId = '30000000-0000-4000-8000-000000000002';
        await pg.exec(`
          INSERT INTO teams (id, name) VALUES ('${teamId}', 'Legacy Test Team');
          INSERT INTO teams (id, name) VALUES ('${awayTeamId}', 'Legacy Away Team');
          INSERT INTO events (id, team_id, title, type, scheduled_at, location)
            VALUES ('${eventId}', '${teamId}', 'Legacy Fixture', 'match', now(), 'Ground');
          INSERT INTO events (id, team_id, title, type, scheduled_at, location)
            VALUES ('${awayEventId}', '${awayTeamId}', 'Legacy Away Fixture', 'match', now(), 'Ground');
          INSERT INTO matches (id, event_id, opponent_name, is_home)
            VALUES ('${matchId}', '${eventId}', 'Legacy Opponent', true);
          INSERT INTO matches (id, event_id, opponent_name, is_home)
            VALUES ('${awayMatchId}', '${awayEventId}', 'Legacy Opponent', false);
        `);
      }
      if (entry.tag === '0046_match_session_event_identity') {
        await pg.exec(`
          INSERT INTO "user" (id, name, email)
            VALUES ('legacy-test-user', 'Legacy User', 'legacy@example.test');
          INSERT INTO match_events (id, match_id, team, event_type, minute, logged_by_user_id)
            VALUES
              ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'own', 'goal', 5, 'legacy-test-user'),
              ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'opponent', 'goal', 8, 'legacy-test-user');
          INSERT INTO match_event_observations
            (id, match_id, device_id, logged_by_user_id, event_type, team, period,
             match_elapsed_ms, payload, payload_hash, client_created_at)
            VALUES
              ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'legacy-test-user', 'goal', 'own', 'first_half', 300000, '{}', 'home-hash', now()),
              ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002', 'legacy-test-user', 'goal', 'opponent', 'first_half', 480000, '{}', 'away-hash', now());
          INSERT INTO match_event_reviews (id, match_id, canonical_event_id, reason)
            VALUES ('70000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'legacy review');
          INSERT INTO match_event_operations (id, match_id, actor_user_id, operation_type, decision)
            VALUES ('80000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'legacy-test-user', 'correct', '{}');
          INSERT INTO match_clock_operations
            (id, match_id, actor_user_id, period, elapsed_ms, running, base_revision,
             applied_revision, outcome, payload_hash, client_created_at)
            VALUES ('90000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'legacy-test-user', 'first_half', 0, false, 0, 1, 'applied', 'clock-hash', now());
          INSERT INTO match_projection_state (match_id, input_digest)
            VALUES ('30000000-0000-4000-8000-000000000001', 'legacy-digest');
        `);
      }
      await pg.exec(readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf8'));
    }
    const migrated = await pg.query<{
      id: string;
      shared_match_id: string;
      participant_count: number;
    }>(`SELECT m.id, m.shared_match_id,
               (SELECT count(*)::int FROM match_session_participants p
                WHERE p.session_id = m.shared_match_id) AS participant_count
        FROM matches m
        WHERE m.id = '30000000-0000-4000-8000-000000000001'`);
    expect(migrated.rows).toEqual([
      expect.objectContaining({
        id: '30000000-0000-4000-8000-000000000001',
        participant_count: 1,
      }),
    ]);
    expect(migrated.rows[0].shared_match_id).toEqual(expect.any(String));
    const normalized = await pg.query<{
      event_side: string;
      observation_side: string;
      event_session_id: string;
      observation_session_id: string;
      review_session_id: string;
      operation_session_id: string;
      clock_session_id: string;
      projection_session_id: string;
    }>(`SELECT event.side AS event_side,
               observation.side AS observation_side,
               event.session_id AS event_session_id,
               observation.session_id AS observation_session_id,
               review.session_id AS review_session_id,
               operation.session_id AS operation_session_id,
               clock.session_id AS clock_session_id,
               projection.session_id AS projection_session_id
        FROM match_events event
        JOIN match_event_observations observation
          ON observation.match_id = event.match_id
        JOIN match_event_reviews review ON review.match_id = event.match_id
        JOIN match_event_operations operation ON operation.match_id = event.match_id
        JOIN match_clock_operations clock ON clock.match_id = event.match_id
        JOIN match_projection_state projection ON projection.match_id = event.match_id
        WHERE event.id = '40000000-0000-4000-8000-000000000001'`);
    expect(normalized.rows).toHaveLength(1);
    const identity = normalized.rows[0];
    expect(identity.event_side).toBe('home');
    expect(identity.observation_side).toBe('home');
    expect(identity.event_session_id).toBe(identity.observation_session_id);
    expect(identity.review_session_id).toBe(identity.event_session_id);
    expect(identity.operation_session_id).toBe(identity.event_session_id);
    expect(identity.clock_session_id).toBe(identity.event_session_id);
    expect(identity.projection_session_id).toBe(identity.event_session_id);
    const awaySide = await pg.query<{
      event_side: string;
      observation_side: string;
    }>(
      `SELECT event.side AS event_side, observation.side AS observation_side
       FROM match_events event
       JOIN match_event_observations observation ON observation.match_id = event.match_id
       WHERE event.id = '40000000-0000-4000-8000-000000000002'`,
    );
    expect(awaySide.rows).toEqual([
      { event_side: 'home', observation_side: 'home' },
    ]);
    const { rows } = await pg.query<{ name: string }>(
      `SELECT tablename AS name FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename IN ('competition_matches', 'competition_fixtures', 'injuries')
       ORDER BY tablename`,
    );
    expect(rows.map((row) => row.name)).toEqual([
      'competition_fixtures',
      'competition_matches',
      'injuries',
    ]);
    // A database already migrated on the injury branch must accept the merge.
    await pg.exec(
      readFileSync(resolve(folder, '0035_injuries_and_recovery.sql'), 'utf8'),
    );
  } finally {
    await pg.close();
  }
}, 60000);
