import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import { DatabaseService } from '../database/database.service';
import * as schema from '../database/schema';
import { PublicDashboardService } from './public-dashboard.service';

const statements: { text: string; params: unknown[] }[] = [];

function testDatabase(pg: PGlite) {
  const query = (
    text: string,
    params: unknown[],
    options: { arrayMode?: boolean },
  ) => {
    statements.push({ text, params });
    const run = (db: PGlite | Transaction) =>
      db.query(text, params, {
        rowMode: options.arrayMode ? 'array' : 'object',
        parsers: { 1184: (value: string) => value },
      });
    return {
      run,
      then: (
        yes: (value: unknown) => unknown,
        no: (error: unknown) => unknown,
      ) => run(pg).then(yes, no),
    };
  };
  const client = {
    query,
    transaction: (queries: ReturnType<typeof query>[]) =>
      pg.transaction(async (tx) => {
        const results: unknown[] = [];
        for (const statement of queries) results.push(await statement.run(tx));
        return results;
      }),
  };
  return drizzle(client as unknown as NeonQueryFunction<false, false>, {
    schema,
  });
}

const id = (n: number) =>
  '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

describe('Public dashboard grouped queries (PostgreSQL)', () => {
  let pg: PGlite;
  let service: PublicDashboardService;
  beforeAll(async () => {
    pg = new PGlite();
    service = new PublicDashboardService({
      database: testDatabase(pg),
    } as unknown as DatabaseService);
    await pg.exec(`
CREATE TABLE teams (id uuid primary key, name text);
CREATE TABLE athletes (id uuid primary key, first_name text, last_name text, position text, squad_number int, team_id uuid, archived_at timestamp);
CREATE TABLE seasons (id uuid primary key, name text);
CREATE TABLE competitions (id uuid primary key, name text, type text, team_id uuid, season_id uuid);
CREATE TABLE events (id uuid primary key, team_id uuid, type text, status text, title text, scheduled_at timestamp, location text);
CREATE TABLE matches (id uuid primary key, event_id uuid, competition_id uuid, opponent_name text, is_home boolean);
CREATE TABLE athlete_match_stats (id uuid primary key, athlete_id uuid, match_id uuid, started boolean, minutes_played int);
CREATE TABLE match_events (id uuid primary key, match_id uuid, athlete_id uuid, team text, event_type text, detail text);
INSERT INTO teams VALUES ('00000000-0000-4000-8000-000000000001', 'Test FC');
INSERT INTO seasons VALUES ('00000000-0000-4000-8000-000000000004', '2026');
INSERT INTO competitions VALUES ('00000000-0000-4000-8000-000000000003', 'League', 'league', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004');
INSERT INTO athletes VALUES ('00000000-0000-4000-8000-000000000010','Alpha','Forward','ST',1,'00000000-0000-4000-8000-000000000001',null), ('00000000-0000-4000-8000-000000000011','Beta','Keeper','GK',2,'00000000-0000-4000-8000-000000000001',null), ('00000000-0000-4000-8000-000000000012','Zero','Stats',null,3,'00000000-0000-4000-8000-000000000001',null), ('00000000-0000-4000-8000-000000000013','Archived','Player','ST',4,'00000000-0000-4000-8000-000000000001',now());
INSERT INTO events VALUES ('00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000001','match','completed','One',now(),'Field'), ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','match','scheduled','Two',now(),'Field'), ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','match','completed','Three',now(),'Field');
INSERT INTO matches VALUES ('00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000020','00000000-0000-4000-8000-000000000003','Opponent',true), ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000003','Opponent',true), ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000022',null,'Opponent',true);
INSERT INTO athlete_match_stats VALUES ('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000030',false,20), ('00000000-0000-4000-8000-000000000041','00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000030',true,90), ('00000000-0000-4000-8000-000000000042','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000031',true,90);
INSERT INTO match_events VALUES ('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000030',null,'own','substitution','00000000-0000-4000-8000-000000000010'), ('00000000-0000-4000-8000-000000000051','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','own','goal',null), ('00000000-0000-4000-8000-000000000052','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','own','goal',null), ('00000000-0000-4000-8000-000000000053','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','own','assist',null), ('00000000-0000-4000-8000-000000000054','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','own','yellow_card',null), ('00000000-0000-4000-8000-000000000055','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','opponent','red_card',null), ('00000000-0000-4000-8000-000000000056','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000010','own','goal',null), ('00000000-0000-4000-8000-000000000057','00000000-0000-4000-8000-000000000032',null,'opponent','goal',null);
`);
    // Production retains legacy totals alongside the canonical event totals.
    // Include them to catch ambiguous, unqualified aggregate references.
    await pg.exec(`
      ALTER TABLE athlete_match_stats ADD COLUMN goals int DEFAULT 99;
      ALTER TABLE athlete_match_stats ADD COLUMN assists int DEFAULT 99;
      ALTER TABLE athlete_match_stats ADD COLUMN yellow_cards int DEFAULT 99;
      ALTER TABLE athlete_match_stats ADD COLUMN red_cards int DEFAULT 99;
    `);
  });
  afterAll(async () => {
    await pg.close();
  });

  it('counts completed own-team events once and preserves substitution appearances, zero stats and page order', async () => {
    const players = await service.getPlayers({ limit: 10, offset: 0 });
    expect(players.map((p) => p.id)).toEqual([id(10), id(11), id(12)]);
    expect(players[0].statistics).toEqual({
      appearances: 1,
      minutesPlayed: 20,
      goals: 2,
      assists: 1,
      yellowCards: 1,
      redCards: 0,
    });
    expect(players[1].statistics).toEqual({
      appearances: 1,
      minutesPlayed: 90,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
    });
    expect(players[2].statistics).toEqual({
      appearances: 0,
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
    });
    expect((await service.getPlayers({ limit: 1, offset: 1 }))[0].id).toBe(
      id(11),
    );
    expect(await service.getPlayers({ limit: 1, offset: 3 })).toEqual([]);
  });

  it('applies name, position, team, competition and season filters before pagination', async () => {
    expect(
      (
        await service.getPlayers({
          limit: 1,
          offset: 0,
          search: 'BETA',
          position: 'GK',
        })
      )[0].id,
    ).toBe(id(11));
    expect(
      await service.getPlayers({ limit: 10, offset: 0, search: '%' }),
    ).toEqual([]);
    expect(
      await service.getPlayers({ limit: 10, offset: 0, position: 'DEF' }),
    ).toEqual([]);
    expect(
      await service.getPlayers({ limit: 10, offset: 0, teamId: id(2) }),
    ).toEqual([]);
    const filtered = await service.getPlayers({
      limit: 10,
      offset: 0,
      competitionId: id(3),
      seasonId: id(4),
    });
    expect(filtered).toHaveLength(2);
    expect(filtered[0].statistics.goals).toBe(2);
  });

  it('returns full match totals and clean sheets independently of page size, with the same status and season filters', async () => {
    expect(await service.getMatchSummary({})).toEqual({
      total: 3,
      cleanSheets: 1,
    });
    expect(await service.getMatchSummary({ status: 'scheduled' })).toEqual({
      total: 1,
      cleanSheets: 0,
    });
    expect(await service.getMatchSummary({ seasonId: id(4) })).toEqual({
      total: 2,
      cleanSheets: 1,
    });
    expect(await service.getMatchSummary({ teamId: id(2) })).toEqual({
      total: 0,
      cleanSheets: 0,
    });
    expect(await service.getMatches({ limit: 1, offset: 0 })).toHaveLength(1);
  });
  it('executes the benchmark player and standings SQL against the current schema', async () => {
    const source = readFileSync(
      resolve(__dirname, '../../scripts/benchmark-public-dashboard.mjs'),
      'utf8',
    );
    const playerSql = source.match(
      /const playerTotals = \x60([\s\S]*?)\x60;/,
    )![1];
    const standingsSql = source.match(/\x60(SELECT st\.\*[\s\S]*?)\x60/)![1];
    await pg.exec(
      'CREATE TABLE standings (id uuid primary key, competition_id uuid, position int)',
    );
    const players = await pg.query<{ goals: number }>(playerSql, [
      [id(10), id(11), id(12)],
    ]);
    expect(players.rows).toHaveLength(3);
    expect(players.rows[0].goals).toBe(2);
    await expect(pg.query(standingsSql)).resolves.toMatchObject({ rows: [] });
  });

  it('returns only one row per player for 16,000 history rows and executes an aggregate query plan', async () => {
    await pg.exec('BEGIN');
    try {
      await pg.exec(`
        INSERT INTO athletes SELECT md5('scale-player-' || n)::uuid, 'Scale', n::text, 'ST', n, '00000000-0000-4000-8000-000000000001', null FROM generate_series(1,200) n;
        INSERT INTO events SELECT md5('scale-event-' || n)::uuid, '00000000-0000-4000-8000-000000000001', 'match', 'completed', 'Scale', now(), 'Field' FROM generate_series(1,80) n;
        INSERT INTO matches SELECT md5('scale-match-' || n)::uuid, md5('scale-event-' || n)::uuid, null, 'Rival', true FROM generate_series(1,80) n;
        INSERT INTO athlete_match_stats SELECT md5('scale-stat-' || p || '-' || m)::uuid, md5('scale-player-' || p)::uuid, md5('scale-match-' || m)::uuid, true, 90 FROM generate_series(1,200) p CROSS JOIN generate_series(1,80) m;
        INSERT INTO match_events SELECT md5('scale-goal-' || p || '-' || m)::uuid, md5('scale-match-' || m)::uuid, md5('scale-player-' || p)::uuid, 'own', 'goal', null FROM generate_series(1,200) p CROSS JOIN generate_series(1,80) m;
        CREATE INDEX athlete_match_stats_athlete_id_index ON athlete_match_stats(athlete_id);
        CREATE INDEX match_events_match_athlete_type_index ON match_events(match_id, athlete_id, event_type);
        ANALYZE;
`);
      const started = performance.now();
      const players = await service.getPlayers({
        limit: 200,
        offset: 0,
        search: 'Scale',
      });
      const elapsedMs = performance.now() - started;
      expect(players).toHaveLength(200);
      expect(
        players.every(
          (player) =>
            player.statistics.appearances === 80 &&
            player.statistics.goals === 80 &&
            player.statistics.minutesPlayed === 7200,
        ),
      ).toBe(true);
      const statement = statements.at(-1)!;
      const plan = await pg.query(
        'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + statement.text,
        statement.params,
      );
      expect(JSON.stringify(plan.rows)).toContain('Aggregate');
      console.log(
        'Isolated scale sample: 200 players, 80 matches each, 16000 history rows; returned 200 player totals in ' +
          elapsedMs.toFixed(1) +
          ' ms (PGlite, not deployment latency).',
      );
    } finally {
      await pg.exec('ROLLBACK');
    }
  });
});
