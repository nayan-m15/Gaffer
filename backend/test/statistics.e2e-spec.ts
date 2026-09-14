import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

type Agent = ReturnType<typeof request.agent>;

interface SeasonBody {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  matchCount: number;
}

interface TrendEntry {
  opponent: string;
  result: 'W' | 'D' | 'L';
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

interface OverviewBody {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  cleanSheets: number;
  points: number;
  trends: TrendEntry[];
  players: Array<{
    athleteId: string;
    name: string;
    goals: number;
    assists: number;
  }>;
  season: { id: string; name: string } | null;
  rollingWindow: number;
  form: {
    rolling: Array<{
      index: number;
      windowSize: number;
      pointsPerGame: number;
    }>;
    cumulative: Array<{ index: number; cumulativePoints: number }>;
  };
  periods: {
    mode: 'halves' | 'monthly';
    splits: Array<{
      key: string;
      matchesPlayed: number;
      pointsPerGame: number;
    }>;
    deltas: Array<{ metric: string; delta: number; direction: string }>;
  };
}

interface ComparisonBody {
  season: { id: string } | null;
  athletes: Array<{
    athleteId: string;
    name: string;
    appearances: number;
    starts: number;
    goals: number;
    assists: number;
    goalContributions: number;
    matchesWithMinutes: number;
    perAppearance: { goals: number; assists: number };
    per90: { goals: number } | null;
  }>;
}

/** An ISO 8601 datetime `days` in the past, at midday UTC. */
function pastIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

/** The calendar date `days` in the past, as `YYYY-MM-DD`. */
function pastDate(days: number): string {
  return pastIso(days).slice(0, 10);
}

describe('Statistics and seasons (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await Promise.all(identities.map(cleanupUser));
    await app.close();
  });

  async function newCoach() {
    const identity = uniqueTestIdentity('s1-06-statistics');
    identities.push(identity);
    return registerCoach(app.getHttpServer(), identity);
  }

  /** Creates the 11 athletes a starting XI needs, returning their ids. */
  async function createSquad(agent: Agent): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await agent
        .post('/athletes')
        .send({ firstName: `Player${i}`, lastName: `Test${i}` })
        .expect(201);
      ids.push((response.body as { id: string }).id);
    }
    return ids;
  }

  /**
   * Drives a match through the real flow — schedule, start, log goals, finish.
   * Scores are never set directly; they are derived from the logged goal events,
   * which is exactly how the live logger produces them.
   */
  async function seedCompletedMatch(
    agent: Agent,
    squad: string[],
    options: {
      daysAgo: number;
      opponent: string;
      ownGoals: number;
      opponentGoals: number;
      scorerId?: string;
      assistId?: string;
    },
  ): Promise<string> {
    const event = await agent
      .post('/events')
      .send({
        title: `vs ${options.opponent}`,
        type: 'match',
        scheduledAt: pastIso(options.daysAgo),
        location: 'Main field',
      })
      .expect(201);
    const eventId = (event.body as { id: string }).id;

    const started = await agent
      .post(`/events/${eventId}/start-match`)
      .send({
        opponentName: options.opponent,
        isHome: true,
        startingAthleteIds: squad,
      })
      .expect(201);
    const matchId = (started.body as { id: string }).id;

    for (let i = 0; i < options.ownGoals; i += 1) {
      await agent
        .post(`/matches/${matchId}/events`)
        .send({
          clientRequestId: crypto.randomUUID(),
          team: 'own',
          eventType: 'goal',
          athleteId: options.scorerId ?? squad[0],
          minute: 10 + i,
        })
        .expect(201);

      if (options.assistId) {
        await agent
          .post(`/matches/${matchId}/events`)
          .send({
            clientRequestId: crypto.randomUUID(),
            team: 'own',
            eventType: 'assist',
            athleteId: options.assistId,
            minute: 10 + i,
          })
          .expect(201);
      }
    }

    for (let i = 0; i < options.opponentGoals; i += 1) {
      await agent
        .post(`/matches/${matchId}/events`)
        .send({
          clientRequestId: crypto.randomUUID(),
          team: 'opponent',
          eventType: 'goal',
          opponentLabel: 'Their striker',
          minute: 20 + i,
        })
        .expect(201);
    }

    await agent.post(`/matches/${matchId}/finish`).expect(201);
    return matchId;
  }

  describe('authentication', () => {
    it('requires authentication for statistics', async () => {
      await request(app.getHttpServer()).get('/statistics').expect(401);
    });

    it('requires authentication for seasons', async () => {
      await request(app.getHttpServer()).get('/seasons').expect(401);
    });
  });

  describe('season CRUD', () => {
    it('starts with no seasons and creates one', async () => {
      const { agent } = await newCoach();

      expect((await agent.get('/seasons').expect(200)).body).toEqual([]);

      const created = await agent
        .post('/seasons')
        .send({
          name: '2025/26',
          startDate: pastDate(60),
          endDate: pastDate(5),
          isCurrent: true,
        })
        .expect(201);

      expect(created.body).toMatchObject({
        name: '2025/26',
        startDate: pastDate(60),
        endDate: pastDate(5),
        isCurrent: true,
      });

      const list = (await agent.get('/seasons').expect(200))
        .body as SeasonBody[];
      expect(list).toHaveLength(1);
      expect(list[0].matchCount).toBe(0);
    });

    it('rejects an end date before the start date', async () => {
      const { agent } = await newCoach();

      await agent
        .post('/seasons')
        .send({
          name: 'Backwards',
          startDate: pastDate(5),
          endDate: pastDate(60),
        })
        .expect(400);
    });

    it('rejects an overlapping season', async () => {
      const { agent } = await newCoach();

      await agent
        .post('/seasons')
        .send({ name: 'First', startDate: pastDate(60), endDate: pastDate(30) })
        .expect(201);

      await agent
        .post('/seasons')
        .send({
          name: 'Overlapping',
          startDate: pastDate(40),
          endDate: pastDate(10),
        })
        .expect(409);

      // A range starting the day after the first ends is fine.
      await agent
        .post('/seasons')
        .send({
          name: 'Adjacent',
          startDate: pastDate(29),
          endDate: pastDate(10),
        })
        .expect(201);
    });

    it('demotes the previous current season when a new one is promoted', async () => {
      const { agent } = await newCoach();

      await agent
        .post('/seasons')
        .send({
          name: 'Older',
          startDate: pastDate(200),
          endDate: pastDate(100),
          isCurrent: true,
        })
        .expect(201);

      await agent
        .post('/seasons')
        .send({
          name: 'Newer',
          startDate: pastDate(60),
          endDate: pastDate(5),
          isCurrent: true,
        })
        .expect(201);

      const list = (await agent.get('/seasons').expect(200))
        .body as SeasonBody[];

      expect(list.filter((s) => s.isCurrent)).toHaveLength(1);
      expect(list.find((s) => s.isCurrent)?.name).toBe('Newer');
    });

    it('renames and deletes a season', async () => {
      const { agent } = await newCoach();

      const created = await agent
        .post('/seasons')
        .send({
          name: 'Temporary',
          startDate: pastDate(60),
          endDate: pastDate(5),
        })
        .expect(201);
      const seasonId = (created.body as SeasonBody).id;

      await agent
        .patch(`/seasons/${seasonId}`)
        .send({ name: 'Renamed' })
        .expect(200);

      await agent.delete(`/seasons/${seasonId}`).expect(200);
      expect((await agent.get('/seasons').expect(200)).body).toEqual([]);
    });
  });

  describe('aggregation across multiple matches', () => {
    let agent: Agent;
    let squad: string[];
    let seasonId: string;
    let strikerId: string;
    let playmakerId: string;

    beforeAll(async () => {
      ({ agent } = await newCoach());
      squad = await createSquad(agent);
      strikerId = squad[0];
      playmakerId = squad[1];

      const season = await agent
        .post('/seasons')
        .send({
          name: 'Test Season',
          startDate: pastDate(60),
          endDate: pastDate(5),
          isCurrent: true,
        })
        .expect(201);
      seasonId = (season.body as SeasonBody).id;

      // Five in-season matches: W 3-1, L 0-2, D 1-1, W 2-0, W 4-1.
      // Totals: 5 played, 3W/1D/1L, 10 pts, 10 GF, 5 GA, 1 clean sheet.
      // Form improves across the season: 4 pts in the first 3, 6 in the last 2.
      await seedCompletedMatch(agent, squad, {
        daysAgo: 50,
        opponent: 'Rivals FC',
        ownGoals: 3,
        opponentGoals: 1,
        scorerId: strikerId,
        assistId: playmakerId,
      });
      await seedCompletedMatch(agent, squad, {
        daysAgo: 40,
        opponent: 'City AFC',
        ownGoals: 0,
        opponentGoals: 2,
      });
      await seedCompletedMatch(agent, squad, {
        daysAgo: 30,
        opponent: 'United',
        ownGoals: 1,
        opponentGoals: 1,
        scorerId: strikerId,
      });
      await seedCompletedMatch(agent, squad, {
        daysAgo: 20,
        opponent: 'Albion',
        ownGoals: 2,
        opponentGoals: 0,
        scorerId: strikerId,
        assistId: playmakerId,
      });
      await seedCompletedMatch(agent, squad, {
        daysAgo: 10,
        opponent: 'Rovers',
        ownGoals: 4,
        opponentGoals: 1,
        scorerId: strikerId,
      });

      // One match outside the season range — must never appear in season stats.
      await seedCompletedMatch(agent, squad, {
        daysAgo: 200,
        opponent: 'Ancient FC',
        ownGoals: 7,
        opponentGoals: 0,
        scorerId: strikerId,
      });
    }, 120_000);

    it('aggregates only the matches inside the season', async () => {
      const overview = (
        await agent.get(`/statistics?seasonId=${seasonId}`).expect(200)
      ).body as OverviewBody;

      expect(overview.matchesPlayed).toBe(5);
      expect(overview.wins).toBe(3);
      expect(overview.draws).toBe(1);
      expect(overview.losses).toBe(1);
      expect(overview.points).toBe(10);
      expect(overview.goalsFor).toBe(10);
      expect(overview.goalsAgainst).toBe(5);
      expect(overview.goalDifference).toBe(5);
      expect(overview.cleanSheets).toBe(1);
      expect(overview.season?.id).toBe(seasonId);
      expect(overview.trends.map((t) => t.opponent)).not.toContain(
        'Ancient FC',
      );
    });

    it('covers every match when no season is given', async () => {
      const overview = (await agent.get('/statistics').expect(200))
        .body as OverviewBody;

      expect(overview.matchesPlayed).toBe(6);
      expect(overview.goalsFor).toBe(17);
      expect(overview.season).toBeNull();
      expect(overview.trends.map((t) => t.opponent)).toContain('Ancient FC');
    });

    it('orders trend entries chronologically with the right results', async () => {
      const overview = (
        await agent.get(`/statistics?seasonId=${seasonId}`).expect(200)
      ).body as OverviewBody;

      expect(overview.trends.map((t) => t.opponent)).toEqual([
        'Rivals FC',
        'City AFC',
        'United',
        'Albion',
        'Rovers',
      ]);
      expect(overview.trends.map((t) => t.result)).toEqual([
        'W',
        'L',
        'D',
        'W',
        'W',
      ]);
      expect(overview.trends.map((t) => t.points)).toEqual([3, 0, 1, 3, 3]);
    });

    it('reports rolling form with a trailing window', async () => {
      const overview = (
        await agent.get(`/statistics?seasonId=${seasonId}`).expect(200)
      ).body as OverviewBody;

      expect(overview.rollingWindow).toBe(5);
      expect(overview.form.rolling).toHaveLength(5);

      // Partial windows early, then the full five-match window at match 5:
      // points 3, 0, 1, 3, 3 -> averages 3, 1.5, 1.33, 1.75, 2.
      expect(overview.form.rolling.map((r) => r.windowSize)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      expect(overview.form.rolling.map((r) => r.pointsPerGame)).toEqual([
        3, 1.5, 1.33, 1.75, 2,
      ]);
    });

    it('reports a cumulative points line ending at the season total', async () => {
      const overview = (
        await agent.get(`/statistics?seasonId=${seasonId}`).expect(200)
      ).body as OverviewBody;

      expect(overview.form.cumulative.map((c) => c.cumulativePoints)).toEqual([
        3, 3, 4, 7, 10,
      ]);
    });

    it('splits the season into periods and reports an improving trend', async () => {
      const overview = (
        await agent.get(`/statistics?seasonId=${seasonId}`).expect(200)
      ).body as OverviewBody;

      expect(overview.periods.splits.length).toBeGreaterThanOrEqual(2);

      const ppg = overview.periods.deltas.find(
        (d) => d.metric === 'pointsPerGame',
      );
      expect(ppg).toBeDefined();
      // The team improved over the season, so points per match must be up.
      expect(ppg!.delta).toBeGreaterThan(0);
      expect(ppg!.direction).toBe('improving');
    });

    it('attributes goals and assists to the right players', async () => {
      const overview = (
        await agent.get(`/statistics?seasonId=${seasonId}`).expect(200)
      ).body as OverviewBody;

      const striker = overview.players.find((p) => p.athleteId === strikerId);
      const playmaker = overview.players.find(
        (p) => p.athleteId === playmakerId,
      );

      // In-season goals by the striker: 3 + 1 + 2 + 4 = 10 (the 7 from the
      // out-of-range match are excluded).
      expect(striker?.goals).toBe(10);
      // Assists accompany the 3-1 and 2-0 wins only: 3 + 2 = 5.
      expect(playmaker?.assists).toBe(5);
    });

    it('counts matches per season in the seasons list', async () => {
      const list = (await agent.get('/seasons').expect(200))
        .body as SeasonBody[];
      const season = list.find((s) => s.id === seasonId);

      expect(season?.matchCount).toBe(5);
    });

    describe('athlete comparison', () => {
      it('compares two athletes over the season', async () => {
        const comparison = (
          await agent
            .get(
              `/statistics/compare?athleteIds=${strikerId},${playmakerId}&seasonId=${seasonId}`,
            )
            .expect(200)
        ).body as ComparisonBody;

        expect(comparison.season?.id).toBe(seasonId);
        expect(comparison.athletes).toHaveLength(2);

        const [striker, playmaker] = comparison.athletes;
        expect(striker.athleteId).toBe(strikerId);
        expect(striker.goals).toBe(10);
        expect(striker.appearances).toBe(5);
        expect(striker.starts).toBe(5);
        expect(striker.perAppearance.goals).toBe(2);

        expect(playmaker.athleteId).toBe(playmakerId);
        expect(playmaker.assists).toBe(5);
        expect(playmaker.goalContributions).toBe(5);
      });

      it('returns a null per-90 because minutes are never recorded', async () => {
        const comparison = (
          await agent
            .get(`/statistics/compare?athleteIds=${strikerId},${playmakerId}`)
            .expect(200)
        ).body as ComparisonBody;

        for (const athlete of comparison.athletes) {
          expect(athlete.matchesWithMinutes).toBe(0);
          expect(athlete.per90).toBeNull();
        }
      });

      it('rejects fewer than two athletes', async () => {
        await agent
          .get(`/statistics/compare?athleteIds=${strikerId}`)
          .expect(400);
      });

      it('rejects more than three athletes', async () => {
        await agent
          .get(
            `/statistics/compare?athleteIds=${squad[0]},${squad[1]},${squad[2]},${squad[3]}`,
          )
          .expect(400);
      });

      it('rejects duplicate athletes', async () => {
        await agent
          .get(`/statistics/compare?athleteIds=${strikerId},${strikerId}`)
          .expect(400);
      });
    });
  });

  describe('team isolation', () => {
    it("404s when requesting another team's season", async () => {
      const teamA = await newCoach();
      const teamB = await newCoach();

      const season = await teamA.agent
        .post('/seasons')
        .send({
          name: 'Private',
          startDate: pastDate(60),
          endDate: pastDate(5),
        })
        .expect(201);
      const seasonId = (season.body as SeasonBody).id;

      await teamB.agent.get(`/statistics?seasonId=${seasonId}`).expect(404);
      await teamB.agent
        .patch(`/seasons/${seasonId}`)
        .send({ name: 'Hijack' })
        .expect(404);
      await teamB.agent.delete(`/seasons/${seasonId}`).expect(404);
    });

    it("404s when comparing another team's athletes", async () => {
      const teamA = await newCoach();
      const teamB = await newCoach();

      const squadA = await createSquad(teamA.agent);

      await teamB.agent
        .get(`/statistics/compare?athleteIds=${squadA[0]},${squadA[1]}`)
        .expect(404);
    });
  });
});

describe('Statistics integrity (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await Promise.all(identities.map(cleanupUser));
    await app.close();
  });

  it('validates a standing PATCH against the complete stored row', async () => {
    const identity = uniqueTestIdentity('statistics-integrity');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);

    const competition = await agent
      .post('/statistics/competitions')
      .send({ name: 'Premier League', type: 'league' })
      .expect(201);
    const competitionId = (competition.body as { id: string }).id;
    const standing = await agent
      .post(`/statistics/competitions/${competitionId}/standings`)
      .send({
        teamName: 'Sporting FC',
        position: 1,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goalsFor: 2,
        goalsAgainst: 0,
        points: 3,
        isOwnTeam: true,
      })
      .expect(201);
    const standingId = (standing.body as { id: string }).id;

    await agent
      .patch(`/statistics/standings/${standingId}`)
      .send({ won: 0 })
      .expect(400);

    const valid = await agent
      .patch(`/statistics/standings/${standingId}`)
      .send({ played: 2, won: 1, drawn: 1, points: 4 })
      .expect(200);
    expect(valid.body).toMatchObject({
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      points: 4,
    });
  });
});
