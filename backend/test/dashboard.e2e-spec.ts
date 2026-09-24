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

interface DashboardBody {
  activeAthletesCount: number;
  totalEventsCount: number;
  upcomingEvents: Array<{ id: string; title: string }>;
  recentForm: Array<{ result: 'W' | 'D' | 'L' }>;
  seasonSummary: {
    played: number;
    won: number;
    drawn: number;
    lost: number;
    goalsFor: number;
    goalsAgainst: number;
  } | null;
  recentStats: Array<{ label: string; value: number }>;
}

/** An ISO 8601 datetime with a UTC offset, `hoursFromNow` in the future. */
function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

/** An ISO 8601 datetime `daysAgo` in the past, at midday UTC. */
function pastIso(daysAgo: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

describe('Dashboard (e2e)', () => {
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
    const identity = uniqueTestIdentity('s1-07-dashboard');
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
   * Drives a match through the real flow — schedule, start, log goals, finish
   * — the same way `statistics.e2e-spec.ts` does, so the dashboard's totals
   * are checked against matches produced exactly as the live logger produces
   * them rather than scores set directly.
   */
  async function seedCompletedMatch(
    agent: Agent,
    squad: string[],
    options: {
      daysAgo: number;
      opponent: string;
      ownGoals: number;
      opponentGoals: number;
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
          athleteId: squad[0],
          minute: 10 + i,
        })
        .expect(201);
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

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/dashboard').expect(401);
  });

  it('returns zeroed-out counts for a brand-new team', async () => {
    const { agent } = await newCoach();

    const response = await agent.get('/dashboard').expect(200);
    const summary = response.body as DashboardBody;

    expect(summary).toMatchObject({
      activeAthletesCount: 0,
      totalEventsCount: 0,
      upcomingEvents: [],
      recentForm: [],
      seasonSummary: null,
      recentStats: [],
    });
  });

  it('counts active athletes but excludes archived ones', async () => {
    const { agent } = await newCoach();

    await agent
      .post('/athletes')
      .send({ firstName: 'Alex', lastName: 'Morgan' })
      .expect(201);
    const archived = await agent
      .post('/athletes')
      .send({ firstName: 'Sam', lastName: 'Kerr' })
      .expect(201);
    await agent
      .delete(`/athletes/${(archived.body as { id: string }).id}`)
      .expect(200);

    const summary = (await agent.get('/dashboard').expect(200))
      .body as DashboardBody;

    expect(summary.activeAthletesCount).toEqual(1);
  });

  it('counts every event but only surfaces the next five scheduled ones as upcoming', async () => {
    const { agent } = await newCoach();

    for (let i = 0; i < 6; i++) {
      await agent
        .post('/events')
        .send({
          title: `Session ${i}`,
          type: 'training',
          scheduledAt: futureIso(24 + i),
          location: 'Main field',
        })
        .expect(201);
    }
    const cancelled = await agent
      .post('/events')
      .send({
        title: 'Cancelled session',
        type: 'training',
        scheduledAt: futureIso(1),
        location: 'Main field',
      })
      .expect(201);
    await agent
      .delete(`/events/${(cancelled.body as { id: string }).id}`)
      .expect(200);

    const summary = (await agent.get('/dashboard').expect(200))
      .body as DashboardBody;

    // 6 training sessions + 1 cancelled = 7 total, but the cancelled one
    // (and anything past the 5th soonest) is excluded from `upcomingEvents`.
    expect(summary.totalEventsCount).toEqual(7);
    expect(summary.upcomingEvents).toHaveLength(5);
    expect(
      summary.upcomingEvents.some(
        (event) => event.title === 'Cancelled session',
      ),
    ).toBe(false);
  });

  it("never counts another team's athletes or events", async () => {
    const teamA = await newCoach();
    const teamB = await newCoach();

    await teamA.agent
      .post('/athletes')
      .send({ firstName: 'Alex', lastName: 'Morgan' })
      .expect(201);
    await teamA.agent
      .post('/events')
      .send({
        title: 'Saturday training',
        type: 'training',
        scheduledAt: futureIso(24),
        location: 'Main field',
      })
      .expect(201);

    const summaryB = (await teamB.agent.get('/dashboard').expect(200))
      .body as DashboardBody;

    expect(summaryB).toMatchObject({
      activeAthletesCount: 0,
      totalEventsCount: 0,
      upcomingEvents: [],
    });
  });

  it("computes the current season's record and recent-match rate stats", async () => {
    const { agent } = await newCoach();
    const squad = await createSquad(agent);

    await agent
      .post('/seasons')
      .send({
        name: 'Test Season',
        startDate: pastIso(60).slice(0, 10),
        endDate: pastIso(5).slice(0, 10),
        isCurrent: true,
      })
      .expect(201);

    // W 2-0 (clean sheet, scored), D 1-1 (scored), L 0-2 (neither) — most
    // recent first once sorted by date, exactly like `recentForm`.
    await seedCompletedMatch(agent, squad, {
      daysAgo: 30,
      opponent: 'Rivals FC',
      ownGoals: 2,
      opponentGoals: 0,
    });
    await seedCompletedMatch(agent, squad, {
      daysAgo: 20,
      opponent: 'City AFC',
      ownGoals: 1,
      opponentGoals: 1,
    });
    await seedCompletedMatch(agent, squad, {
      daysAgo: 10,
      opponent: 'United',
      ownGoals: 0,
      opponentGoals: 2,
    });

    const summary = (await agent.get('/dashboard').expect(200))
      .body as DashboardBody;

    expect(summary.seasonSummary).toEqual({
      played: 3,
      won: 1,
      drawn: 1,
      lost: 1,
      goalsFor: 3,
      goalsAgainst: 3,
    });

    const byLabel = Object.fromEntries(
      summary.recentStats.map((stat) => [stat.label, stat.value]),
    );
    expect(byLabel['Win Rate']).toBe(33);
    expect(byLabel['Clean Sheets']).toBe(33);
    expect(byLabel['Scoring Rate']).toBe(67);
  }, 60_000);

  it('falls back to all-time totals when there is no current season', async () => {
    const { agent } = await newCoach();
    const squad = await createSquad(agent);

    await seedCompletedMatch(agent, squad, {
      daysAgo: 5,
      opponent: 'Rivals FC',
      ownGoals: 3,
      opponentGoals: 1,
    });

    const summary = (await agent.get('/dashboard').expect(200))
      .body as DashboardBody;

    expect(summary.seasonSummary).toEqual({
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 3,
      goalsAgainst: 1,
    });
  }, 60_000);
});
