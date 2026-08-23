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

interface DashboardBody {
  activeAthletesCount: number;
  totalEventsCount: number;
  upcomingEvents: Array<{ id: string; title: string }>;
}

/** An ISO 8601 datetime with a UTC offset, `hoursFromNow` in the future. */
function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
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
});
