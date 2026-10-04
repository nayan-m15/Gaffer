import type {
  SessionReport,
  MatchRecord,
  MatchLogEvent,
} from '../../frontend/src/features/matches/types';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
// Frontend has an ESM tsconfig; load its pure model as CommonJS without changing Jest's backend transform.
const frontendModel = { exports: {} };
runInNewContext(
  ts.transpileModule(
    readFileSync(
      resolve(
        __dirname,
        '../../frontend/src/features/matches/session-report-model.ts',
      ),
      'utf8',
    ),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText,
  frontendModel,
);
const { applySessionReport, sessionTimeline, sessionReportKey } =
  frontendModel.exports as {
    applySessionReport: (
      sheet: MatchRecord,
      report: SessionReport,
    ) => MatchRecord;
    sessionTimeline: (
      report: SessionReport,
      sheet: MatchRecord,
    ) => MatchLogEvent[];
    sessionReportKey: (sessionId: string) => readonly string[];
  };
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { eq, sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import {
  competitionTeams,
  competitionFixtures,
  athletes,
  events,
  matches,
  matchSessions,
  teamMembers,
} from '../src/database/schema';
import { syncFixtureResult } from '../src/competitions/competition-fixture-results';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUsers,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface CompetitionTeamBody {
  id: string;
  displayName: string;
  teamId: string | null;
}

interface CompetitionBody {
  id: string;
  name: string;
  type: string;
  season: string | null;
  isAdmin: boolean;
  participants?: CompetitionTeamBody[];
}

interface FixtureBody {
  id: string;
  sharedSessionId: string | null;
  homeCompetitionTeamId: string;
  awayCompetitionTeamId: string;
}
interface CompetitionResultBody {
  results: Array<{
    homeCompetitionTeamId: string;
    awayCompetitionTeamId: string;
    homeScore: number;
    awayScore: number;
  }>;
  standings: Array<{ played: number }>;
}
interface CompetitionSummaryBody {
  id: string;
  name: string;
  type: string;
  isAdmin: boolean;
  participantCount: number;
}

describe('Shared competitions (e2e)', () => {
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
    await cleanupUsers(identities);
    await app.close();
  });

  async function newCoach(prefix = 's3-01-competitions') {
    const identity = uniqueTestIdentity(prefix);
    identities.push(identity);
    return registerCoach(app.getHttpServer(), identity);
  }

  /** Competition names are globally unique — a random suffix isolates runs. */
  function uniqueName(base: string): string {
    return `${base} ${randomUUID().slice(0, 8)}`;
  }

  let frontendReportCase:
    { home: MatchRecord; away: MatchRecord; report: SessionReport } | undefined;

  async function createCompetition(
    agent: ReturnType<typeof request.agent>,
    name: string,
    type: 'league' | 'cup' = 'league',
  ): Promise<CompetitionBody> {
    const response = await agent
      .post('/competitions')
      .send({ name, type })
      .expect(201);
    return response.body as CompetitionBody;
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/competitions/mine').expect(401);
    await request(app.getHttpServer())
      .get('/competitions/search?q=x')
      .expect(401);
  });

  it('makes the creator the admin and auto-inserts their team as a participant', async () => {
    const { agent, team } = await newCoach();
    const name = uniqueName('Durban Sunday League');

    const competition = await createCompetition(agent, name);

    expect(competition.name).toBe(name);
    expect(competition.type).toBe('league');
    expect(competition.isAdmin).toBe(true);
    expect(competition.participants).toHaveLength(1);
    expect(competition.participants![0]).toMatchObject({
      displayName: team.name,
      teamId: team.id,
    });

    // The admin reference is the creating user, and the legacy teamId keeps
    // naming the creator's team.
    const detail = (
      await agent.get(`/competitions/${competition.id}`).expect(200)
    ).body as CompetitionBody;
    expect(detail.isAdmin).toBe(true);
    expect(detail.participants![0].teamId).toBe(team.id);
  });

  it('rejects a duplicate competition name case-insensitively', async () => {
    const coachA = await newCoach();
    const coachB = await newCoach();

    const name = uniqueName('Coastal Cup');
    await createCompetition(coachA.agent, name);

    // Same name, different case, different team — still a conflict.
    await coachB.agent
      .post('/competitions')
      .send({ name: name.toUpperCase(), type: 'cup' })
      .expect(409);
  });

  it('lets the admin add an unlinked participant slot', async () => {
    const { agent } = await newCoach();
    const competition = await createCompetition(
      agent,
      uniqueName('Inland League'),
    );

    const added = await agent
      .post(`/competitions/${competition.id}/teams`)
      .send({ displayName: 'Riverside FC' })
      .expect(201);

    expect(added.body as CompetitionTeamBody).toMatchObject({
      displayName: 'Riverside FC',
      teamId: null,
    });

    const detail = (
      await agent.get(`/competitions/${competition.id}`).expect(200)
    ).body as CompetitionBody;
    expect(detail.participants).toHaveLength(2);
  });

  it('creates one shared session for each newly generated competition fixture when enabled', async () => {
    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    try {
      const { agent, team, user } = await newCoach();
      const competition = (
        await agent
          .post('/competitions')
          .send({
            name: uniqueName('Shared Session League'),
            type: 'league',
            format: 'league',
            configuredTeamCount: 2,
            startDate: '2027-01-01',
            allowedPlayingDays: [6],
          })
          .expect(201)
      ).body as CompetitionBody;
      await agent
        .post(`/competitions/${competition.id}/teams`)
        .send({ displayName: uniqueName('Session Opponent') })
        .expect(201);

      const fixtures = (
        await agent
          .post(`/competitions/${competition.id}/fixtures/generate`)
          .send({})
          .expect(201)
      ).body as Array<{
        id: string;
        sharedSessionId: string | null;
        homeCompetitionTeamId: string;
        awayCompetitionTeamId: string;
        scheduledAt: string;
      }>;
      expect(fixtures).toHaveLength(1);
      expect(fixtures[0].sharedSessionId).toEqual(expect.any(String));

      const again = (
        await agent.get(`/competitions/${competition.id}/fixtures`).expect(200)
      ).body as Array<{ id: string; sharedSessionId: string | null }>;
      expect(again.map((fixture) => fixture.sharedSessionId)).toEqual([
        fixtures[0].sharedSessionId,
      ]);

      const database = app.get(DatabaseService).database;
      const fixture = fixtures[0];
      const [ownParticipant] = await database
        .select({ id: competitionTeams.id })
        .from(competitionTeams)
        .where(eq(competitionTeams.teamId, team.id))
        .limit(1);
      const isHome = fixture.homeCompetitionTeamId === ownParticipant.id;
      const opponentCompetitionTeamId = isHome
        ? fixture.awayCompetitionTeamId
        : fixture.homeCompetitionTeamId;
      const [event] = await database
        .select({ id: events.id })
        .from(events)
        .where(eq(events.competitionFixtureId, fixture.id))
        .limit(1);
      expect(event).toBeDefined();
      await database
        .update(events)
        .set({ status: 'completed' })
        .where(eq(events.id, event.id));
      const [existingMatch] = await database
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.eventId, event.id))
        .limit(1);
      const [match] = existingMatch
        ? [existingMatch]
        : await database
            .insert(matches)
            .values({
              eventId: event.id,
              sharedMatchId: fixture.sharedSessionId!,
              competitionId: competition.id,
              opponentCompetitionTeamId,
              opponentName: 'Session Opponent',
              isHome,
            })
            .returning({ id: matches.id });
      await database.execute(
        sql`select refresh_match_projection(${match.id}::uuid)`,
      );
      await database
        .update(matchSessions)
        .set({
          homeConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
          homeConfirmedByUserId: user.id,
        })
        .where(eq(matchSessions.id, fixture.sharedSessionId!));
      const report = await agent.get(`/matches/${match.id}`).expect(200);
      const projection = (
        report.body as {
          projection: {
            finalisationState: string;
            confirmedTeamScore: number;
            confirmedOpponentScore: number;
          };
        }
      ).projection;
      expect(projection.finalisationState).toBe('finalised');
      const input = {
        homeCompetitionTeamId: fixture.homeCompetitionTeamId,
        awayCompetitionTeamId: fixture.awayCompetitionTeamId,
        homeScore: isHome
          ? projection.confirmedTeamScore
          : projection.confirmedOpponentScore,
        awayScore: isHome
          ? projection.confirmedOpponentScore
          : projection.confirmedTeamScore,
      };
      await syncFixtureResult(
        app.get(DatabaseService),
        competition.id,
        {
          kind: 'live',
          id: match.id,
          sessionId: fixture.sharedSessionId!,
        },
        input,
      );
      await syncFixtureResult(
        app.get(DatabaseService),
        competition.id,
        {
          kind: 'live',
          id: match.id,
          sessionId: fixture.sharedSessionId!,
        },
        input,
      );
      const detail = (
        await agent.get(`/competitions/${competition.id}`).expect(200)
      ).body as {
        results: Array<{
          linkedMatchId: string | null;
          homeScore: number;
          awayScore: number;
        }>;
        standings: Array<{ played: number }>;
      };
      expect(detail.results).toHaveLength(1);
      expect(detail.results[0]).toMatchObject({
        linkedMatchId: match.id,
        homeScore: input.homeScore,
        awayScore: input.awayScore,
      });
      expect(
        detail.standings.reduce((played, row) => played + row.played, 0),
      ).toBe(2);
      await database
        .update(matchSessions)
        .set({
          finalisedByUserId: null,
          homeConfirmedByUserId: null,
          awayConfirmedByUserId: null,
        })
        .where(eq(matchSessions.id, fixture.sharedSessionId!));
    } finally {
      if (previousFlag === undefined) {
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      } else {
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
      }
    }
  });

  it('keeps double round-robin legs as separate sessions and standings results', async () => {
    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    try {
      const coach = await newCoach('release-double-leg');
      const competition = (
        await coach.agent
          .post('/competitions')
          .send({
            name: uniqueName('Release Double Leg'),
            type: 'league',
            format: 'league',
            configuredTeamCount: 2,
            fixturesPerOpponent: 2,
            startDate: '2027-01-01',
            allowedPlayingDays: [6],
          })
          .expect(201)
      ).body as CompetitionBody & { participants: CompetitionTeamBody[] };
      await coach.agent
        .post(`/competitions/${competition.id}/teams`)
        .send({ displayName: uniqueName('Return Opponent') })
        .expect(201);
      const fixtures = (
        await coach.agent
          .post(`/competitions/${competition.id}/fixtures/generate`)
          .send({})
          .expect(201)
      ).body as FixtureBody[];
      expect(fixtures).toHaveLength(2);
      expect(new Set(fixtures.map((fixture) => fixture.id)).size).toBe(2);
      expect(
        new Set(fixtures.map((fixture) => fixture.sharedSessionId)).size,
      ).toBe(2);
      expect(
        fixtures.every((fixture) => Boolean(fixture.sharedSessionId)),
      ).toBe(true);
      expect(fixtures[1].homeCompetitionTeamId).toBe(
        fixtures[0].awayCompetitionTeamId,
      );
      expect(fixtures[1].awayCompetitionTeamId).toBe(
        fixtures[0].homeCompetitionTeamId,
      );
      const database = app.get(DatabaseService).database;
      for (const fixture of fixtures) {
        const fixtureEvents = await database
          .select({ id: events.id, teamId: events.teamId })
          .from(events)
          .where(eq(events.competitionFixtureId, fixture.id));
        const ownParticipant = competition.participants.find(
          (row) => row.teamId === coach.team.id,
        );
        for (const event of fixtureEvents) {
          await database
            .update(events)
            .set({ status: 'completed' })
            .where(eq(events.id, event.id));
          await database.insert(matches).values({
            eventId: event.id,
            competitionId: competition.id,
            sharedMatchId: fixture.sharedSessionId,
            opponentName: 'Return Opponent',
            isHome: fixture.homeCompetitionTeamId === ownParticipant!.id,
          });
        }
        await database
          .update(competitionFixtures)
          .set({ status: 'completed', homeScore: 2, awayScore: 1 })
          .where(eq(competitionFixtures.id, fixture.id));
      }
      const detail = (
        await coach.agent.get(`/competitions/${competition.id}`).expect(200)
      ).body as CompetitionResultBody;
      expect(detail.results).toHaveLength(2);
      for (const fixture of fixtures) {
        expect(detail.results).toContainEqual(
          expect.objectContaining({
            homeCompetitionTeamId: fixture.homeCompetitionTeamId,
            awayCompetitionTeamId: fixture.awayCompetitionTeamId,
            homeScore: 2,
            awayScore: 1,
          }),
        );
      }
      expect(detail.standings.map((row) => row.played)).toEqual([2, 2]);
    } finally {
      if (previousFlag === undefined)
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      else process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
    }
  }, 120_000);

  it('starts both generated fixture sheets from separate coaches and records their session identity', async () => {
    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    try {
      const homeCoach = await newCoach('s3-two-account-home');
      const awayCoach = await newCoach('s3-two-account-away');
      const competition = (
        await homeCoach.agent
          .post('/competitions')
          .send({
            name: uniqueName('Two Account Generated Fixture'),
            type: 'league',
            format: 'league',
            configuredTeamCount: 2,
            startDate: '2027-01-01',
            allowedPlayingDays: [6],
          })
          .expect(201)
      ).body as CompetitionBody;
      const added = (
        await homeCoach.agent
          .post(`/competitions/${competition.id}/teams`)
          .send({ displayName: awayCoach.team.name })
          .expect(201)
      ).body as CompetitionTeamBody;
      const database = app.get(DatabaseService).database;
      await database
        .update(competitionTeams)
        .set({ teamId: awayCoach.team.id })
        .where(eq(competitionTeams.id, added.id));

      const fixtures = (
        await homeCoach.agent
          .post(`/competitions/${competition.id}/fixtures/generate`)
          .send({})
          .expect(201)
      ).body as Array<{
        id: string;
        homeCompetitionTeamId: string;
        awayCompetitionTeamId: string;
      }>;
      expect(fixtures).toHaveLength(1);
      const fixture = fixtures[0];
      const homeParticipant = competition.participants!.find(
        (participant) => participant.teamId === homeCoach.team.id,
      )!;
      await database
        .update(competitionFixtures)
        .set({ scheduledAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
        .where(eq(competitionFixtures.id, fixture.id));
      await database
        .update(competitionFixtures)
        .set({
          scheduleConfirmedAt: new Date(),
          homeScheduleResponse: 'external_confirmed',
          awayScheduleResponse: 'external_confirmed',
        })
        .where(eq(competitionFixtures.id, fixture.id));

      const fixtureEvents = await database
        .select({ id: events.id, teamId: events.teamId })
        .from(events)
        .where(eq(events.competitionFixtureId, fixture.id));
      expect(fixtureEvents.map((row) => row.teamId).sort()).toEqual(
        [homeCoach.team.id, awayCoach.team.id].sort(),
      );
      const now = new Date();
      await database
        .update(events)
        .set({ scheduledAt: new Date(now.getTime() - 24 * 60 * 60 * 1000) })
        .where(eq(events.competitionFixtureId, fixture.id));
      const [homeEvent] = fixtureEvents.filter(
        (event) => event.teamId === homeCoach.team.id,
      );
      const [awayEvent] = fixtureEvents.filter(
        (event) => event.teamId === awayCoach.team.id,
      );
      const homeAthletes = await database
        .insert(athletes)
        .values(
          Array.from({ length: 11 }, (_, index) => ({
            teamId: homeCoach.team.id,
            firstName: `Home${index}`,
            lastName: 'Fixture Player',
          })),
        )
        .returning({ id: athletes.id });
      const awayAthletes = await database
        .insert(athletes)
        .values(
          Array.from({ length: 11 }, (_, index) => ({
            teamId: awayCoach.team.id,
            firstName: `Away${index}`,
            lastName: 'Fixture Player',
          })),
        )
        .returning({ id: athletes.id });
      await homeCoach.agent
        .put(`/events/${homeEvent.id}/lineup`)
        .send({
          startingAthleteIds: homeAthletes.map((row) => row.id),
          formationId: '4-3-3',
        })
        .expect(200);
      await awayCoach.agent
        .put(`/events/${awayEvent.id}/lineup`)
        .send({
          startingAthleteIds: awayAthletes.map((row) => row.id),
          formationId: '4-4-2',
        })
        .expect(200);
      const start = async (
        agent: ReturnType<typeof request.agent>,
        eventId: string,
        athleteIds: string[],
        opponentCompetitionTeamId: string,
        isHome: boolean,
      ) => {
        const response = await agent
          .post(`/events/${eventId}/start-match`)
          .send({
            opponentName: 'generated opponent',
            opponentCompetitionTeamId,
            isHome,
            startingAthleteIds: athleteIds,
          })
          .expect(201);
        return response.body as { id: string; sharedMatchId: string | null };
      };
      const homeStart = {
        opponentName: 'generated opponent',
        opponentCompetitionTeamId: fixture.awayCompetitionTeamId,
        isHome: fixture.homeCompetitionTeamId === homeParticipant.id,
        startingAthleteIds: homeAthletes.map((row) => row.id),
      };
      const homeStartedBeforeActivation = await homeCoach.agent
        .post(`/events/${homeEvent.id}/start-match`)
        .send(homeStart)
        .expect(201);
      const homeSheetBeforeActivation = homeStartedBeforeActivation.body as {
        id: string;
        sharedMatchId: string | null;
      };
      expect(homeSheetBeforeActivation.sharedMatchId).toBeNull();
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
      const awaySheet = await start(
        awayCoach.agent,
        awayEvent.id,
        awayAthletes.map((row) => row.id),
        fixture.homeCompetitionTeamId,
        fixture.homeCompetitionTeamId === homeParticipant.id,
      );
      const homeSheet = await homeCoach.agent
        .post(`/events/${homeEvent.id}/start-match`)
        .send({ ...homeStart, isHome: !homeStart.isHome })
        .expect(201)
        .then((response) => response.body as typeof homeSheetBeforeActivation);

      const opponentLineup = await homeCoach.agent
        .get(`/events/${homeEvent.id}/opponent-lineup`)
        .expect(200);
      expect(opponentLineup.body).toMatchObject({
        available: true,
        formation: '4-4-2',
        starters: expect.arrayContaining([
          { name: 'Away0 Fixture Player', shirtNumber: null },
        ]) as unknown,
        bench: [],
      });
      expect(Object.keys(opponentLineup.body as object).sort()).toEqual(
        ['available', 'bench', 'formation', 'starters'].sort(),
      );

      const identity = {
        fixtureId: fixture.id,
        eventIds: [homeEvent.id, awayEvent.id],
        sheetIds: [homeSheet.id, awaySheet.id],
        sessionIds: [homeSheet.sharedMatchId, awaySheet.sharedMatchId],
      };
      expect({
        ...identity,
        distinctSheetIds: homeSheet.id !== awaySheet.id,
        bothSessionIdsPresent: identity.sessionIds.every(Boolean),
        sameSessionId: identity.sessionIds[0] === identity.sessionIds[1],
      }).toMatchObject({
        fixtureId: fixture.id,
        eventIds: [homeEvent.id, awayEvent.id],
        sheetIds: [homeSheet.id, awaySheet.id],
        sessionIds: [expect.any(String), expect.any(String)],
        distinctSheetIds: true,
        bothSessionIdsPresent: true,
        sameSessionId: true,
      });
      const persistedSides = await Promise.all(
        [homeEvent.id, awayEvent.id].map(async (eventId) => {
          const [row] = await database
            .select({ eventId: matches.eventId, isHome: matches.isHome })
            .from(matches)
            .where(eq(matches.eventId, eventId));
          return row;
        }),
      );
      expect(persistedSides).toEqual(
        expect.arrayContaining([
          { eventId: homeEvent.id, isHome: true },
          { eventId: awayEvent.id, isHome: false },
        ]),
      );
      await homeCoach.agent
        .post(`/matches/${homeSheet.id}/events`)
        .send({
          clientRequestId: randomUUID(),
          team: 'own',
          eventType: 'goal',
          athleteId: homeAthletes[0].id,
          minute: 7,
          period: 'first_half',
          matchElapsedMs: 7 * 60_000,
        })
        .expect(201);
      const reportUrl = `/matches/sessions/${homeSheet.sharedMatchId}/report`;
      await homeCoach.agent
        .patch(`/matches/${homeSheet.id}/clock`)
        .send({
          operationId: randomUUID(),
          baseRevision: 0,
          clientCreatedAt: new Date().toISOString(),
          period: 'first_half',
          running: false,
          elapsedMs: 7 * 60_000,
        })
        .expect(200);
      const [homeReport, awayReport] = await Promise.all([
        homeCoach.agent.get(reportUrl).expect(200),
        awayCoach.agent.get(reportUrl).expect(200),
      ]);
      expect(homeReport.body).toEqual(awayReport.body);
      expect(homeReport.body).toMatchObject({
        sessionId: homeSheet.sharedMatchId,
        score: { home: 1, away: 0 },
        clock: { period: 'first_half', elapsedMs: 7 * 60_000, running: false },
        finalStatus: 'open',
        timeline: expect.arrayContaining([
          expect.objectContaining({ side: 'home', eventType: 'goal' }),
        ]) as unknown,
      });
      expect(Object.keys(homeReport.body as object).sort()).toEqual(
        [
          'sessionId',
          'participants',
          'score',
          'clock',
          'finalStatus',
          'finalisedAt',
          'confirmations',
          'timeline',
          'reviews',
        ].sort(),
      );
      expect(JSON.stringify(homeReport.body)).not.toMatch(
        /gamePlan|eventNotes|squad|position|payload|athleteId|injuryNotes/,
      );
      const outsider = await newCoach('s5-outsider');
      await outsider.agent.get(reportUrl).expect(404);
      await outsider.agent
        .get(`/matches/${homeSheet.id}/session-report`)
        .expect(404);
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
      await homeCoach.agent.get(reportUrl).expect(404);
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
      const [homeRetry, awayRetry] = await Promise.all([
        start(
          homeCoach.agent,
          homeEvent.id,
          homeAthletes.map((row) => row.id),
          fixture.awayCompetitionTeamId,
          fixture.homeCompetitionTeamId !== homeParticipant.id,
        ),
        start(
          awayCoach.agent,
          awayEvent.id,
          awayAthletes.map((row) => row.id),
          fixture.homeCompetitionTeamId,
          fixture.homeCompetitionTeamId === homeParticipant.id,
        ),
      ]);
      expect([homeRetry.id, awayRetry.id]).toEqual([
        homeSheet.id,
        awaySheet.id,
      ]);
      expect([homeRetry.sharedMatchId, awayRetry.sharedMatchId]).toEqual([
        homeSheet.sharedMatchId,
        homeSheet.sharedMatchId,
      ]);
      const [homeAlias, awayAlias] = await Promise.all([
        homeCoach.agent
          .get(`/matches/${homeSheet.id}/session-report`)
          .expect(200),
        awayCoach.agent
          .get(`/matches/${awaySheet.id}/session-report`)
          .expect(200),
      ]);
      expect(homeAlias.body).toEqual(awayAlias.body);
      await awayCoach.agent
        .post(`/matches/${awaySheet.id}/events`)
        .send({
          clientRequestId: randomUUID(),
          team: 'opponent',
          eventType: 'goal',
          opponentLabel: 'Home scorer',
          minute: 7,
          period: 'first_half',
          matchElapsedMs: 7 * 60_000,
        })
        .expect(201);
      const openReviewReport = await homeCoach.agent.get(reportUrl).expect(200);
      expect((openReviewReport.body as SessionReport).reviews).toHaveLength(1);
      expect((openReviewReport.body as SessionReport).reviews[0].status).toBe(
        'open',
      );
      await homeCoach.agent
        .post(
          `/matches/${homeSheet.id}/event-reviews/${(openReviewReport.body as SessionReport).reviews[0].id}/resolve`,
        )
        .send({ resolution: 'same_event' })
        .expect(201);
      const [homeResolved, awayResolved] = await Promise.all([
        homeCoach.agent.get(reportUrl).expect(200),
        awayCoach.agent.get(reportUrl).expect(200),
      ]);
      expect(homeResolved.body).toEqual(awayResolved.body);
      expect((homeResolved.body as SessionReport).timeline).toHaveLength(1);
      expect((homeResolved.body as SessionReport).reviews[0]).toMatchObject({
        status: 'resolved',
        resolution: 'same_event',
      });
      expect((homeResolved.body as SessionReport).score).toEqual({
        home: 1,
        away: 0,
      });
      await homeCoach.agent.post(`/matches/${homeSheet.id}/finish`).expect(201);
      const finishedReport = await awayCoach.agent.get(reportUrl).expect(200);
      expect(finishedReport.body).toMatchObject({
        clock: { period: 'full_time', running: false },
        finalStatus: 'awaiting_confirmation',
      });
      await database
        .update(events)
        .set({ status: 'completed' })
        .where(eq(events.competitionFixtureId, fixture.id));
      await database
        .update(competitionFixtures)
        .set({ status: 'completed', homeScore: 3, awayScore: 1 })
        .where(eq(competitionFixtures.id, fixture.id));
      const standingsDetail = (
        await homeCoach.agent.get(`/competitions/${competition.id}`).expect(200)
      ).body as {
        results: Array<{
          homeCompetitionTeamId: string;
          awayCompetitionTeamId: string;
          homeScore: number;
          awayScore: number;
        }>;
        standings: Array<{ played: number }>;
      };
      expect(standingsDetail.results).toEqual([
        expect.objectContaining({
          homeCompetitionTeamId: fixture.homeCompetitionTeamId,
          awayCompetitionTeamId: fixture.awayCompetitionTeamId,
          homeScore: 3,
          awayScore: 1,
        }),
      ]);
      expect(
        standingsDetail.standings.reduce(
          (played, row) => played + row.played,
          0,
        ),
      ).toBe(2);
      await database
        .update(matchSessions)
        .set({
          homeConfirmedAt: new Date(),
          awayConfirmedAt: new Date(),
          finalisedAt: new Date(),
        })
        .where(eq(matchSessions.id, homeSheet.sharedMatchId!));
      const [homeFinal, awayFinal] = await Promise.all([
        homeCoach.agent.get(reportUrl).expect(200),
        awayCoach.agent.get(reportUrl).expect(200),
      ]);
      expect(homeFinal.body).toEqual(awayFinal.body);
      const [homePrivate, awayPrivate] = await Promise.all([
        homeCoach.agent.get(`/matches/${homeSheet.id}`).expect(200),
        awayCoach.agent.get(`/matches/${awaySheet.id}`).expect(200),
      ]);
      frontendReportCase = {
        home: homePrivate.body as MatchRecord,
        away: awayPrivate.body as MatchRecord,
        report: homeFinal.body as SessionReport,
      };
      expect(homeFinal.body).toMatchObject({
        finalStatus: 'finalised',
        score: { home: 3, away: 1 },
      });
      await database
        .delete(teamMembers)
        .where(eq(teamMembers.userId, awayCoach.user.id));
      await awayCoach.agent.get(reportUrl).expect(403);
      await awayCoach.agent
        .get(`/matches/${awaySheet.id}/session-report`)
        .expect(403);
    } finally {
      if (previousFlag === undefined) {
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      } else {
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
      }
    }
  }, 180_000);

  it('rejects a duplicate participant display name case-insensitively', async () => {
    const { agent } = await newCoach();
    const competition = await createCompetition(
      agent,
      uniqueName('Metro League'),
    );

    await agent
      .post(`/competitions/${competition.id}/teams`)
      .send({ displayName: 'Riverside FC' })
      .expect(201);

    await agent
      .post(`/competitions/${competition.id}/teams`)
      .send({ displayName: 'riverside fc' })
      .expect(409);
  });

  it("rejects mutations by a non-admin, even a participant team's coach", async () => {
    const admin = await newCoach();
    const other = await newCoach();

    const competition = await createCompetition(
      admin.agent,
      uniqueName('Guardian League'),
    );

    // Another coach cannot edit, delete or manage participants.
    await other.agent
      .patch(`/competitions/${competition.id}`)
      .send({ name: uniqueName('Hijacked') })
      .expect(404);
    await other.agent.delete(`/competitions/${competition.id}`).expect(404);
    await other.agent
      .post(`/competitions/${competition.id}/teams`)
      .send({ displayName: 'Intruder FC' })
      .expect(404);
  });

  it('refuses to remove the admin team and removes other slots', async () => {
    const { agent, team } = await newCoach();
    const competition = await createCompetition(
      agent,
      uniqueName('Founders Cup'),
    );
    const founding = competition.participants!.find(
      (p) => p.teamId === team.id,
    )!;

    await agent
      .delete(`/competitions/${competition.id}/teams/${founding.id}`)
      .expect(403);

    const added = (
      await agent
        .post(`/competitions/${competition.id}/teams`)
        .send({ displayName: 'Riverside FC' })
        .expect(201)
    ).body as CompetitionTeamBody;

    await agent
      .delete(`/competitions/${competition.id}/teams/${added.id}`)
      .expect(200);

    const detail = (
      await agent.get(`/competitions/${competition.id}`).expect(200)
    ).body as CompetitionBody;
    expect(detail.participants).toHaveLength(1);
  });

  it('lists "mine" from participant membership, not teamId ownership', async () => {
    const admin = await newCoach();
    const name = uniqueName('Shared Trophy');

    // A legacy-path competition created through the statistics endpoints also
    // gains its participant row, so it shows up for its own coach.
    const legacy = await admin.agent
      .post('/statistics/competitions')
      .send({ name: uniqueName('Legacy Shield'), type: 'cup' })
      .expect(201);

    const created = await createCompetition(admin.agent, name);

    // An unrelated coach sees nothing.
    const outsider = await newCoach();
    expect(
      (await outsider.agent.get('/competitions/mine').expect(200)).body,
    ).toHaveLength(0);

    const mine = (await admin.agent.get('/competitions/mine').expect(200))
      .body as CompetitionSummaryBody[];

    const ids = mine.map((c) => c.id);
    expect(ids).toContain(created.id);
    expect(ids).toContain((legacy.body as CompetitionBody).id);
    expect(mine.find((c) => c.id === created.id)?.isAdmin).toBe(true);
    expect(mine.find((c) => c.id === created.id)?.participantCount).toBe(1);
  });

  it('searches by name without granting membership and hides private emails', async () => {
    const admin = await newCoach();
    const name = uniqueName('Searchable League');
    await createCompetition(admin.agent, name);

    const other = await newCoach();
    const results = (
      await other.agent
        .get(`/competitions/search?q=${encodeURIComponent(name)}`)
        .expect(200)
    ).body as CompetitionSummaryBody[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe(name);
    expect(results[0].isAdmin).toBe(false); // searchable but not theirs
    expect(JSON.stringify(results)).not.toContain('@example.com');

    // Seeing it in search does not make it "mine".
    expect(
      (await other.agent.get('/competitions/mine').expect(200)).body,
    ).toHaveLength(0);

    // Detail is readable but carries no admin powers.
    const detail = (
      await other.agent.get(`/competitions/${results[0].id}`).expect(200)
    ).body as CompetitionBody;
    expect(detail.isAdmin).toBe(false);
    expect(JSON.stringify(detail)).not.toContain('@example.com');
  });

  it('lets the admin rename and delete the competition', async () => {
    const { agent } = await newCoach();
    const competition = await createCompetition(agent, uniqueName('Renamable'));

    const renamed = await agent
      .patch(`/competitions/${competition.id}`)
      .send({ name: uniqueName('Renamed') })
      .expect(200);
    expect((renamed.body as CompetitionBody).isAdmin).toBe(true);

    await agent.delete(`/competitions/${competition.id}`).expect(200);
    await agent.get(`/competitions/${competition.id}`).expect(404);
  });
  it('Step 5(b): frontend reports and synced cache keys use the canonical session report', () => {
    expect(frontendReportCase).toBeDefined();
    const { home, away, report } = frontendReportCase!;
    const homeView = applySessionReport(home, report);
    const awayView = applySessionReport(away, report);
    expect(home.id).not.toBe(away.id);
    expect(sessionReportKey(home.sharedSessionId!)).toEqual(
      sessionReportKey(away.sharedSessionId!),
    );
    expect(homeView.teamScore).toBe(awayView.opponentScore);
    expect(homeView.opponentScore).toBe(awayView.teamScore);
    expect(homeView.clockPeriod).toBe(awayView.clockPeriod);
    expect(homeView.projection?.finalisationState).toBe('finalised');
    expect(awayView.projection?.finalisationState).toBe('finalised');
    expect(
      sessionTimeline(report, home).map((row) => [
        row.id,
        row.side,
        row.minute,
      ]),
    ).toEqual(
      sessionTimeline(report, away).map((row) => [
        row.id,
        row.side,
        row.minute,
      ]),
    );
    expect(homeView.gamePlanSnapshot).toEqual(home.gamePlanSnapshot);
    expect(awayView.eventNotes).toEqual(away.eventNotes);
    expect(
      sessionTimeline(report, home).every((row) => row.detail === null),
    ).toBe(true);
  });
});
