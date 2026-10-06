import { INestApplication } from '@nestjs/common';
import { Test as NestTest } from '@nestjs/testing';
import type { App } from 'supertest/types';
import type { Test as HttpTest } from 'supertest';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import * as s from '../src/database/schema';
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

describe('Phase 2 real PostgreSQL and HTTP', () => {
  let app: INestApplication<App>;
  let db: DatabaseService['database'];
  let home: Coach;
  let away: Coach;
  const evidence: Record<string, unknown> = { http: {} };
  const responses: Record<string, unknown> = {};
  const livePowerSync = process.env.PHASE2_LIVE_POWERSYNC === 'true';
  const previousEnv = { ...process.env };
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const configured = new URL(process.env.TEST_DATABASE_URL!);
    expect(url.hostname).toBe(configured.hostname);
    expect(url.pathname).toBe(configured.pathname);
    // Normal integration runs verify locally signed tokens without Cloud credentials.
    // Live deployment probes remain available through an explicit opt-in.
    if (!livePowerSync) {
      process.env.POWERSYNC_URL = 'https://powersync.example.test';
      process.env.POWERSYNC_KID = 'integration-test';
      process.env.POWERSYNC_SHARED_SECRET = Buffer.from(
        'phase2-integration-test-only',
      ).toString('base64');
      delete process.env.POWERSYNC_PRIVATE_KEY;
    }
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    process.env.OFFLINE_SYNC_ENABLED = 'true';
    const module = await NestTest.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DatabaseService).database;
    await checkIdentity();
    home = await coach('phase2-home');
    away = await coach('phase2-away');
  }, 120000);
  beforeEach(async () => {
    await checkIdentity();
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
  });
  afterAll(async () => {
    evidence.http = responses;
    if (process.env.PHASE2_EVIDENCE_DIR)
      writeFileSync(
        resolve(
          process.env.PHASE2_EVIDENCE_DIR,
          process.env.PHASE2_EVIDENCE_NAME ?? 'http-evidence.json',
        ),
        JSON.stringify(evidence, null, 2),
      );
    // Retain only this suite's fresh synthetic fixtures for reviewer SQL inspection.
    await app?.close();
    process.env = previousEnv;
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
        title: 'phase2 fresh friendly',
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
        name: 'phase2 ' + randomUUID(),
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
        opponentSquadVisibility: 'numbers',
        opponentSquad: [{ shirtNumber: 1 }],
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

  it('verifies fresh coach JWT claims and signatures, with optional live PowerSync authentication', async () => {
    const tokens: unknown[] = [];
    for (const c of [home, away]) {
      const response = await c.agent.get('/sync/token').expect(200);
      const credentials = response.body as { token: string; endpoint: string };
      const token = credentials.token;
      const [encodedHeader, encodedClaims, signature] = token.split('.');
      const header = JSON.parse(
        Buffer.from(encodedHeader, 'base64url').toString(),
      ) as unknown;
      const claims = JSON.parse(
        Buffer.from(encodedClaims, 'base64url').toString(),
      ) as Record<string, unknown>;
      expect(claims).toMatchObject({
        sub: c.user.id,
        user_id: c.user.id,
        team_id: c.team.id,
        team_role: 'coach',
        two_sided_live_logging: 'true',
      });
      const safeClaims = Object.fromEntries(
        [
          'sub',
          'user_id',
          'team_id',
          'team_role',
          'two_sided_live_logging',
          'iss',
          'aud',
          'iat',
          'exp',
        ].map((key) => [key, claims[key] ?? null]),
      );
      const entry: Record<string, unknown> = { header, claims: safeClaims };
      tokens.push(entry);
      if (!livePowerSync) {
        expect(signature).toBe(
          createHmac(
            'sha256',
            Buffer.from(process.env.POWERSYNC_SHARED_SECRET!, 'base64'),
          )
            .update(`${encodedHeader}.${encodedClaims}`)
            .digest('base64url'),
        );
        continue;
      }
      try {
        const syncResponse = await fetch(
          `${credentials.endpoint}/sync/stream`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/x-ndjson',
            },
            body: JSON.stringify({
              buckets: [],
              include_checksum: true,
              raw_data: true,
            }),
            signal: AbortSignal.timeout(30000),
          },
        );
        entry.status = syncResponse.status;
        if (syncResponse.ok) {
          entry.authenticated = true;
          await syncResponse.body?.cancel();
        } else {
          entry.authenticated = false;
          entry.body = await syncResponse.json();
        }
      } catch (error) {
        entry.networkFailure = { name: (error as Error).name };
      }
    }
    evidence.auth = tokens;
  }, 120000);

  it.each(['friendly', 'competition'] as const)(
    '%s: real linked HTTP clocks, reviews, privacy and third-team rejection',
    async (kind) => {
      const f = kind === 'friendly' ? await friendly() : await competition();
      const a = await start(home, f.homeEvent, `${kind}-home-start`);
      const b = await start(away, f.awayEvent, `${kind}-away-start`);
      expect(a.id).not.toBe(b.id);
      expect(a.sharedMatchId).toBeTruthy();
      expect(a.sharedMatchId).toBe(b.sharedMatchId);
      for (const [c, eventId] of [
        [home, f.homeEvent],
        [away, f.awayEvent],
      ] as const)
        expect(
          await diagnose(c, eventId, `${kind}-${eventId}-diagnostic`),
        ).toMatchObject({
          status: 'correctly_linked',
          sheetSessionMatchesFixture: true,
        });
      const clockEvidence: unknown[] = [];
      for (const [c, sheet, side] of [
        [home, a, 'home'],
        [away, b, 'away'],
      ] as const) {
        for (const [period, running, elapsedMs] of [
          ['first_half', true, 0],
          ['first_half', false, 60000],
          ['first_half', true, 60000],
          ['half_time', false, 2700000],
          ['second_half', true, 2700000],
          ['full_time', false, 5400000],
        ] as const) {
          const input = {
            operationId: randomUUID(),
            clientCreatedAt: new Date().toISOString(),
            baseRevision: 0,
            period,
            running,
            elapsedMs,
          };
          for (const retry of [false, true]) {
            const response = await c.agent
              .patch(`/matches/${sheet.id}/clock`)
              .send(input);
            const safeBody = response.body as {
              clockPeriod?: string;
              clockRevision?: number;
            };
            const [operation] = await db
              .select()
              .from(s.matchClockOperations)
              .where(eq(s.matchClockOperations.id, input.operationId));
            clockEvidence.push({
              method: 'PATCH',
              path: `/api/matches/${sheet.id}/clock`,
              status: response.status,
              matchId: sheet.id,
              sessionId: sheet.sharedMatchId,
              side,
              retry,
              operationId: operation?.id,
              revision: operation?.appliedRevision,
              outcome: operation?.outcome,
              body:
                response.status === 200
                  ? {
                      clockPeriod: safeBody.clockPeriod,
                      clockRevision: safeBody.clockRevision,
                    }
                  : (response.body as unknown),
            });
            evidence[`${kind}Clock`] = clockEvidence;
            expect(response.status).toBe(200);
            expect(operation.sessionId).toBe(a.sharedMatchId);
          }
        }
      }
      const privateDetail = 'private tactical and medical detail';
      const ownGoal = {
        clientRequestId: randomUUID(),
        team: 'own',
        eventType: 'goal',
        athleteId: home.athletes[0],
        minute: 5,
        period: 'first_half',
        matchElapsedMs: 300000,
        detail: privateDetail,
      };
      await http(
        'goal-' + a.id,
        home.agent.post(`/matches/${a.id}/events`).send(ownGoal),
        201,
      );
      // A separate internal opponent identity deliberately differs from the
      // originating side's athlete ID. The matcher must use actual side/time.
      const [opponent] = await db
        .select()
        .from(s.opponentMatchPlayers)
        .where(eq(s.opponentMatchPlayers.matchId, b.id));
      const peerGoal = {
        clientRequestId: randomUUID(),
        team: 'opponent',
        eventType: 'goal',
        opponentPlayerId: opponent.id,
        minute: 5,
        period: 'first_half',
        matchElapsedMs: 301000,
        detail: privateDetail,
      };
      await http(
        'goal-' + b.id,
        away.agent.post(`/matches/${b.id}/events`).send(peerGoal),
        201,
      );
      const reviewsA = await http<
        {
          id: string;
          observations: {
            matchId: string;
            payload: unknown;
            athleteId: string | null;
            opponentPlayerId: string | null;
          }[];
        }[]
      >(
        'review-home-' + a.id,
        home.agent.get(`/matches/${a.id}/event-reviews`),
        200,
      );
      const reviewsB = await http<typeof reviewsA>(
        'review-away-' + b.id,
        away.agent.get(`/matches/${b.id}/event-reviews`),
        200,
      );
      expect(reviewsA).toHaveLength(1);
      expect(reviewsB[0].id).toBe(reviewsA[0].id);
      expect(
        reviewsB[0].observations.find((row) => row.matchId === a.id),
      ).toMatchObject({
        athleteId: null,
        opponentPlayerId: null,
        payload: null,
      });
      await http(
        'resolve-' + a.id,
        home.agent
          .post(`/matches/${a.id}/event-reviews/${reviewsA[0].id}/resolve`)
          .send({ resolution: 'same_event' }),
        201,
      );
      const resolved = await http<{ status: string }[]>(
        'resolved-peer-' + b.id,
        away.agent.get(`/matches/${b.id}/event-reviews`),
        200,
      );
      expect(resolved[0].status).toBe('resolved');
      await http(
        'dispute-' + b.id,
        away.agent.post(
          `/matches/${b.id}/event-reviews/${reviewsA[0].id}/dispute`,
        ),
        201,
      );
      await http(
        'injury-' + a.id,
        home.agent.post(`/matches/${a.id}/events`).send({
          clientRequestId: randomUUID(),
          team: 'own',
          eventType: 'injury',
          athleteId: home.athletes[0],
          minute: 8,
          detail: privateDetail,
        }),
        201,
      );
      const peerEvents = await http<
        { eventType: string; detail: string | null; athleteId: string | null }[]
      >('peer-events-' + a.id, away.agent.get(`/matches/${a.id}/events`), 200);
      expect(
        peerEvents.every(
          (row) =>
            row.eventType !== 'injury' &&
            row.detail === null &&
            row.athleteId === null,
        ),
      ).toBe(true);
      const report = await http<{ timeline: { eventType: string }[] }>(
        'report-' + b.id,
        away.agent.get(`/matches/${b.id}/session-report`),
        200,
      );
      expect(report.timeline.every((row) => row.eventType !== 'injury')).toBe(
        true,
      );
      const outsider = await coach('phase2-outsider');
      await http(
        'outsider-events-' + a.id,
        outsider.agent.get(`/matches/${a.id}/events`),
        404,
      );
      await http(
        'outsider-report-' + a.id,
        outsider.agent.get(`/matches/${a.id}/session-report`),
        404,
      );
      evidence[kind] = {
        fixtureId: f.fixtureId,
        matchA: a.id,
        matchB: b.id,
        sessionId: a.sharedMatchId,
        duplicateReviewId: reviewsA[0].id,
        differentPlayerIds: true,
        actualBrowserReceipt:
          'NOT TESTED: Cloud authentication/source configuration blocker',
      };
    },
    240000,
  );

  it('reproduces clock operation ID reuse and checks intentional client conflict handling', async () => {
    const f = await friendly();
    const a = await start(home, f.homeEvent, 'clock-conflict-start');
    const input = {
      operationId: randomUUID(),
      clientCreatedAt: new Date().toISOString(),
      baseRevision: 0,
      period: 'first_half',
      running: true,
      elapsedMs: 0,
    };
    await http(
      'clock-conflict-original',
      home.agent.patch(`/matches/${a.id}/clock`).send(input),
      200,
    );
    await http(
      'clock-conflict-reuse',
      home.agent
        .patch(`/matches/${a.id}/clock`)
        .send({ ...input, running: false }),
      409,
    );
  });

  it('serialises concurrent linked clock updates from both coaches without 500s', async () => {
    const f = await friendly();
    const a = await start(home, f.homeEvent, 'concurrent-home-start');
    const b = await start(away, f.awayEvent, 'concurrent-away-start');
    const inputs = [
      { coach: home, sheet: a, side: 'home', running: true },
      { coach: home, sheet: a, side: 'home', running: false },
      { coach: away, sheet: b, side: 'away', running: true },
      { coach: away, sheet: b, side: 'away', running: false },
    ].map((entry) => ({
      ...entry,
      input: {
        operationId: randomUUID(),
        clientCreatedAt: new Date().toISOString(),
        baseRevision: 0,
        period: 'first_half',
        elapsedMs: 1000,
        running: entry.running,
      },
    }));
    const results = await Promise.all(
      inputs.map(async (entry) => {
        const response = await entry.coach.agent
          .patch(`/matches/${entry.sheet.id}/clock`)
          .send(entry.input);
        const [operation] = await db
          .select()
          .from(s.matchClockOperations)
          .where(eq(s.matchClockOperations.id, entry.input.operationId));
        return {
          method: 'PATCH',
          path: `/api/matches/${entry.sheet.id}/clock`,
          status: response.status,
          matchId: entry.sheet.id,
          sessionId: entry.sheet.sharedMatchId,
          side: entry.side,
          operationId: operation?.id,
          revision: operation?.appliedRevision,
          outcome: operation?.outcome,
          body:
            response.status === 200
              ? { accepted: true }
              : (response.body as unknown),
        };
      }),
    );
    evidence.concurrentClocks = results;
    for (const result of results) {
      expect(result.status).toBe(200);
      expect(result.operationId).toBeTruthy();
      expect(result.sessionId).toBe(a.sharedMatchId);
    }
  }, 90000);

  it('denies a revoked member on shared and private HTTP reads and selects zero rows with their old claims', async () => {
    const f = await friendly();
    const peerSheet = await start(home, f.homeEvent, 'revocation-home-start');
    const ownSheet = await start(away, f.awayEvent, 'revocation-away-start');
    const tokenResponse = await away.agent.get('/sync/token').expect(200);
    const credentials = tokenResponse.body as { token: string };
    const claims = JSON.parse(
      Buffer.from(credentials.token.split('.')[1], 'base64url').toString(),
    ) as Record<string, string>;
    await db
      .delete(s.teamMembers)
      .where(eq(s.teamMembers.userId, away.user.id));
    await http(
      'revoked-peer-events',
      away.agent.get(`/matches/${peerSheet.id}/events`),
      403,
    );
    await http(
      'revoked-own-report',
      away.agent.get(`/matches/${ownSheet.id}/session-report`),
      403,
    );
    await http(
      'revoked-private-sheet',
      away.agent.get(`/matches/${ownSheet.id}`),
      403,
    );
    const config = readFileSync(
      resolve(__dirname, '../../powersync/sync-config.yaml'),
      'utf8',
    );
    const selections: Record<string, number> = {};
    for (const match of config.matchAll(/^ {2}([a-z_]+):/gm)) {
      const name = match[1];
      const block = config.split(`  ${name}:`)[1].split(/\n {2}[a-z_]+:/)[0];
      const query = block.split(/query:\s*\|\s*\n/)[1];
      if (!query) continue;
      const selected = await db.execute(
        sql.raw(
          query
            .replace(/^\s*#.*$/gm, '')
            .replace(
              /auth\.parameter\('([^']+)'\)/g,
              (_whole, key: string) => `'${claims[key].replaceAll("'", "''")}'`,
            ),
        ),
      );
      selections[name] = selected.rows.length;
      expect({ name, count: selected.rows.length }).toEqual({ name, count: 0 });
    }
    evidence.revocation = {
      userId: away.user.id,
      teamId: away.team.id,
      oldClaimsUsed: true,
      selections,
      httpDenied: true,
      cloudRevocation: 'NOT TESTED: token already rejected by Cloud',
    };
  }, 120000);
});
