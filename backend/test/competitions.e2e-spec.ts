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
  events,
  matches,
  matchSessions,
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
      expect(report.body.projection.finalisationState).toBe('finalised');
      const input = {
        homeCompetitionTeamId: fixture.homeCompetitionTeamId,
        awayCompetitionTeamId: fixture.awayCompetitionTeamId,
        homeScore: isHome
          ? report.body.projection.confirmedTeamScore
          : report.body.projection.confirmedOpponentScore,
        awayScore: isHome
          ? report.body.projection.confirmedOpponentScore
          : report.body.projection.confirmedTeamScore,
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
});
