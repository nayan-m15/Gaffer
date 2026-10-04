import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import {
  events,
  friendlyFixtures,
  matchSessionParticipants,
  matchSessions,
  matches,
  teamMembers,
} from '../src/database/schema';
import { registerAssistant, registerCoach } from './utils/auth-helpers';
import {
  cleanupUsers,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface SessionBody {
  user: { id: string; name: string; email: string };
  team: { id: string; name: string; role: string } | null;
}

// Proves the team boundary at the session level: registration gives each coach
// their own team, and `GET /auth/session` never leaks another user's. Isolation
// of individual resources (athletes, events, statistics, seasons) is covered by
// those modules' own suites.
describe('Team isolation (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];
  const sessionIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    const database = app.get(DatabaseService).database;
    for (const sessionId of sessionIds) {
      await database
        .delete(matchSessions)
        .where(eq(matchSessions.id, sessionId));
    }
    await cleanupUsers(identities);
    await app.close();
  });

  async function newCoach(name: string) {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    const registered = await registerCoach(app.getHttpServer(), identity, name);
    return { ...registered, identity };
  }

  it('gives each newly registered coach a distinct team', async () => {
    // Sequential rather than parallel: registration now spans sign-up,
    // verification and team creation, and two interleaved flows against the
    // shared dev database make failures hard to read.
    const coachA = await newCoach('Coach A');
    const coachB = await newCoach('Coach B');

    expect(coachA.team.id).not.toEqual(coachB.team.id);
    expect(coachA.team.name).toEqual(coachA.identity.teamName);
    expect(coachB.team.name).toEqual(coachB.identity.teamName);
  });

  it('rejects a second team for the same coach', async () => {
    const coach = await newCoach('Coach A');

    await coach.agent
      .post('/teams')
      .send({ name: `${coach.identity.teamName} Reserves` })
      .expect(409);
  });

  it("never returns another user's team from /auth/session", async () => {
    const coachA = await newCoach('Coach A');
    const coachB = await newCoach('Coach B');

    const sessionA = await coachA.agent.get('/auth/session').expect(200);
    const sessionB = await coachB.agent.get('/auth/session').expect(200);
    const bodyA = sessionA.body as SessionBody;
    const bodyB = sessionB.body as SessionBody;

    expect(bodyA.team?.name).toEqual(coachA.identity.teamName);
    expect(bodyA.team?.name).not.toEqual(coachB.identity.teamName);
    expect(bodyB.team?.name).toEqual(coachB.identity.teamName);
    expect(bodyB.team?.name).not.toEqual(coachA.identity.teamName);
    expect(bodyA.user.email).toEqual(coachA.identity.email);
    expect(bodyB.user.email).toEqual(coachB.identity.email);
  });

  it('authorizes shared reads by current session participation but keeps match sheets private', async () => {
    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    try {
      const database = app.get(DatabaseService).database;
      const coachA = await newCoach('Home Coach');
      const coachB = await newCoach('Away Coach');
      const outsider = await newCoach('Unrelated Coach');
      const assistantIdentity = uniqueTestIdentity('s4-session-assistant');
      identities.push(assistantIdentity);
      const assistant = await registerAssistant(
        app.getHttpServer(),
        coachB.agent,
        assistantIdentity,
      );

      const [session] = await database
        .insert(matchSessions)
        .values({})
        .returning({ id: matchSessions.id });
      sessionIds.push(session.id);
      await database.insert(matchSessionParticipants).values([
        { sessionId: session.id, teamId: coachA.team.id, side: 'home' },
        { sessionId: session.id, teamId: coachB.team.id, side: 'away' },
      ]);

      const [eventA] = await database
        .insert(events)
        .values({
          teamId: coachA.team.id,
          title: 'Private Home Sheet',
          type: 'match',
          status: 'scheduled',
          scheduledAt: new Date(),
          location: 'Home Ground',
          notes: 'home private notes',
        })
        .returning({ id: events.id });
      const [eventB] = await database
        .insert(events)
        .values({
          teamId: coachB.team.id,
          title: 'Private Away Sheet',
          type: 'match',
          status: 'scheduled',
          scheduledAt: new Date(),
          location: 'Away Ground',
          notes: 'away private notes',
        })
        .returning({ id: events.id });
      const [matchA] = await database
        .insert(matches)
        .values({
          eventId: eventA.id,
          sharedMatchId: session.id,
          opponentName: coachB.team.name,
        })
        .returning({ id: matches.id });
      const [matchB] = await database
        .insert(matches)
        .values({
          eventId: eventB.id,
          sharedMatchId: session.id,
          opponentName: coachA.team.name,
          isHome: false,
        })
        .returning({ id: matches.id });

      // The flag-off path keeps the pre-session team boundary unchanged.
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
      await coachB.agent.get(`/matches/${matchA.id}/events`).expect(404);

      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
      await coachB.agent.get(`/matches/${matchA.id}/events`).expect(200);
      await assistant.agent.get(`/matches/${matchA.id}/events`).expect(200);
      await coachB.agent.get(`/matches/${matchA.id}/event-reviews`).expect(200);
      await coachB.agent
        .get(`/matches/${matchA.id}/event-operations`)
        .expect(200);
      await coachB.agent
        .get(`/matches/${matchA.id}/clock-operations`)
        .expect(200);
      await outsider.agent.get(`/matches/${matchA.id}/events`).expect(404);

      // Session participation does not grant the other team's private sheet.
      await coachB.agent.get(`/matches/${matchA.id}`).expect(404);
      await coachB.agent.get(`/matches/${matchA.id}/squad`).expect(404);
      await coachB.agent
        .get(`/matches/${matchA.id}/opponent-squad`)
        .expect(404);
      await coachB.agent.get(`/events/${eventA.id}`).expect(404);
      await coachB.agent.get(`/events/${eventA.id}/lineup`).expect(404);
      const ownSheet = await coachB.agent
        .get(`/matches/${matchB.id}`)
        .expect(200);
      expect((ownSheet.body as { eventNotes: string }).eventNotes).toBe(
        'away private notes',
      );

      // Current membership is checked on each request, not cached in session.
      await database
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.teamId, coachB.team.id),
            eq(teamMembers.userId, assistant.user.id),
          ),
        );
      await assistant.agent.get(`/matches/${matchA.id}/events`).expect(403);
    } finally {
      if (previousFlag === undefined) {
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      } else {
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
      }
    }
  });

  it('returns a narrow authenticated fixture link diagnostic to participants only', async () => {
    const database = app.get(DatabaseService).database;
    const coachA = await newCoach('Diagnostic Home');
    const coachB = await newCoach('Diagnostic Away');
    const outsider = await newCoach('Diagnostic Outsider');
    const [session] = await database
      .insert(matchSessions)
      .values({})
      .returning({ id: matchSessions.id });
    sessionIds.push(session.id);
    const [fixture] = await database
      .insert(friendlyFixtures)
      .values({
        requesterTeamId: coachA.team.id,
        opponentTeamId: coachB.team.id,
        status: 'accepted',
        createdByUserId: coachA.user.id,
        sharedSessionId: session.id,
      })
      .returning({ id: friendlyFixtures.id });
    const [eventA, eventB] = await database
      .insert(events)
      .values([
        {
          teamId: coachA.team.id,
          title: 'Diagnostic fixture',
          type: 'match',
          scheduledAt: new Date(),
          location: '',
          friendlyFixtureId: fixture.id,
          notes: 'private tactical note',
        },
        {
          teamId: coachB.team.id,
          title: 'Diagnostic fixture',
          type: 'match',
          scheduledAt: new Date(),
          location: '',
          friendlyFixtureId: fixture.id,
          notes: 'other private tactical note',
        },
      ])
      .returning({ id: events.id });
    await database.insert(matchSessionParticipants).values([
      { sessionId: session.id, teamId: coachA.team.id, side: 'home' },
      { sessionId: session.id, teamId: coachB.team.id, side: 'away' },
    ]);
    const [matchA, matchB] = await database
      .insert(matches)
      .values([
        {
          eventId: eventA.id,
          sharedMatchId: session.id,
          opponentName: coachB.team.name,
        },
        {
          eventId: eventB.id,
          sharedMatchId: session.id,
          opponentName: coachA.team.name,
          isHome: false,
        },
      ])
      .returning({ id: matches.id });

    const diagnosticA = await coachA.agent
      .get(`/events/${eventA.id}/link-diagnostic`)
      .expect(200);
    const diagnosticB = await coachB.agent
      .get(`/events/${eventA.id}/link-diagnostic`)
      .expect(200);
    expect(diagnosticA.body).toEqual(diagnosticB.body);
    expect(diagnosticA.body).toMatchObject({
      eventId: eventA.id,
      fixtureId: fixture.id,
      sharedSessionId: session.id,
      status: 'linked',
      participants: [
        { teamId: coachA.team.id, side: 'home' },
        { teamId: coachB.team.id, side: 'away' },
      ],
      matchSheets: expect.arrayContaining([
        { teamId: coachA.team.id, side: 'home', matchId: matchA.id },
        { teamId: coachB.team.id, side: 'away', matchId: matchB.id },
      ]) as unknown,
    });
    expect(JSON.stringify(diagnosticA.body)).not.toMatch(
      /private tactical note|lineup|tactics|injury/i,
    );
    await outsider.agent
      .get(`/events/${eventA.id}/link-diagnostic`)
      .expect(404);

    const [manualEvent] = await database
      .insert(events)
      .values({
        teamId: coachA.team.id,
        title: 'Unlinked event',
        type: 'match',
        scheduledAt: new Date(),
        location: '',
      })
      .returning({ id: events.id });
    const manualDiagnostic = await coachA.agent
      .get(`/events/${manualEvent.id}/link-diagnostic`)
      .expect(200);
    expect(manualDiagnostic.body).toMatchObject({
      eventId: manualEvent.id,
      fixtureId: null,
      sharedSessionId: null,
      participants: [],
      matchSheets: [],
      status: 'unlinked',
      warning: expect.any(String) as unknown,
    });
  });
});
