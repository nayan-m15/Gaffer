import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface EventBody {
  id: string;
  teamId: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string;
  location: string;
  notes: string | null;
}

interface ErrorResponseBody {
  message: string;
}

/** An ISO 8601 datetime with a UTC offset, `hoursFromNow` in the future. */
function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

describe('Events (e2e)', () => {
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
    const identity = uniqueTestIdentity('s1-07-events');
    identities.push(identity);
    return registerCoach(app.getHttpServer(), identity);
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/events').expect(401);
  });

  it("creates an event on the coach's team, defaulting to 'scheduled'", async () => {
    const { agent, team } = await newCoach();

    const response = await agent
      .post('/events')
      .send({
        title: 'Saturday training',
        type: 'training',
        scheduledAt: futureIso(24),
        location: 'Main field',
      })
      .expect(201);
    const event = response.body as EventBody;

    expect(event).toMatchObject({
      teamId: team.id,
      title: 'Saturday training',
      type: 'training',
      status: 'scheduled',
      location: 'Main field',
    });
  });

  it('rejects a payload missing required fields', async () => {
    const { agent } = await newCoach();

    const response = await agent
      .post('/events')
      .send({
        title: '',
        type: 'training',
        scheduledAt: futureIso(24),
        location: '',
      })
      .expect(400);
    const body = response.body as ErrorResponseBody;

    expect(body.message).toEqual(expect.any(String));
  });

  it('rejects an invalid event type', async () => {
    const { agent } = await newCoach();

    await agent
      .post('/events')
      .send({
        title: 'Mystery event',
        type: 'friendly',
        scheduledAt: futureIso(24),
        location: 'Main field',
      })
      .expect(400);
  });

  it('rejects a scheduledAt without a UTC offset', async () => {
    const { agent } = await newCoach();

    await agent
      .post('/events')
      .send({
        title: 'Saturday training',
        type: 'training',
        scheduledAt: '2030-01-01T10:00:00',
        location: 'Main field',
      })
      .expect(400);
  });

  it("lists the team's events ordered by soonest first", async () => {
    const { agent } = await newCoach();

    await agent
      .post('/events')
      .send({
        title: 'Later match',
        type: 'match',
        scheduledAt: futureIso(48),
        location: 'Away ground',
      })
      .expect(201);
    await agent
      .post('/events')
      .send({
        title: 'Sooner training',
        type: 'training',
        scheduledAt: futureIso(24),
        location: 'Main field',
      })
      .expect(201);

    const list = await agent.get('/events').expect(200);
    const events = list.body as EventBody[];

    expect(events).toHaveLength(2);
    expect(events[0].title).toEqual('Sooner training');
    expect(events[1].title).toEqual('Later match');
  });

  it('fetches a single event by id, 404s for an unknown uuid, and 400s for a malformed id', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/events')
      .send({
        title: 'Team meeting',
        type: 'meeting',
        scheduledAt: futureIso(24),
        location: 'Clubhouse',
      })
      .expect(201);
    const { id } = created.body as EventBody;

    await agent.get(`/events/${id}`).expect(200);
    await agent.get(`/events/${randomUUID()}`).expect(404);
    await agent.get('/events/not-a-uuid').expect(400);
  });

  it('updates an event', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/events')
      .send({
        title: 'Saturday training',
        type: 'training',
        scheduledAt: futureIso(24),
        location: 'Main field',
      })
      .expect(201);
    const { id } = created.body as EventBody;

    const response = await agent
      .patch(`/events/${id}`)
      .send({ location: 'Away field' })
      .expect(200);
    const event = response.body as EventBody;

    expect(event).toMatchObject({
      title: 'Saturday training',
      location: 'Away field',
    });
  });

  it('cancels an event by setting its status, rather than deleting it', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/events')
      .send({
        title: 'Saturday training',
        type: 'training',
        scheduledAt: futureIso(24),
        location: 'Main field',
      })
      .expect(201);
    const { id } = created.body as EventBody;

    const cancelled = await agent.delete(`/events/${id}`).expect(200);
    expect((cancelled.body as EventBody).status).toEqual('cancelled');

    const fetched = await agent.get(`/events/${id}`).expect(200);
    expect((fetched.body as EventBody).status).toEqual('cancelled');
  });

  it("never exposes one team's event to another team", async () => {
    const teamA = await newCoach();
    const teamB = await newCoach();

    const created = await teamA.agent
      .post('/events')
      .send({
        title: 'Saturday training',
        type: 'training',
        scheduledAt: futureIso(24),
        location: 'Main field',
      })
      .expect(201);
    const { id } = created.body as EventBody;

    await teamB.agent.get(`/events/${id}`).expect(404);
    await teamB.agent
      .patch(`/events/${id}`)
      .send({ title: 'Hacked' })
      .expect(404);
    await teamB.agent.delete(`/events/${id}`).expect(404);
    await expect(teamB.agent.get('/events').expect(200)).resolves.toMatchObject(
      {
        body: [],
      },
    );
  });
});
