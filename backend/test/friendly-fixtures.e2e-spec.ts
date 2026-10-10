import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { FORMATIONS } from '../src/game-plans/lineup-engine';
import { createDatabaseClient } from '../src/database/drizzle';
import { matchSessionParticipants, teamMembers } from '../src/database/schema';
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
  friendlyRequesterTeamId: string | null;
  friendlyRequesterTeamName: string | null;
  friendlyOpponentTeamId: string | null;
  friendlyOpponentTeamName: string | null;
  matchId: string | null;
  lineupConfirmedAt: string | null;
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
  fixture: { id: string; status: string; sharedSessionId?: string | null };
  event: EventBody;
}

interface TeamSearchBody {
  id: string;
  name: string;
}

interface FriendlyLineupBody {
  available: boolean;
  formation: string | null;
  source?: 'confirmed' | 'squad';
  starters: Array<{
    name: string;
    shirtNumber: number | null;
    slotId?: string | null;
  }>;
  bench: Array<{ name: string; shirtNumber: number | null }>;
}

interface LineupBody {
  startingAthleteIds: string[];
  benchAthleteIds: string[];
  confirmedAt: string;
}

interface MatchReadBody {
  id: string;
  opponentTeamId: string | null;
  friendlyOpponentLineup: FriendlyLineupBody;
}

/** An ISO 8601 datetime with a UTC offset, `hoursFromNow` in the future. */
function futureIso(hoursFromNow: number): string {
  // Match-day tests still need a future kickoff when creating their event.
  return new Date(
    Date.now() + Math.max(60_000, hoursFromNow * 60 * 60 * 1000),
  ).toISOString();
}

/** A schema-valid match body; the athletes are never on any team. */
function startMatchBody() {
  return {
    opponentName: 'Placeholder opponent',
    isHome: true,
    startingAthleteIds: Array.from({ length: 11 }, () => randomUUID()),
  };
}

const unavailableLineup: FriendlyLineupBody = {
  available: false,
  formation: null,
  starters: [],
  bench: [],
};

function expectedPlayers(prefix: string, first: number, last: number) {
  return Array.from({ length: last - first + 1 }, (_, index) => ({
    name: `${prefix}${first + index} Player`,
    shirtNumber: first + index,
  }));
}

describe('Friendly fixtures (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];
  const database = createDatabaseClient();
  let previousFlag: string | undefined;

  beforeEach(() => {
    previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
  });

  afterEach(() => {
    if (previousFlag === undefined)
      delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    else process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    // Sequential cleanup: this spec registers many coaches, and parallel
    // cascade deletes on the shared FK graph can deadlock on Neon. The
    // generous timeout covers the serialized per-identity deletes.
    for (const identity of identities) {
      await cleanupUser(identity);
    }
    await app.close();
  }, 120_000);

  async function newCoach() {
    const identity = uniqueTestIdentity('s3-ff');
    identities.push(identity);
    return registerCoach(app.getHttpServer(), identity);
  }

  /** Registers `count` athletes (shirt numbers 1..count) on the coach's team. */
  async function createSquad(
    agent: ReturnType<typeof request.agent>,
    prefix: string,
    count: number,
  ) {
    const athletes: { id: string }[] = [];
    for (let index = 1; index <= count; index += 1) {
      const created = await agent
        .post('/athletes')
        .send({
          firstName: `${prefix}${index}`,
          lastName: 'Player',
          position: 'CM',
          squadNumber: index,
        })
        .expect(201);
      athletes.push(created.body as { id: string });
    }
    return athletes;
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

  it('creates one shared session and home/away participants when an accepted friendly is enabled', async () => {
    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    try {
      const coachA = await newCoach();
      const coachB = await newCoach();
      const event = (
        await coachA.agent
          .post('/events')
          .send({
            title: coachB.team.name,
            type: 'match',
            scheduledAt: futureIso(0),
            location: 'Session Ground',
            friendlyOpponentTeamId: coachB.team.id,
          })
          .expect(201)
      ).body as EventBody;

      const acceptanceAttempts = await Promise.all([
        coachB.agent
          .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
          .then((response) => response),
        coachB.agent
          .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
          .then((response) => response),
      ]);
      const acceptedResponse = acceptanceAttempts.find(
        (response) => response.status === 201,
      );
      expect(
        acceptanceAttempts.filter((response) => response.status === 201),
      ).toHaveLength(1);
      expect(
        acceptanceAttempts.every((response) =>
          [201, 404, 409].includes(response.status),
        ),
      ).toBe(true);
      const accepted = acceptedResponse!.body as AcceptedBody;
      expect(accepted.fixture.sharedSessionId).toEqual(expect.any(String));

      const sheets: Array<{ id: string; sharedMatchId: string | null }> = [];
      for (const [coach, eventId] of [
        [coachA, event.id],
        [coachB, accepted.event.id],
      ] as const) {
        const squad = await createSquad(coach.agent, 'Friendly', 11);
        const started = await coach.agent
          .post(`/events/${eventId}/start-match`)
          .send({
            opponentName: 'Friendly opponent',
            isHome: coach === coachB,
            startingAthleteIds: squad.map((player) => player.id),
          })
          .expect(201);
        sheets.push(
          started.body as { id: string; sharedMatchId: string | null },
        );
      }
      expect(sheets[0].id).not.toBe(sheets[1].id);
      expect(sheets.map((sheet) => sheet.sharedMatchId)).toEqual([
        accepted.fixture.sharedSessionId,
        accepted.fixture.sharedSessionId,
      ]);
      await coachA.agent
        .post(`/matches/${sheets[0].id}/events`)
        .send({
          clientRequestId: randomUUID(),
          team: 'own',
          eventType: 'goal',
          minute: 7,
          period: 'first_half',
          matchElapsedMs: 420000,
        })
        .expect(201);
      const reportUrl = `/matches/sessions/${accepted.fixture.sharedSessionId}/report`;
      const homeReport = await coachA.agent.get(reportUrl).expect(200);
      const awayReport = await coachB.agent.get(reportUrl).expect(200);
      expect(homeReport.body).toEqual(awayReport.body);
      expect(
        (homeReport.body as { score: { home: number; away: number } }).score,
      ).toEqual({ home: 1, away: 0 });
      expect(
        (homeReport.body as { timeline: unknown[] }).timeline,
      ).toHaveLength(1);
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
      await coachA.agent.get(reportUrl).expect(404);
      await coachA.agent.get(`/matches/${sheets[0].id}`).expect(200);
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';

      const participants = await database
        .select({
          teamId: matchSessionParticipants.teamId,
          side: matchSessionParticipants.side,
        })
        .from(matchSessionParticipants)
        .where(
          eq(
            matchSessionParticipants.sessionId,
            accepted.fixture.sharedSessionId!,
          ),
        );
      expect(participants.sort((a, b) => a.side.localeCompare(b.side))).toEqual(
        [
          { teamId: coachB.team.id, side: 'away' },
          { teamId: coachA.team.id, side: 'home' },
        ],
      );
    } finally {
      if (previousFlag === undefined) {
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      } else {
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
      }
    }
  });

  it('assigns a rematch a fresh session after the prior friendly is cancelled', async () => {
    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    try {
      const home = await newCoach();
      const away = await newCoach();
      const schedule = async (title: string) =>
        (
          await home.agent
            .post('/events')
            .send({
              title,
              type: 'match',
              scheduledAt: futureIso(48),
              location: 'Rematch Ground',
              friendlyOpponentTeamId: away.team.id,
            })
            .expect(201)
        ).body as EventBody;

      const firstEvent = await schedule('First fixture');
      const firstAcceptance = await away.agent
        .post(`/friendly-fixtures/${firstEvent.friendlyFixtureId}/accept`)
        .expect(201);
      const firstSession = (firstAcceptance.body as AcceptedBody).fixture
        .sharedSessionId;
      expect(firstSession).toEqual(expect.any(String));
      await home.agent.delete(`/events/${firstEvent.id}`).expect(200);

      const rematchEvent = await schedule('Rematch fixture');
      const rematchAcceptance = await away.agent
        .post(`/friendly-fixtures/${rematchEvent.friendlyFixtureId}/accept`)
        .expect(201);
      const rematchSession = (rematchAcceptance.body as AcceptedBody).fixture
        .sharedSessionId;
      expect(rematchSession).toEqual(expect.any(String));
      expect(rematchSession).not.toBe(firstSession);
    } finally {
      if (previousFlag === undefined)
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      else process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
    }
  }, 60_000);

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

    // The requester's calendar shows the request as pending, with the
    // opponent's identity attached and a requester marker proving which
    // side is viewing.
    const listA = await coachA.agent.get('/events').expect(200);
    const eventA = (listA.body as EventBody[]).find(
      (row) => row.id === event.id,
    );
    expect(eventA).toMatchObject({
      friendlyFixtureStatus: 'pending',
      friendlyRequesterTeamId: coachA.team.id,
      friendlyRequesterTeamName: coachA.team.name,
      friendlyOpponentTeamId: coachB.team.id,
      friendlyOpponentTeamName: coachB.team.name,
    });
    // The viewing team is never presented as its own opponent.
    expect(eventA?.friendlyOpponentTeamId).not.toBe(coachA.team.id);

    // The detail response carries the same side markers, and no match or
    // lineup exists yet.
    const detailPending = await coachA.agent
      .get(`/events/${event.id}`)
      .expect(200);
    expect(detailPending.body).toMatchObject({
      friendlyFixtureStatus: 'pending',
      friendlyRequesterTeamId: coachA.team.id,
      friendlyOpponentTeamId: coachB.team.id,
      matchId: null,
      lineupConfirmedAt: null,
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

    // Before acceptance the fixture is NOT on the opponent's calendar and
    // the requester's event is unreachable from the opponent's account —
    // the pending invitation lives in their requests list instead.
    const listB = await coachB.agent.get('/events').expect(200);
    expect(
      (listB.body as EventBody[]).some(
        (row) => row.friendlyFixtureId === event.friendlyFixtureId,
      ),
    ).toBe(false);
    await coachB.agent.get(`/events/${event.id}`).expect(404);

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
      friendlyRequesterTeamId: coachA.team.id,
      friendlyRequesterTeamName: coachA.team.name,
      friendlyOpponentTeamId: coachA.team.id,
      friendlyOpponentTeamName: coachA.team.name,
    });
    // From the accepting side the opponent is the requester — never self.
    expect(mirrored?.friendlyOpponentTeamId).not.toBe(coachB.team.id);

    // Detail views tell the same side-aware story on both sides.
    const detailForB = await coachB.agent
      .get(`/events/${acceptedBody.event.id}`)
      .expect(200);
    expect(detailForB.body).toMatchObject({
      friendlyFixtureStatus: 'accepted',
      friendlyRequesterTeamId: coachA.team.id,
      friendlyOpponentTeamId: coachA.team.id,
    });
    const detailForA = await coachA.agent
      .get(`/events/${event.id}`)
      .expect(200);
    expect(detailForA.body).toMatchObject({
      friendlyFixtureStatus: 'accepted',
      friendlyRequesterTeamId: coachA.team.id,
      friendlyOpponentTeamId: coachB.team.id,
    });

    // Requester sees the same fixture as accepted and the incoming list is
    // now empty for the opponent.
    const listAAfter = await coachA.agent.get('/events').expect(200);
    expect(
      (listAAfter.body as EventBody[]).find((row) => row.id === event.id),
    ).toMatchObject({
      friendlyFixtureStatus: 'accepted',
      friendlyRequesterTeamId: coachA.team.id,
      friendlyOpponentTeamId: coachB.team.id,
    });
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

  it('presents one pending fixture from each coach’s own perspective', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();

    const created = await coachA.agent
      .post('/events')
      .send({
        title: coachB.team.name,
        type: 'match',
        scheduledAt: futureIso(48),
        location: 'Perspective Park',
        friendlyOpponentTeamId: coachB.team.id,
      })
      .expect(201);
    const event = created.body as EventBody;

    // Requester's calendar: the payload says "your team sent this, the
    // opponent is the other team" — the UI renders
    // "Friendly fixture request sent to {opponent} — waiting".
    const listA = await coachA.agent.get('/events').expect(200);
    const eventA = (listA.body as EventBody[]).find(
      (row) => row.id === event.id,
    );
    expect(eventA).toMatchObject({
      teamId: coachA.team.id,
      friendlyFixtureStatus: 'pending',
      friendlyRequesterTeamId: coachA.team.id,
      friendlyRequesterTeamName: coachA.team.name,
      friendlyOpponentTeamId: coachB.team.id,
      friendlyOpponentTeamName: coachB.team.name,
    });
    // The requester's own view derives "I sent this" from the payload.
    expect(eventA?.friendlyRequesterTeamId).toBe(eventA?.teamId);

    // Recipient's side of the SAME fixture: nothing on their calendar yet —
    // the invitation lives in the incoming list, always naming the
    // requester and carrying the addressable fixture id for Accept/Decline.
    const listB = await coachB.agent.get('/events').expect(200);
    expect(
      (listB.body as EventBody[]).some(
        (row) => row.friendlyFixtureId === event.friendlyFixtureId,
      ),
    ).toBe(false);
    const incomingB = await coachB.agent
      .get('/friendly-fixtures/incoming')
      .expect(200);
    const requestB = (incomingB.body as IncomingRequestBody[]).find(
      (row) => row.id === event.friendlyFixtureId,
    );
    expect(requestB).toMatchObject({
      requesterTeamId: coachA.team.id,
      requesterTeamName: coachA.team.name,
      eventId: event.id,
    });
    // From the recipient's side the viewer is not the requester — the UI
    // renders "{requester} has invited your team".
    expect(requestB?.requesterTeamId).not.toBe(coachB.team.id);

    // The recipient can never fetch the requester's event row...
    await coachB.agent.get(`/events/${event.id}`).expect(404);

    // ...the requester is never offered accept/decline for their own
    // request...
    const incomingA = await coachA.agent
      .get('/friendly-fixtures/incoming')
      .expect(200);
    expect(
      (incomingA.body as IncomingRequestBody[]).some(
        (row) => row.id === event.friendlyFixtureId,
      ),
    ).toBe(false);

    // ...and no fixture-linked event on either calendar ever presents the
    // viewing team as its own opponent.
    for (const row of [
      ...(listA.body as EventBody[]),
      ...(listB.body as EventBody[]),
    ]) {
      if (row.friendlyFixtureId) {
        expect(row.friendlyOpponentTeamId).not.toBe(row.teamId);
      }
    }
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

    // The requester keeps their own event but it is marked declined, with
    // the opponent still identified as the other team; the opponent never
    // gained an event.
    const listA = await coachA.agent.get('/events').expect(200);
    expect(
      (listA.body as EventBody[]).find((row) => row.id === event.id),
    ).toMatchObject({
      friendlyFixtureStatus: 'declined',
      friendlyRequesterTeamId: coachA.team.id,
      friendlyOpponentTeamId: coachB.team.id,
      friendlyOpponentTeamName: coachB.team.name,
    });

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

  it('keeps the opponent lineup unavailable while the fixture is pending or declined', async () => {
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

    // Pending: the request alone never yields a lineup.
    const pending = await coachA.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(200);
    expect(pending.body).toEqual(unavailableLineup);
    await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/decline`)
      .expect(201);

    // Declined: still no lineup, and the fixture never becomes readable.
    const declined = await coachA.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(200);
    expect(declined.body).toEqual(unavailableLineup);
    // An unrelated coach is refused outright — the event is not theirs.
    const outsider = await newCoach();
    await outsider.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(404);
  }, 60_000);

  it('shares the opponent’s confirmed lineup for an accepted friendly fixture', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();
    const squadA = await createSquad(coachA.agent, 'Alpha', 11);
    const squadB = await createSquad(coachB.agent, 'Bravo', 13);

    const created = await coachA.agent
      .post('/events')
      .send({
        title: coachB.team.name,
        type: 'match',
        // Today, so both sides can confirm their squads once accepted.
        scheduledAt: futureIso(0),
        location: 'Alpha Park',
        friendlyOpponentTeamId: coachB.team.id,
      })
      .expect(201);
    const event = created.body as EventBody;

    const accepted = await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
      .expect(201);
    const mirrored = (accepted.body as AcceptedBody).event;

    // Accepted, but no squad has been confirmed on either side yet.
    const beforeSquad = await coachA.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(200);
    expect(beforeSquad.body).toEqual(unavailableLineup);
    // B confirms their squad: 11 starters plus a two-player bench.
    const startedB = await coachB.agent
      .post(`/events/${mirrored.id}/start-match`)
      .send({
        opponentName: coachA.team.name,
        isHome: false,
        startingAthleteIds: squadB.slice(0, 11).map((athlete) => athlete.id),
        benchAthleteIds: squadB.slice(11).map((athlete) => athlete.id),
      })
      .expect(201);
    const matchB = startedB.body as { id: string };

    // A now reads B's real confirmed squad — the same rows B sees.
    const shared = await coachA.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(200);
    const lineup = shared.body as FriendlyLineupBody;
    expect(lineup).toEqual({
      available: true,
      formation: null,
      source: 'squad',
      starters: expectedPlayers('Bravo', 1, 11),
      bench: expectedPlayers('Bravo', 12, 13),
    });

    // A confirms their own squad too, then both match records serve the
    // shared lineup for the live/report views.
    const startedA = await coachA.agent
      .post(`/events/${event.id}/start-match`)
      .send({
        opponentName: coachB.team.name,
        isHome: true,
        startingAthleteIds: squadA.map((athlete) => athlete.id),
      })
      .expect(201);
    const matchA = startedA.body as { id: string };

    const matchReadA = await coachA.agent
      .get(`/matches/${matchA.id}`)
      .expect(200);
    const matchBodyA = matchReadA.body as MatchReadBody;
    expect(matchBodyA.opponentTeamId).toBe(coachB.team.id);
    expect(matchBodyA.friendlyOpponentLineup).toEqual(lineup);

    // Symmetric: B reads A's lineup on both read paths.
    const sharedForB = await coachB.agent
      .get(`/events/${mirrored.id}/friendly-opponent-lineup`)
      .expect(200);
    const lineupForB = sharedForB.body as FriendlyLineupBody;
    expect(lineupForB).toEqual({
      available: true,
      formation: null,
      source: 'squad',
      starters: expectedPlayers('Alpha', 1, 11),
      bench: [],
    });

    const matchReadB = await coachB.agent
      .get(`/matches/${matchB.id}`)
      .expect(200);
    expect((matchReadB.body as MatchReadBody).friendlyOpponentLineup).toEqual(
      lineupForB,
    );

    // An unrelated coach is refused on both read paths.
    const outsider = await newCoach();
    await outsider.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(404);
    await outsider.agent.get(`/matches/${matchA.id}`).expect(404);

    // Free-text (non-Gaffer) matches keep the neutral shape on both paths.
    const freeText = await coachA.agent
      .post('/events')
      .send({
        title: 'Village FC',
        type: 'match',
        scheduledAt: futureIso(0),
        location: 'Home ground',
      })
      .expect(201);
    const freeTextEvent = freeText.body as EventBody;
    const neutral = await coachA.agent
      .get(`/events/${freeTextEvent.id}/friendly-opponent-lineup`)
      .expect(200);
    expect(neutral.body).toEqual(unavailableLineup);
    const startedFreeText = await coachA.agent
      .post(`/events/${freeTextEvent.id}/start-match`)
      .send({
        opponentName: 'Village FC',
        isHome: true,
        startingAthleteIds: squadA.map((athlete) => athlete.id),
      })
      .expect(201);
    const freeTextMatch = startedFreeText.body as { id: string };
    const freeTextRead = await coachA.agent
      .get(`/matches/${freeTextMatch.id}`)
      .expect(200);
    expect((freeTextRead.body as MatchReadBody).friendlyOpponentLineup).toEqual(
      unavailableLineup,
    );
  }, 120_000);

  it('returns only the confirmed friendly lineup allowlist and keeps it readable after kickoff', async () => {
    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    try {
      const coachA = await newCoach();
      const coachB = await newCoach();
      const squadB = await createSquad(coachB.agent, 'Lineup', 12);
      const created = await coachA.agent
        .post('/events')
        .send({
          title: coachB.team.name,
          type: 'match',
          scheduledAt: futureIso(0),
          location: 'Alpha Park',
          friendlyOpponentTeamId: coachB.team.id,
        })
        .expect(201);
      const eventA = created.body as EventBody;
      const accepted = await coachB.agent
        .post(`/friendly-fixtures/${eventA.friendlyFixtureId}/accept`)
        .expect(201);
      const eventB = (accepted.body as AcceptedBody).event;
      const starters = squadB.slice(0, 11).map((athlete) => athlete.id);
      const bench = squadB.slice(11).map((athlete) => athlete.id);

      const unconfirmed = await coachA.agent
        .get(`/events/${eventA.id}/opponent-lineup`)
        .expect(200);
      expect(unconfirmed.body).toEqual({
        available: false,
        formation: null,
        starters: [],
        bench: [],
      });
      const outsider = await newCoach();
      await outsider.agent
        .get(`/events/${eventA.id}/opponent-lineup`)
        .expect(404);

      await coachB.agent
        .put(`/events/${eventB.id}/lineup`)
        .send({
          startingAthleteIds: starters,
          benchAthleteIds: bench,
          formationId: '4-3-3',
          pitchAssignments: Object.fromEntries(
            FORMATIONS['4-3-3'].positions.map((slot, index) => [
              slot.id,
              starters[index],
            ]),
          ),
        })
        .expect(200);
      const firstRead = await coachA.agent
        .get(`/events/${eventA.id}/opponent-lineup`)
        .expect(200);
      expect(firstRead.body).toEqual({
        available: true,
        formation: '4-3-3',
        source: 'confirmed',
        starters: expect.arrayContaining([
          { name: 'Lineup1 Player', shirtNumber: 1, slotId: '433-gk' },
        ]) as unknown,
        bench: [{ name: 'Lineup12 Player', shirtNumber: 12 }],
      });
      expect(Object.keys(firstRead.body as object).sort()).toEqual(
        ['available', 'bench', 'formation', 'source', 'starters'].sort(),
      );
      expect(JSON.stringify(firstRead.body)).not.toMatch(
        /tactic|game.?plan|notes|injur|draft|position|athlete.?id/i,
      );

      for (const player of (firstRead.body as FriendlyLineupBody).starters) {
        expect(Object.keys(player).sort()).toEqual([
          'name',
          'shirtNumber',
          'slotId',
        ]);
      }
      const rotatedStarters = [squadB[11].id, ...starters.slice(1)];
      await coachB.agent
        .put(`/events/${eventB.id}/lineup`)
        .send({
          startingAthleteIds: rotatedStarters,
          benchAthleteIds: [squadB[0].id],
          formationId: '3-5-2',
          pitchAssignments: Object.fromEntries(
            FORMATIONS['3-5-2'].positions.map((slot, index) => [
              slot.id,
              rotatedStarters[index],
            ]),
          ),
        })
        .expect(200);
      const updatedRead = await coachA.agent
        .get(`/events/${eventA.id}/opponent-lineup`)
        .expect(200);
      expect(updatedRead.body).toMatchObject({
        formation: '3-5-2',
        starters: expect.arrayContaining([
          { name: 'Lineup12 Player', shirtNumber: 12, slotId: '352-gk' },
        ]) as unknown,
        bench: [{ name: 'Lineup1 Player', shirtNumber: 1 }],
      });

      const started = await coachB.agent
        .post(`/events/${eventB.id}/start-match`)
        .send({
          opponentName: coachA.team.name,
          isHome: false,
          startingAthleteIds: rotatedStarters,
          benchAthleteIds: [squadB[0].id],
        })
        .expect(201);
      const afterKickoff = await coachA.agent
        .get(`/events/${eventA.id}/opponent-lineup`)
        .expect(200);
      expect(afterKickoff.body).toEqual(updatedRead.body);
      await coachB.agent
        .post(`/matches/${(started.body as { id: string }).id}/finish`)
        .expect(201);
      const afterFullTime = await coachA.agent
        .get(`/events/${eventA.id}/opponent-lineup`)
        .expect(200);
      expect(afterFullTime.body).toEqual(updatedRead.body);
      await database
        .delete(teamMembers)
        .where(eq(teamMembers.userId, coachA.user.id));
      await coachA.agent
        .get(`/events/${eventA.id}/opponent-lineup`)
        .expect(403);
    } finally {
      if (previousFlag === undefined)
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      else process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
    }
  }, 120_000);

  it('never falls back to a different match of the opponent team', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();
    const squadB = await createSquad(coachB.agent, 'Bravo', 11);

    const created = await coachA.agent
      .post('/events')
      .send({
        title: coachB.team.name,
        type: 'match',
        scheduledAt: futureIso(0),
        location: 'Alpha Park',
        friendlyOpponentTeamId: coachB.team.id,
      })
      .expect(201);
    const event = created.body as EventBody;
    await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
      .expect(201);

    // B confirms a squad for an unrelated free-text match instead.
    const otherEvent = await coachB.agent
      .post('/events')
      .send({
        title: 'Village FC',
        type: 'match',
        scheduledAt: futureIso(0),
        location: 'Bravo Park',
      })
      .expect(201);
    await coachB.agent
      .post(`/events/${(otherEvent.body as EventBody).id}/start-match`)
      .send({
        opponentName: 'Village FC',
        isHome: true,
        startingAthleteIds: squadB.map((athlete) => athlete.id),
      })
      .expect(201);

    // The friendly stays waiting: only the fixture-linked event counts, so
    // no unrelated opponent-team information leaks through.
    const shared = await coachA.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(200);
    expect(shared.body).toEqual(unavailableLineup);
  }, 120_000);

  it('shares each confirmed pre-kickoff lineup across an accepted friendly fixture', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();
    const squadA = await createSquad(coachA.agent, 'Alpha', 13);
    const squadB = await createSquad(coachB.agent, 'Bravo', 12);

    const created = await coachA.agent
      .post('/events')
      .send({
        title: coachB.team.name,
        type: 'match',
        scheduledAt: futureIso(0),
        location: 'Alpha Park',
        friendlyOpponentTeamId: coachB.team.id,
      })
      .expect(201);
    const event = created.body as EventBody;

    // Nothing is confirmed yet, and an empty record comes back as an empty
    // 200 body, which the client reads as "no lineup".
    const emptyLineup = await coachA.agent
      .get(`/events/${event.id}/lineup`)
      .expect(200);
    expect(emptyLineup.text).toBe('');

    // A confirms 11 starters plus a two-player bench while the request is
    // still pending — confirming a lineup waits for neither acceptance nor
    // match day.
    const startingA = squadA.slice(0, 11).map((athlete) => athlete.id);
    const benchA = squadA.slice(11).map((athlete) => athlete.id);
    const confirmed = await coachA.agent
      .put(`/events/${event.id}/lineup`)
      .send({ startingAthleteIds: startingA, benchAthleteIds: benchA })
      .expect(200);
    const lineupA = confirmed.body as LineupBody;
    expect(lineupA.startingAthleteIds).toEqual(startingA);
    expect(lineupA.benchAthleteIds).toEqual(benchA);
    expect(lineupA.confirmedAt).toEqual(expect.any(String));

    const ownLineup = await coachA.agent
      .get(`/events/${event.id}/lineup`)
      .expect(200);
    expect(ownLineup.body).toMatchObject({
      startingAthleteIds: startingA,
      benchAthleteIds: benchA,
      confirmedAt: lineupA.confirmedAt,
    });
    const detailA = await coachA.agent.get(`/events/${event.id}`).expect(200);
    expect(detailA.body).toMatchObject({
      matchId: null,
      lineupConfirmedAt: lineupA.confirmedAt,
    });

    // B accepts the request, then sees A's XI immediately — before either
    // side has started the match.
    const accepted = await coachB.agent
      .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
      .expect(201);
    const mirrored = (accepted.body as AcceptedBody).event;
    const sharedForB = await coachB.agent
      .get(`/events/${mirrored.id}/friendly-opponent-lineup`)
      .expect(200);
    const lineupForB = sharedForB.body as FriendlyLineupBody;
    expect(lineupForB).toEqual({
      available: true,
      formation: null,
      starters: expectedPlayers('Alpha', 1, 11).map((player) => ({
        ...player,
        slotId: null,
      })),
      source: 'confirmed',
      bench: expectedPlayers('Alpha', 12, 13),
    });

    // Symmetry: B confirms their own lineup and A sees it pre-kickoff too.
    const startingB = squadB.slice(0, 11).map((athlete) => athlete.id);
    await coachB.agent
      .put(`/events/${mirrored.id}/lineup`)
      .send({ startingAthleteIds: startingB })
      .expect(200);
    const sharedForA = await coachA.agent
      .get(`/events/${event.id}/friendly-opponent-lineup`)
      .expect(200);
    const lineupForA = sharedForA.body as FriendlyLineupBody;
    expect(lineupForA).toEqual({
      available: true,
      formation: null,
      starters: expectedPlayers('Bravo', 1, 11).map((player) => ({
        ...player,
        slotId: null,
      })),
      source: 'confirmed',
      bench: [],
    });

    // Confirming a lineup enforces the same rules as starting a match:
    // exactly 11 unique starters, only the team's own active athletes.
    await coachA.agent
      .put(`/events/${event.id}/lineup`)
      .send({ startingAthleteIds: startingA.slice(0, 10) })
      .expect(400);
    await coachA.agent
      .put(`/events/${event.id}/lineup`)
      .send({
        startingAthleteIds: startingA,
        benchAthleteIds: [squadB[0].id],
      })
      .expect(400);
    const outsider = await newCoach();
    await outsider.agent
      .put(`/events/${event.id}/lineup`)
      .send({ startingAthleteIds: startingA })
      .expect(404);

    // Enabled start retains the confirmed snapshot for opponent reads.
    const startedA = await coachA.agent
      .post(`/events/${event.id}/start-match`)
      .send({
        opponentName: coachB.team.name,
        isHome: true,
        startingAthleteIds: startingA,
        benchAthleteIds: benchA,
      })
      .expect(201);
    expect((startedA.body as { id: string }).id).toEqual(expect.any(String));

    const retained = await coachA.agent
      .get(`/events/${event.id}/lineup`)
      .expect(200);
    expect(retained.body).toEqual(ownLineup.body);

    // B keeps seeing the same confirmed snapshot after start.
    const afterStart = await coachB.agent
      .get(`/events/${mirrored.id}/friendly-opponent-lineup`)
      .expect(200);
    const lineupAfterStart = afterStart.body as FriendlyLineupBody;
    expect(lineupAfterStart).toEqual(lineupForB);

    // Confirming a lineup stays a pre-kickoff action.
    await coachA.agent
      .put(`/events/${event.id}/lineup`)
      .send({ startingAthleteIds: startingA })
      .expect(409);
  }, 120_000);

  it('confirms a lineup before match day without starting the match', async () => {
    const { agent } = await newCoach();
    const squad = await createSquad(agent, 'Solo', 12);
    const firstXi = squad.slice(0, 11).map((athlete) => athlete.id);
    const rotatedXi = [
      squad[11].id,
      ...squad.slice(1, 11).map((athlete) => athlete.id),
    ];

    const created = await agent
      .post('/events')
      .send({
        title: 'Village FC',
        type: 'match',
        scheduledAt: futureIso(48),
        location: 'Home ground',
      })
      .expect(201);
    const event = created.body as EventBody;

    // A lineup can be confirmed any time before kickoff...
    await agent
      .put(`/events/${event.id}/lineup`)
      .send({ startingAthleteIds: firstXi })
      .expect(200);

    // ...and re-confirming replaces the stored XI.
    const reconfirmed = await agent
      .put(`/events/${event.id}/lineup`)
      .send({ startingAthleteIds: rotatedXi })
      .expect(200);
    expect((reconfirmed.body as LineupBody).startingAthleteIds).toEqual(
      rotatedXi,
    );

    // Starting the match itself stays match-day gated, so confirming a
    // lineup never doubles as kickoff.
    const blocked = await agent
      .post(`/events/${event.id}/start-match`)
      .send({
        opponentName: 'Village FC',
        isHome: true,
        startingAthleteIds: rotatedXi,
      })
      .expect(403);
    expect((blocked.body as { message: string }).message).toContain(
      'match day',
    );

    // The unstarted event reports the confirmation without a match id, and
    // the stored lineup stays readable.
    const detail = await agent.get(`/events/${event.id}`).expect(200);
    expect(detail.body).toMatchObject({ matchId: null });
    expect((detail.body as EventBody).lineupConfirmedAt).toEqual(
      expect.any(String),
    );
    const stored = await agent.get(`/events/${event.id}/lineup`).expect(200);
    expect((stored.body as LineupBody).startingAthleteIds).toEqual(rotatedXi);
  }, 60_000);
});
