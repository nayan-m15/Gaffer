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
  friendlyFixtureId: string | null;
  friendlyFixtureStatus: string | null;
  friendlyOpponentTeamId: string | null;
  friendlyOpponentTeamName: string | null;
}

interface IncomingRequestBody {
  id: string;
  requesterTeamId: string;
  requesterTeamName: string;
  eventId: string | null;
  scheduledAt: string | null;
  location: string | null;
}

interface AcceptedBody {
  fixture: { id: string; status: string };
  event: EventBody;
}

interface TeamSearchBody {
  id: string;
  name: string;
}

/** An ISO 8601 datetime with a UTC offset, `hoursFromNow` in the future. */
function futureIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000).toISOString();
}

/** A schema-valid match body; the athletes are never on any team. */
function startMatchBody() {
  return {
    opponentName: 'Placeholder opponent',
    isHome: true,
    startingAthleteIds: Array.from({ length: 11 }, () => randomUUID()),
  };
}

describe('Friendly fixtures (e2e)', () => {
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
    const identity = uniqueTestIdentity('s3-ff');
    identities.push(identity);
    return registerCoach(app.getHttpServer(), identity);
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/friendly-fixtures/incoming')
      .expect(401);
  });

  it('team search finds other Gaffer teams but never the caller’s own team', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();
    const ownName = await coachA.agent
      .get(`/teams/search?q=${encodeURIComponent(coachA.team.name)}`)
      .expect(200);
    expect(
      (ownName.body as TeamSearchBody[]).some(
        (team) => team.id === coachA.team.id,
      ),
    ).toBe(false);

    const opponentName = await coachA.agent
      .get(`/teams/search?q=${encodeURIComponent(coachB.team.name)}`)
      .expect(200);
    expect(opponentName.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: coachB.team.id, name: coachB.team.name }),
      ]),
    );
  }, 60_000);

  it('team search also matches a team by its coach’s account name', async () => {
    const coachA = await newCoach();
    const identityB = uniqueTestIdentity('s3-ff-name');
    identities.push(identityB);
    const coachName = `Coach ${randomUUID()}`;
    const coachB = await registerCoach(
      app.getHttpServer(),
      identityB,
      coachName,
    );

    // The unique account name matches no team-name, so a hit here proves the
    // coach-name half of the search filter did the work.
    const byCoachName = await coachA.agent
      .get(`/teams/search?q=${encodeURIComponent(coachName)}`)
      .expect(200);
    expect(byCoachName.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: coachB.team.id, name: coachB.team.name }),
      ]),
    );

    // The caller's own team stays excluded even when their own coach name is
    // what matched it.
    const ownByCoachName = await coachB.agent
      .get(`/teams/search?q=${encodeURIComponent(coachName)}`)
      .expect(200);
    expect(
      (ownByCoachName.body as TeamSearchBody[]).some(
        (team) => team.id === coachB.team.id,
      ),
    ).toBe(false);
  }, 60_000);

  it('rejects selecting the coach’s own team as the Gaffer opponent', async () => {
    const { agent, team } = await newCoach();

    const response = await agent
      .post('/events')
      .send({
        title: 'Impossible friendly',
        type: 'match',
        scheduledAt: futureIso(24),
        location: 'Home ground',
        friendlyOpponentTeamId: team.id,
      })
      .expect(400);
    expect((response.body as { message: string }).message).toContain(
      'own team',
    );
  });

  it('keeps free-text (non-Gaffer) opponents working without a fixture link', async () => {
    const { agent } = await newCoach();

    const response = await agent
      .post('/events')
      .send({
        title: 'Village FC',
        type: 'match',
        scheduledAt: futureIso(24),
        location: 'Home ground',
      })
      .expect(201);

    expect((response.body as EventBody).friendlyFixtureId).toBeNull();
  });

  it('creates a pending friendly fixture request visible to the opponent coach only', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();

    const created = await coachA.agent
      .post('/events')
      .send({
        title: coachB.team.name,
        type: 'match',
        // Scheduled for today, so once accepted the match-day gate passes
        // and the request reaches squad validation.
        scheduledAt: futureIso(0),
        location: 'Alpha Park',
        friendlyOpponentTeamId: coachB.team.id,
      })
      .expect(201);
    const event = created.body as EventBody;
    expect(event.friendlyFixtureId).toEqual(expect.any(String));

    // The requester's calendar shows the request as pending with the
    // opponent's team identity attached.
    const listA = await coachA.agent.get('/events').expect(200);
    const eventA = (listA.body as EventBody[]).find(
      (row) => row.id === event.id,
    );
    expect(eventA).toMatchObject({
      friendlyFixtureStatus: 'pending',
      friendlyOpponentTeamId: coachB.team.id,
      friendlyOpponentTeamName: coachB.team.name,
    });

    // The opponent sees the request in the incoming list, with the proposed
    // date/location carried over from the requester's event.
    const incoming = await coachB.agent
      .get('/friendly-fixtures/incoming')
      .expect(200);
    const request = (incoming.body as IncomingRequestBody[]).find(
      (row) => row.id === event.friendlyFixtureId,
    );
    expect(request).toMatchObject({
      requesterTeamId: coachA.team.id,
      requesterTeamName: coachA.team.name,
      eventId: event.id,
      location: 'Alpha Park',
    });

    // Before acceptance the fixture is NOT on the opponent's calendar.
    const listB = await coachB.agent.get('/events').expect(200);
    expect(
      (listB.body as EventBody[]).some(
        (row) => row.friendlyFixtureId === event.friendlyFixtureId,
      ),
    ).toBe(false);

    // ...and the requester cannot start the match yet.
    const startPending = await coachA.agent
      .post(`/events/${event.id}/start-match`)
      .send(startMatchBody())
      .expect(403);
    expect((startPending.body as { message: string }).message).toContain(
      'accept',
    );

    // The opponent coach accepts: a linked mirror event appears in their
    // calendar, titled with the requesting team's name.
    const accepted = await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
      .expect(201);
    const acceptedBody = accepted.body as AcceptedBody;
    expect(acceptedBody.fixture.status).toBe('accepted');
    expect(acceptedBody.event).toMatchObject({
      teamId: coachB.team.id,
      title: coachA.team.name,
      type: 'match',
      status: 'scheduled',
      location: 'Alpha Park',
      friendlyFixtureId: event.friendlyFixtureId,
    });

    const listBAfter = await coachB.agent.get('/events').expect(200);
    const mirrored = (listBAfter.body as EventBody[]).find(
      (row) => row.id === acceptedBody.event.id,
    );
    expect(mirrored).toMatchObject({
      friendlyFixtureStatus: 'accepted',
      friendlyOpponentTeamId: coachA.team.id,
      friendlyOpponentTeamName: coachA.team.name,
    });

    // Requester sees the same fixture as accepted and the incoming list is
    // now empty for the opponent.
    const listAAfter = await coachA.agent.get('/events').expect(200);
    expect(
      (listAAfter.body as EventBody[]).find((row) => row.id === event.id),
    ).toMatchObject({ friendlyFixtureStatus: 'accepted' });
    const incomingAfter = await coachB.agent
      .get('/friendly-fixtures/incoming')
      .expect(200);
    expect(
      (incomingAfter.body as IncomingRequestBody[]).some(
        (row) => row.id === event.friendlyFixtureId,
      ),
    ).toBe(false);

    // A second accept can never double-create the opponent's event.
    await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
      .expect(409);

    // With the fixture accepted, the match can pass the friendly gate — it
    // now fails on squad validation instead (the fake athletes are unknown).
    const startAccepted = await coachA.agent
      .post(`/events/${event.id}/start-match`)
      .send(startMatchBody())
      .expect(400);
    expect((startAccepted.body as { message: string }).message).toContain(
      'not on this team',
    );

    // Cancelling from either side retires the shared fixture on both
    // calendars — the two sides stay linked to one fixture.
    await coachA.agent.delete(`/events/${event.id}`).expect(200);
    const listBCancelled = await coachB.agent.get('/events').expect(200);
    expect(
      (listBCancelled.body as EventBody[]).find(
        (row) => row.id === acceptedBody.event.id,
      ),
    ).toMatchObject({ status: 'cancelled' });
    const listACancelled = await coachA.agent.get('/events').expect(200);
    expect(
      (listACancelled.body as EventBody[]).find((row) => row.id === event.id),
    ).toMatchObject({
      status: 'cancelled',
      friendlyFixtureStatus: 'cancelled',
    });
  }, 60_000);

  it('declining leaves the requester’s event unlinked from the opponent and blocks starting', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();

    const created = await coachA.agent
      .post('/events')
      .send({
        title: coachB.team.name,
        type: 'match',
        scheduledAt: futureIso(24),
        location: 'Alpha Park',
        friendlyOpponentTeamId: coachB.team.id,
      })
      .expect(201);
    const event = created.body as EventBody;

    await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/decline`)
      .expect(201);

    // The requester keeps their own event but it is marked declined; the
    // opponent never gained an event.
    const listA = await coachA.agent.get('/events').expect(200);
    expect(
      (listA.body as EventBody[]).find((row) => row.id === event.id),
    ).toMatchObject({ friendlyFixtureStatus: 'declined' });

    const listB = await coachB.agent.get('/events').expect(200);
    expect(
      (listB.body as EventBody[]).some(
        (row) => row.friendlyFixtureId === event.friendlyFixtureId,
      ),
    ).toBe(false);

    const startDeclined = await coachA.agent
      .post(`/events/${event.id}/start-match`)
      .send(startMatchBody())
      .expect(403);
    expect((startDeclined.body as { message: string }).message).toContain(
      'declined',
    );

    // A declined request is no longer awaiting a response.
    await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/decline`)
      .expect(409);
  }, 60_000);

  it('an unrelated coach can neither see nor respond to another team’s fixture request', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();
    const outsider = await newCoach();

    const created = await coachA.agent
      .post('/events')
      .send({
        title: coachB.team.name,
        type: 'match',
        scheduledAt: futureIso(24),
        location: 'Alpha Park',
        friendlyOpponentTeamId: coachB.team.id,
      })
      .expect(201);
    const event = created.body as EventBody;

    const incoming = await outsider.agent
      .get('/friendly-fixtures/incoming')
      .expect(200);
    expect(
      (incoming.body as IncomingRequestBody[]).some(
        (row) => row.id === event.friendlyFixtureId,
      ),
    ).toBe(false);

    await outsider.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
      .expect(404);
    await outsider.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/decline`)
      .expect(404);

    // ...and the real opponent can still accept it afterwards.
    await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
      .expect(201);
  }, 60_000);
});
