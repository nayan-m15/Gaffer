import { INestApplication } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import type { App } from 'supertest/types';
import type { Test as HttpTest } from 'supertest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import * as s from '../src/database/schema';
import { syncFixtureResult } from '../src/competitions/competition-fixture-results';
import { registerCoach } from './utils/auth-helpers';
import { uniqueTestIdentity } from './utils/test-db';

type Coach = Awaited<ReturnType<typeof registerCoach>> & { athletes: string[] };
type Sheet = typeof s.matches.$inferSelect;
type Event = { id: string; friendlyFixtureId: string };
type Competition = {
  id: string;
  participants: { id: string; teamId: string }[];
  results: { homeScore: number; awayScore: number }[];
  standings: { played: number; goalsFor: number }[];
};

describe('Phase 1.5 real PostgreSQL + authenticated HTTP', () => {
  let app: INestApplication<App>;
  let db: DatabaseService['database'];
  let home: Coach;
  let away: Coach;
  const evidence: Record<string, unknown> = { http: {} };
  const responses: Record<string, unknown> = {};
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const configured = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.hostname).toBe(configured.hostname);
    expect(url.pathname).toBe(configured.pathname);
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    process.env.OFFLINE_SYNC_ENABLED = 'true';
    const module = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DatabaseService).database;
    await checkIdentity();
    home = await coach('phase15-home');
    away = await coach('phase15-away');
  }, 120000);
  beforeEach(async () => {
    await checkIdentity();
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
  });
  afterAll(async () => {
    evidence.http = responses;
    if (process.env.PHASE15_EVIDENCE_DIR)
      writeFileSync(
        resolve(process.env.PHASE15_EVIDENCE_DIR, 'http-evidence.json'),
        JSON.stringify(evidence, null, 2),
      );
    // Retain only this suite's fresh synthetic fixtures for reviewer SQL inspection.
    await app?.close();
  });
  async function checkIdentity() {
    const result = await db.execute<{ database: string }>(
      sql`select current_database() as database`,
    );
    expect(result.rows[0]).toEqual({
      database: decodeURIComponent(
        new URL(process.env.TEST_DATABASE_URL!).pathname.slice(1),
      ),
    });
  }
  async function http<T>(
    name: string,
    req: HttpTest,
    status: number,
  ): Promise<T> {
    const response = await req;
    responses[name] = {
      status: response.status,
      body: response.body as unknown,
    };
    expect(response.status).toBe(status);
    return response.body as T;
  }
  async function coach(prefix: string): Promise<Coach> {
    const c = await registerCoach(
      app.getHttpServer(),
      uniqueTestIdentity(prefix),
    );
    const athletes = await db
      .insert(s.athletes)
      .values(
        Array.from({ length: 11 }, (_, i) => ({
          teamId: c.team.id,
          firstName: `${prefix}${i}`,
          lastName: 'Synthetic',
        })),
      )
      .returning({ id: s.athletes.id });
    return { ...c, athletes: athletes.map((a) => a.id) };
  }
  const scheduledAt = () => new Date(Date.now() - 86400000).toISOString();
  async function friendly() {
    const event = await http<Event>(
      'friendly-create-' + randomUUID(),
      home.agent.post('/events').send({
        title: 'Phase15 fresh friendly',
        type: 'match',
        scheduledAt: scheduledAt(),
        location: 'Synthetic ground',
        friendlyOpponentTeamId: away.team.id,
      }),
      201,
    );
    const accepted = await http<{ event: Event }>(
      'friendly-accept-' + event.id,
      away.agent.post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`),
      201,
    );
    return {
      fixtureId: event.friendlyFixtureId,
      homeEvent: event.id,
      awayEvent: accepted.event.id,
    };
  }
  async function competition() {
    const c = await http<Competition>(
      'competition-create-' + randomUUID(),
      home.agent.post('/competitions').send({
        name: 'Phase15 ' + randomUUID(),
        type: 'league',
        format: 'league',
        configuredTeamCount: 2,
        startDate: '2027-01-01',
        allowedPlayingDays: [6],
      }),
      201,
    );
    const slot = await http<{ id: string }>(
      'competition-slot-' + c.id,
      home.agent
        .post(`/competitions/${c.id}/teams`)
        .send({ displayName: away.team.name }),
      201,
    );
    await db
      .update(s.competitionTeams)
      .set({ teamId: away.team.id })
      .where(eq(s.competitionTeams.id, slot.id));
    const fixtures = await http<(typeof s.competitionFixtures.$inferSelect)[]>(
      'competition-generate-' + c.id,
      home.agent.post(`/competitions/${c.id}/fixtures/generate`).send({}),
      201,
    );
    expect(fixtures).toHaveLength(1);
    const f = fixtures[0];
    await db
      .update(s.competitionFixtures)
      .set({ scheduledAt: new Date(scheduledAt()) })
      .where(eq(s.competitionFixtures.id, f.id));
    await db
      .update(s.competitionFixtures)
      .set({
        scheduleConfirmedAt: new Date(),
        homeScheduleResponse: 'external_confirmed',
        awayScheduleResponse: 'external_confirmed',
      })
      .where(eq(s.competitionFixtures.id, f.id));
    await db
      .update(s.events)
      .set({ scheduledAt: new Date(scheduledAt()) })
      .where(eq(s.events.competitionFixtureId, f.id));
    const events = await db
      .select()
      .from(s.events)
      .where(eq(s.events.competitionFixtureId, f.id));
    return {
      competitionId: c.id,
      fixtureId: f.id,
      homeEvent: events.find((e) => e.teamId === home.team.id)!.id,
      awayEvent: events.find((e) => e.teamId === away.team.id)!.id,
      fixture: f,
    };
  }
  function start(coach: Coach, eventId: string, name: string) {
    return http<Sheet>(
      name,
      coach.agent.post(`/events/${eventId}/start-match`).send({
        opponentName: 'Synthetic opponent',
        isHome: coach === away,
        startingAthleteIds: coach.athletes,
      }),
      201,
    );
  }
  async function diagnose(coach: Coach, eventId: string, name: string) {
    return http<Record<string, unknown>>(
      name,
      coach.agent.get(`/events/${eventId}/link-diagnostic`),
      200,
    );
  }
  const goal = (minute = 1) => ({
    clientRequestId: randomUUID(),
    team: 'opponent',
    eventType: 'goal',
    minute,
    period: 'first_half',
    matchElapsedMs: minute * 60000,
  });
  async function sheet(id: string) {
    return (await db.select().from(s.matches).where(eq(s.matches.id, id)))[0];
  }
  async function counts(id: string) {
    return (
      await db.execute(
        sql`select (select count(*)::int from match_event_observations where match_id=${id}::uuid) as observations, (select count(*)::int from match_events where match_id=${id}::uuid) as events, (select count(*)::int from match_event_reviews where match_id=${id}::uuid) as reviews`,
      )
    ).rows[0];
  }
  async function identity(kind: 'friendly' | 'competition') {
    const f = kind === 'friendly' ? await friendly() : await competition();
    const a = await start(home, f.homeEvent, kind + '-home-start');
    const b = await start(away, f.awayEvent, kind + '-away-start');
    expect(a.id).not.toBe(b.id);
    expect(a.sharedMatchId).toBeTruthy();
    expect(a.sharedMatchId).toBe(b.sharedMatchId);
    expect(a.isHome).toBe(true);
    expect(b.isHome).toBe(false);
    const fixture =
      kind === 'friendly'
        ? (
            await db
              .select()
              .from(s.friendlyFixtures)
              .where(eq(s.friendlyFixtures.id, f.fixtureId))
          )[0]
        : (
            await db
              .select()
              .from(s.competitionFixtures)
              .where(eq(s.competitionFixtures.id, f.fixtureId))
          )[0];
    expect(fixture.sharedSessionId).toBe(a.sharedMatchId);
    const participants = await db
      .select()
      .from(s.matchSessionParticipants)
      .where(eq(s.matchSessionParticipants.sessionId, a.sharedMatchId!));
    expect(
      participants.map((p) => ({ teamId: p.teamId, side: p.side })),
    ).toEqual(
      expect.arrayContaining([
        { teamId: home.team.id, side: 'home' },
        { teamId: away.team.id, side: 'away' },
      ]),
    );
    const sessionCountBefore = (
      await db.execute(
        sql`select count(distinct session_id)::int as count from match_session_participants where team_id in (${home.team.id}::uuid, ${away.team.id}::uuid)`,
      )
    ).rows[0];
    for (const [c, eventId, m] of [
      [home, f.homeEvent, a],
      [away, f.awayEvent, b],
    ] as const) {
      expect(await start(c, eventId, kind + '-retry-' + m.id)).toMatchObject({
        id: m.id,
        sharedMatchId: a.sharedMatchId,
      });
      expect((await sheet(m.id)).sharedMatchId).toBe(fixture.sharedSessionId);
      expect(
        await diagnose(c, eventId, kind + '-diagnostic-' + m.id),
      ).toMatchObject({
        fixtureId: f.fixtureId,
        owningMatchId: m.id,
        status: 'correctly_linked',
        sheetSessionMatchesFixture: true,
        participantSide: c === home ? 'home' : 'away',
      });
    }
    expect(
      (
        await db.execute(
          sql`select count(distinct session_id)::int as count from match_session_participants where team_id in (${home.team.id}::uuid, ${away.team.id}::uuid)`,
        )
      ).rows[0],
    ).toEqual(sessionCountBefore);
    evidence[kind + 'Identity'] = {
      ...f,
      homeMatch: a.id,
      awayMatch: b.id,
      session: a.sharedMatchId,
      participants,
    };
    return { f, a, b };
  }
  it('proves both-account identity and safe/evidence attachment through friendly HTTP', async () => {
    const { f, a } = await identity('friendly');
    expect(await counts(a.id)).toEqual({
      observations: 0,
      events: 0,
      reviews: 0,
    });
    await db
      .update(s.matches)
      .set({ sharedMatchId: null, isHome: false })
      .where(eq(s.matches.id, a.id));
    const attached = await start(home, f.homeEvent, 'safe-attachment');
    expect(attached).toMatchObject({
      id: a.id,
      sharedMatchId: a.sharedMatchId,
      isHome: true,
    });
    expect(
      await diagnose(home, f.homeEvent, 'safe-attachment-diagnostic'),
    ).toMatchObject({
      status: 'correctly_linked',
      sheetSessionMatchesFixture: true,
    });
    const legacy = await friendly();
    const m = await start(home, legacy.homeEvent, 'evidence-initial-start');
    await http(
      'legacy-evidence-seed',
      home.agent.post(`/matches/${m.id}/events`).send(goal()),
      201,
    );
    // Simulate a legacy sheet losing its link after evidence was recorded.
    // Current ingestion correctly rejects new events on an unlinked sheet.
    await db
      .update(s.matches)
      .set({ sharedMatchId: null })
      .where(eq(s.matches.id, m.id));
    const before = await db
      .select()
      .from(s.matchEventObservations)
      .where(eq(s.matchEventObservations.matchId, m.id));
    const rejected = await http<{ code: string }>(
      'evidence-start-rejected',
      home.agent.post(`/events/${legacy.homeEvent}/start-match`).send({
        opponentName: 'Synthetic',
        isHome: true,
        startingAthleteIds: home.athletes,
      }),
      409,
    );
    expect(rejected.code).toBe('SHARED_MATCH_RECONCILIATION_REQUIRED');
    expect((await sheet(m.id)).sharedMatchId).toBeNull();
    expect(
      await db
        .select()
        .from(s.matchEventObservations)
        .where(eq(s.matchEventObservations.matchId, m.id)),
    ).toEqual(before);
    evidence.attachment = {
      safe: attached.id,
      evidence: m.id,
      observationsPreserved: true,
    };
  }, 180000);
  it('rejects null-link online/offline ingestion and invalid publication through real HTTP', async () => {
    const { f, a } = await identity('competition');
    const fixture = async () =>
      (
        await db
          .select()
          .from(s.competitionFixtures)
          .where(eq(s.competitionFixtures.id, f.fixtureId))
      )[0];
    const session = async () =>
      (
        await db
          .select()
          .from(s.matchSessions)
          .where(eq(s.matchSessions.id, a.sharedMatchId!))
      )[0];
    await db
      .update(s.matches)
      .set({ sharedMatchId: null })
      .where(eq(s.matches.id, a.id));
    const beforeFixture = await fixture();
    const beforeSession = await session();
    const beforeResults = await http<Competition>(
      'invalid-before-results',
      home.agent.get(`/competitions/${beforeFixture.competitionId}`),
      200,
    );
    const direct = await http<{ code: string }>(
      'null-direct-ingestion',
      home.agent.post(`/matches/${a.id}/events`).send(goal()),
      409,
    );
    expect(direct.code).toBe('SHARED_MATCH_SESSION_REQUIRED');
    const upload = await http<{
      receipts: { outcome: string; safeErrorCode: string }[];
    }>(
      'null-offline-upload',
      home.agent.post('/sync/upload').send({
        items: [{ kind: 'observation', matchId: a.id, payload: goal() }],
      }),
      201,
    );
    expect(upload.receipts).toHaveLength(1);
    expect(upload.receipts[0]).toMatchObject({
      outcome: 'rejected',
      safeErrorCode: 'SHARED_MATCH_SESSION_REQUIRED',
    });
    expect(await counts(a.id)).toEqual({
      observations: 0,
      events: 0,
      reviews: 0,
    });
    for (const route of ['finish', 'finalise']) {
      const response = await http<{ code: string }>(
        'null-' + route,
        home.agent
          .post(`/matches/${a.id}/${route}`)
          .send({ expectedRevision: 1 }),
        409,
      );
      expect(response.code).toBe('SHARED_MATCH_SESSION_REQUIRED');
    }
    const input = {
      homeCompetitionTeamId: beforeFixture.homeCompetitionTeamId!,
      awayCompetitionTeamId: beforeFixture.awayCompetitionTeamId!,
      homeScore: 0,
      awayScore: 3,
    };
    for (const flag of ['true', 'false']) {
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = flag;
      await expect(
        syncFixtureResult(
          app.get(DatabaseService),
          beforeFixture.competitionId,
          { kind: 'live', id: a.id },
          input,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { code: 'SHARED_MATCH_SESSION_REQUIRED' },
      });
      const finalise = await http<{ code: string }>(
        'null-finalise-flag-' + flag,
        home.agent
          .post(`/matches/${a.id}/finalise`)
          .send({ expectedRevision: 1 }),
        409,
      );
      expect(finalise.code).toBe('SHARED_MATCH_SESSION_REQUIRED');
    }
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    expect(await fixture()).toEqual(beforeFixture);
    expect(await session()).toEqual(beforeSession);
    const afterResults = await http<Competition>(
      'invalid-after-results',
      home.agent.get(`/competitions/${beforeFixture.competitionId}`),
      200,
    );
    expect(afterResults.results).toEqual(beforeResults.results);
    expect(afterResults.results).toHaveLength(0);
    evidence.invalidPublication = {
      beforeFixture,
      afterFixture: await fixture(),
      beforeSession,
      afterSession: await session(),
      resultCount: afterResults.results.length,
      counts: await counts(a.id),
    };
  }, 180000);
  it('publishes exactly one home 2-1 away result after both HTTP confirmations', async () => {
    const f = await competition();
    const a = await start(home, f.homeEvent, 'valid-home-start');
    const b = await start(away, f.awayEvent, 'valid-away-start');
    for (const [c, m, minute] of [
      [home, a, 5],
      [home, a, 25],
      [away, b, 55],
    ] as const)
      await http(
        'valid-goal-' + minute,
        c.agent
          .post(`/matches/${m.id}/events`)
          .send({ ...goal(minute), team: 'own', athleteId: c.athletes[0] }),
        201,
      );
    for (const [c, m] of [
      [home, a],
      [away, b],
    ] as const)
      await http(
        'valid-finish-' + m.id,
        c.agent.post(`/matches/${m.id}/finish`),
        201,
      );
    for (const [c, m] of [
      [home, a],
      [away, b],
    ] as const) {
      const report = await http<{ projection: { revision: number } }>(
        'valid-sheet-report-' + m.id,
        c.agent.get(`/matches/${m.id}`),
        200,
      );
      await http(
        'valid-confirm-' + m.id,
        c.agent
          .post(`/matches/${m.id}/finalise`)
          .send({ expectedRevision: report.projection.revision }),
        201,
      );
    }
    const session = (
      await db
        .select()
        .from(s.matchSessions)
        .where(eq(s.matchSessions.id, a.sharedMatchId!))
    )[0];
    expect(session.homeConfirmedAt).toBeTruthy();
    expect(session.awayConfirmedAt).toBeTruthy();
    expect(session.finalisedAt).toBeTruthy();
    const fixture = (
      await db
        .select()
        .from(s.competitionFixtures)
        .where(eq(s.competitionFixtures.id, f.fixtureId))
    )[0];
    expect(fixture).toMatchObject({
      status: 'completed',
      homeScore: 2,
      awayScore: 1,
    });
    const result = await http<Competition>(
      'valid-competition-results',
      home.agent.get(`/competitions/${f.competitionId}`),
      200,
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ homeScore: 2, awayScore: 1 });
    expect(result.standings.map((row) => row.played)).toEqual([1, 1]);
    expect(result.standings.map((row) => row.goalsFor).sort()).toEqual([1, 2]);
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    for (const [c, m] of [
      [home, a],
      [away, b],
    ] as const) {
      const blocked = await http<{ code: string }>(
        'private-overwrite-blocked-' + m.id,
        c.agent.post(`/matches/${m.id}/finalise`).send({ expectedRevision: 1 }),
        409,
      );
      expect(blocked.code).toBe('SHARED_MATCH_SESSION_REQUIRED');
    }
    expect(
      (
        await db
          .select()
          .from(s.competitionFixtures)
          .where(eq(s.competitionFixtures.id, f.fixtureId))
      )[0],
    ).toEqual(fixture);
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    const canonical = await http(
      'valid-canonical-session-report',
      home.agent.get(`/matches/sessions/${a.sharedMatchId}/report`),
      200,
    );
    evidence.validBilateral = {
      homeMatch: a.id,
      awayMatch: b.id,
      session,
      fixture,
      competitionResults: result.results,
      standings: result.standings,
      canonical,
    };
  }, 180000);
  it('maintains projection identity for insert and both refresh branches, with feature-off/manual regression', async () => {
    const f = await friendly();
    const a = await start(home, f.homeEvent, 'projection-linked-start');
    const projection = async () =>
      (
        await db
          .select()
          .from(s.matchProjectionState)
          .where(eq(s.matchProjectionState.matchId, a.id))
      )[0];
    expect(await projection()).toBeUndefined();
    await http(
      'projection-insert-read',
      home.agent.get(`/matches/${a.id}`),
      200,
    );
    const inserted = await projection();
    expect(inserted.sessionId).toBe(a.sharedMatchId);
    await db
      .update(s.matchProjectionState)
      .set({ sessionId: null })
      .where(eq(s.matchProjectionState.matchId, a.id));
    await http(
      'projection-unchanged-read',
      home.agent.get(`/matches/${a.id}`),
      200,
    );
    const unchanged = await projection();
    expect(unchanged.sessionId).toBe(a.sharedMatchId);
    expect(unchanged.revision).toBe(inserted.revision);
    await db
      .update(s.matchProjectionState)
      .set({ sessionId: null, inputDigest: 'changed-test-digest' })
      .where(eq(s.matchProjectionState.matchId, a.id));
    await http(
      'projection-changed-read',
      home.agent.get(`/matches/${a.id}`),
      200,
    );
    const changed = await projection();
    expect(changed.sessionId).toBe(a.sharedMatchId);
    expect(changed.revision).toBe(inserted.revision + 1);
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    const event = await http<Event>(
      'manual-event',
      home.agent.post('/events').send({
        title: 'Phase15 manual',
        type: 'match',
        scheduledAt: scheduledAt(),
        location: 'Synthetic ground',
      }),
      201,
    );
    const manual = await start(home, event.id, 'manual-start');
    expect(manual.sharedMatchId).toBeNull();
    await http(
      'manual-legacy-goal',
      home.agent.post(`/matches/${manual.id}/events`).send(goal()),
      201,
    );
    const legacy = (
      await db
        .select()
        .from(s.matchProjectionState)
        .where(eq(s.matchProjectionState.matchId, manual.id))
    )[0];
    expect(legacy.sessionId).toBeNull();
    const c = await http<Competition>(
      'legacy-competition-create',
      home.agent
        .post('/competitions')
        .send({ name: 'Phase15 legacy ' + randomUUID(), type: 'league' }),
      201,
    );
    const slot = await http<{ id: string }>(
      'legacy-slot',
      home.agent
        .post(`/competitions/${c.id}/teams`)
        .send({ displayName: 'External legacy opponent' }),
      201,
    );
    await http(
      'legacy-competition-publication',
      home.agent.post(`/competitions/${c.id}/results`).send({
        homeCompetitionTeamId: c.participants[0].id,
        awayCompetitionTeamId: slot.id,
        homeScore: 1,
        awayScore: 0,
        playedAt: scheduledAt(),
      }),
      201,
    );
    const legacyResults = await http<Competition>(
      'legacy-competition-results',
      home.agent.get(`/competitions/${c.id}`),
      200,
    );
    expect(legacyResults.results).toHaveLength(1);
    evidence.projection = {
      inserted,
      unchanged,
      changed,
      legacy,
      legacyCompetitionResults: legacyResults.results,
    };
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
  }, 180000);
});
