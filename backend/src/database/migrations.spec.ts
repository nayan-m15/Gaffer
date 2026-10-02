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
        const eventId = '20000000-0000-4000-8000-000000000001';
        const matchId = '30000000-0000-4000-8000-000000000001';
        await pg.exec(`
          INSERT INTO teams (id, name) VALUES ('${teamId}', 'Legacy Test Team');
          INSERT INTO events (id, team_id, title, type, scheduled_at, location)
            VALUES ('${eventId}', '${teamId}', 'Legacy Fixture', 'match', now(), 'Ground');
          INSERT INTO matches (id, event_id, opponent_name, is_home)
            VALUES ('${matchId}', '${eventId}', 'Legacy Opponent', true);
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
