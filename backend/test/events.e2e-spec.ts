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
  competitionId: string | null;
}

interface ErrorResponseBody {
  message: string;
}

interface IdBody {
  id: string;
}

interface MatchBody {
  id: string;
  competitionId: string | null;
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

  it('carries match competition assignment through creation and editing', async () => {
    const { agent } = await newCoach();
    // Competition names are globally unique (case-insensitively), so suffix a
    // uuid to stay collision-free across repeated runs against the persistent
    // test database.
    const leagueName = `Premier League ${randomUUID()}`;
    const cupName = `County Cup ${randomUUID()}`;
    const league = await agent
      .post('/statistics/competitions')
      .send({ name: leagueName, type: 'league', season: '2026/27' })
      .expect(201);
    const cup = await agent
      .post('/statistics/competitions')
      .send({ name: cupName, type: 'cup', season: '2026/27' })
      .expect(201);
    const leagueId = (league.body as IdBody).id;
    const cupId = (cup.body as IdBody).id;

    const created = await agent
      .post('/events')
      .send({
        title: 'League match',
        type: 'match',
        scheduledAt: new Date().toISOString(),
        location: 'Main field',
        competitionId: leagueId,
      })
      .expect(201);
    const event = created.body as EventBody;
    expect(event.competitionId).toBe(leagueId);

    const updated = await agent
      .patch(`/events/${event.id}`)
      .send({ competitionId: cupId })
      .expect(200);
    expect((updated.body as EventBody).competitionId).toBe(cupId);

    const cleared = await agent
      .patch(`/events/${event.id}`)
      .send({ competitionId: null })
      .expect(200);
    expect((cleared.body as EventBody).competitionId).toBeNull();

    const reassigned = await agent
      .patch(`/events/${event.id}`)
      .send({ competitionId: leagueId })
      .expect(200);
    expect((reassigned.body as EventBody).competitionId).toBe(leagueId);

    const opponentParticipant = await agent
      .post(`/competitions/${leagueId}/teams`)
      .send({ displayName: 'Rivals FC' })
      .expect(201);
    const opponentCompetitionTeamId = (opponentParticipant.body as IdBody).id;

    const athleteIds = await Promise.all(
      Array.from({ length: 11 }, async (_, index) => {
        const athlete = await agent
          .post('/athletes')
          .send({
            firstName: `Player${index + 1}`,
            lastName: 'Integration',
          })
          .expect(201);
        return (athlete.body as IdBody).id;
      }),
    );
    const started = await agent
      .post(`/events/${event.id}/start-match`)
      .send({
        opponentName: 'Rivals FC',
        opponentCompetitionTeamId,
        isHome: true,
        startingAthleteIds: athleteIds,
      })
      .expect(201);
    const match = started.body as MatchBody;
    expect(match.competitionId).toBe(leagueId);

    // After the match has started, the competition cannot be changed
    await agent
      .patch(`/events/${event.id}`)
      .send({ competitionId: cupId })
      .expect(400);

    // Other fields can still be updated and the match assignment is retained
    const renamed = await agent
      .patch(`/events/${event.id}`)
      .send({ title: 'Rescheduled League Match' })
      .expect(200);
    expect((renamed.body as EventBody).title).toBe('Rescheduled League Match');
    expect((renamed.body as EventBody).competitionId).toBe(leagueId);

    const matchAfterUpdate = await agent
      .get(`/matches/${match.id}`)
      .expect(200);
    expect((matchAfterUpdate.body as MatchBody).competitionId).toBe(leagueId);
  }, 40000);

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
