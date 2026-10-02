import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Agent } from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import {
  matchEventMemberships,
  matchEventObservations,
  matchEvents,
} from '../src/database/schema';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUsers,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

describe('Offline collaborative sync (e2e)', () => {
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

  async function createLiveMatch(
    agent: Agent,
    isHome = true,
    capturedAthleteIds?: string[],
  ) {
    const athleteIds: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const athlete = await agent
        .post('/athletes')
        .send({ firstName: `Offline${index}`, lastName: 'Test' })
        .expect(201);
      athleteIds.push((athlete.body as { id: string }).id);
    }
    capturedAthleteIds?.push(...athleteIds);
    const event = await agent
      .post('/events')
      .send({
        title: 'Concurrent offline observations',
        type: 'match',
        scheduledAt: new Date(Date.now() + 60_000).toISOString(),
        location: 'Test field',
      })
      .expect(201);
    const started = await agent
      .post(`/events/${(event.body as { id: string }).id}/start-match`)
      .send({
        opponentName: 'Concurrency FC',
        isHome,
        startingAthleteIds: athleteIds,
      })
      .expect(201);
    return (started.body as { id: string }).id;
  }

  it('reconciles session observations idempotently across match sheets', async () => {
    const identity = uniqueTestIdentity('session-reconcile');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);
    const homeAthleteIds: string[] = [];
    const homeMatchId = await createLiveMatch(agent, true, homeAthleteIds);
    const awayMatchId = await createLiveMatch(agent, false);
    const database = app.get(DatabaseService).database;
    const matchesResult = await database.execute<{
      id: string;
      team_id: string;
    }>(sql`select match.id, event.team_id from matches match
      join events event on event.id = match.event_id
      where match.id in (${homeMatchId}::uuid, ${awayMatchId}::uuid)`);
    const teamId = matchesResult.rows[0]?.team_id;
    expect(teamId).toBeDefined();
    const sessionResult = await database.execute<{ id: string }>(sql`
      insert into match_sessions default values returning id`);
    const sessionId = sessionResult.rows[0].id;
    await database.execute(sql`
      update matches set opponent_squad_visibility = 'numbers'
      where id = ${awayMatchId}::uuid`);
    const opponentPlayerResult = await database.execute<{ id: string }>(sql`
      insert into opponent_match_players (match_id, shirt_number, name)
      values (${awayMatchId}::uuid, 9, 'Home observer player') returning id`);
    const opponentPlayerId = opponentPlayerResult.rows[0].id;
    await database.execute(sql`
      insert into match_session_participants (session_id, team_id, side)
      values (${sessionId}::uuid, ${teamId}::uuid, 'home'),
             (${sessionId}::uuid, ${teamId}::uuid, 'away')`);
    await database.execute(sql`
      update matches set shared_match_id = ${sessionId}::uuid
      where id in (${homeMatchId}::uuid, ${awayMatchId}::uuid)`);

    const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    try {
      const firstId = randomUUID();
      const secondId = randomUUID();
      const observation = (
        matchId: string,
        id: string,
        team: 'own' | 'opponent',
        elapsedMs: number,
        minute: number,
        playerId?: string,
      ) => ({
        kind: 'observation',
        matchId,
        payload: {
          clientRequestId: id,
          deviceId: randomUUID(),
          clientCreatedAt: new Date().toISOString(),
          period: 'first_half',
          matchElapsedMs: elapsedMs,
          team,
          eventType: 'goal',
          ...(team === 'own' && playerId ? { athleteId: playerId } : {}),
          ...(team === 'opponent' && playerId
            ? { opponentPlayerId: playerId }
            : team === 'opponent'
              ? { opponentLabel: 'Home number 9' }
              : {}),
          minute,
        },
      });
      const first = observation(
        homeMatchId,
        firstId,
        'own',
        720_000,
        12,
        homeAthleteIds[0],
      );
      const second = observation(
        awayMatchId,
        secondId,
        'opponent',
        722_000,
        12,
        opponentPlayerId,
      );
      const [firstUpload, secondUpload] = await Promise.all([
        agent
          .post('/sync/upload')
          .send({ items: [first] })
          .expect(201),
        agent
          .post('/sync/upload')
          .send({ items: [second] })
          .expect(201),
      ]);
      expect(firstUpload.body.receipts[0].outcome).toBe('accepted');
      expect(secondUpload.body.receipts[0].outcome).toBe('accepted');
      await agent
        .post('/sync/upload')
        .send({ items: [second] })
        .expect(201);

      const observationRows = await database.execute<{
        id: string;
        session_id: string;
        side: string;
      }>(sql`select id, session_id, side from match_event_observations
        where id in (${firstId}::uuid, ${secondId}::uuid) order by id`);
      expect(observationRows.rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: firstId,
            session_id: sessionId,
            side: 'home',
          }),
          expect.objectContaining({
            id: secondId,
            session_id: sessionId,
            side: 'home',
          }),
        ]),
      );
      const candidateRows = await database.execute<{
        id: string;
        match_id: string;
        observation_ids: string[];
        status: string;
      }>(sql`select id, match_id, observation_ids, status from match_event_reviews
        where session_id = ${sessionId}::uuid and review_version = 2`);
      expect(candidateRows.rows).toHaveLength(1);
      expect(candidateRows.rows[0].status).toBe('open');
      expect(candidateRows.rows[0].observation_ids).toEqual(
        [firstId, secondId].sort(),
      );
      const actorResult = await database.execute<{
        logged_by_user_id: string;
      }>(sql`
        select logged_by_user_id from match_event_observations
        where id = ${firstId}::uuid`);
      const mergeOperationId = randomUUID();
      const resolveSameEvent = () =>
        database.execute<{ canonical_event_id: string }>(sql`
        select resolve_match_session_event_candidate(
          ${candidateRows.rows[0].id}::uuid,
          ${candidateRows.rows[0].match_id}::uuid,
          ${sessionId}::uuid,
          ${actorResult.rows[0].logged_by_user_id}::text,
          ${mergeOperationId}::uuid,
          'same_event'::text,
          '[]'::jsonb
        ) as canonical_event_id`);
      const merged = await resolveSameEvent();
      const mergedRetry = await resolveSameEvent();
      expect(mergedRetry.rows[0].canonical_event_id).toBe(
        merged.rows[0].canonical_event_id,
      );
      const mergeOperation = await database.execute<{ session_id: string }>(sql`
        select session_id from match_event_operations
        where id = ${mergeOperationId}::uuid`);
      expect(mergeOperation.rows[0].session_id).toBe(sessionId);
      const mergedMemberships = await database.execute<{
        canonical_event_id: string;
      }>(sql`
        select canonical_event_id from match_event_memberships
        where observation_id in (${firstId}::uuid, ${secondId}::uuid)
        order by observation_id`);
      expect(mergedMemberships.rows[0].canonical_event_id).toBe(
        mergedMemberships.rows[1].canonical_event_id,
      );

      const distinctGoalId = randomUUID();
      const distinctGoal = observation(
        awayMatchId,
        distinctGoalId,
        'opponent',
        750_000,
        12,
        opponentPlayerId,
      );
      await agent
        .post('/sync/upload')
        .send({ items: [distinctGoal] })
        .expect(201);
      const afterDistinctGoal = await database.execute<{ count: string }>(sql`
        select count(*)::text as count from match_event_reviews
        where session_id = ${sessionId}::uuid and review_version = 2`);
      expect(afterDistinctGoal.rows[0].count).toBe('1');

      const separateIds = [randomUUID(), randomUUID()];
      await Promise.all([
        agent
          .post('/sync/upload')
          .send({
            items: [
              observation(homeMatchId, separateIds[0], 'own', 1_200_000, 20),
            ],
          })
          .expect(201),
        agent
          .post('/sync/upload')
          .send({
            items: [
              observation(
                awayMatchId,
                separateIds[1],
                'opponent',
                1_202_000,
                20,
                opponentPlayerId,
              ),
            ],
          })
          .expect(201),
      ]);
      const separateReviewResult = await database.execute<{
        id: string;
        match_id: string;
      }>(sql`select id, match_id from match_event_reviews
        where session_id = ${sessionId}::uuid and status = 'open'
          and review_version = 2`);
      expect(separateReviewResult.rows).toHaveLength(1);
      const separateOperationId = randomUUID();
      const resolveSeparateEvents = () =>
        database.execute<{ canonical_event_id: string }>(sql`
        select resolve_match_session_event_candidate(
          ${separateReviewResult.rows[0].id}::uuid,
          ${separateReviewResult.rows[0].match_id}::uuid,
          ${sessionId}::uuid,
          ${actorResult.rows[0].logged_by_user_id}::text,
          ${separateOperationId}::uuid,
          'separate_events'::text,
          '[]'::jsonb
        ) as canonical_event_id`);
      const separated = await resolveSeparateEvents();
      const separatedRetry = await resolveSeparateEvents();
      expect(separatedRetry.rows[0].canonical_event_id).toBe(
        separated.rows[0].canonical_event_id,
      );
      const separateMemberships = await database.execute<{
        canonical_event_id: string;
      }>(sql`
        select canonical_event_id from match_event_memberships
        where observation_id in (${separateIds[0]}::uuid, ${separateIds[1]}::uuid)
        order by observation_id`);
      expect(separateMemberships.rows[0].canonical_event_id).not.toBe(
        separateMemberships.rows[1].canonical_event_id,
      );
    } finally {
      if (previousFlag === undefined) {
        delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
      } else {
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
      }
    }
  });

  it('serialises concurrent ingestion and safely retries a lost response', async () => {
    const identity = uniqueTestIdentity('offline-sync');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);
    const matchId = await createLiveMatch(agent);
    const ids = [randomUUID(), randomUUID()];
    const item = (id: string, elapsed: number) => ({
      kind: 'observation',
      matchId,
      payload: {
        clientRequestId: id,
        deviceId: randomUUID(),
        clientCreatedAt: new Date().toISOString(),
        period: 'first_half',
        matchElapsedMs: elapsed,
        team: 'opponent',
        eventType: 'goal',
        opponentLabel: 'Number 9',
        minute: 12,
      },
    });
    const payloads = [item(ids[0], 720_000), item(ids[1], 723_000)];

    const responses = await Promise.all(
      payloads.map((payload) =>
        agent
          .post('/sync/upload')
          .send({ items: [payload] })
          .expect(201),
      ),
    );
    expect(
      responses.map(
        (response) =>
          (response.body as { receipts: Array<{ outcome: string }> })
            .receipts[0].outcome,
      ),
    ).toEqual(['accepted', 'accepted']);

    const retry = await agent
      .post('/sync/upload')
      .send({ items: [payloads[0]] })
      .expect(201);
    expect(
      (retry.body as { receipts: Array<{ outcome: string }> }).receipts[0]
        .outcome,
    ).toBe('accepted');

    const events = await agent.get(`/matches/${matchId}/events`).expect(200);
    expect(events.body).toHaveLength(2);
    const canonical = (
      events.body as Array<{ id: string; lifecycleStatus: string }>
    ).find((row) => row.id === [...ids].sort()[0])!;
    expect(canonical.lifecycleStatus).toBe('needs_review');
    const reviews = await agent
      .get(`/matches/${matchId}/event-reviews`)
      .expect(200);
    expect(
      (reviews.body as Array<{ status: string; observations: unknown[] }>).some(
        (review) =>
          review.status === 'open' && review.observations.length === 2,
      ),
    ).toBe(true);

    const changed = structuredClone(payloads[0]);
    changed.payload.minute = 13;
    const conflict = await agent
      .post('/sync/upload')
      .send({ items: [changed] })
      .expect(201);
    expect(
      (
        conflict.body as {
          receipts: Array<{ outcome: string; safeErrorCode: string }>;
        }
      ).receipts[0],
    ).toMatchObject({ outcome: 'rejected', safeErrorCode: 'ID_REUSED' });

    const parentId = randomUUID();
    const dependentId = randomUUID();
    const dependent = {
      kind: 'operation',
      id: dependentId,
      matchId,
      operationType: 'void',
      canonicalEventId: canonical.id,
      reason: 'Dependency ordering test',
      causalParentIds: [parentId],
    };
    const pending = await agent
      .post('/sync/upload')
      .send({ items: [dependent] })
      .expect(201);
    expect(
      (pending.body as { receipts: Array<{ outcome: string }> }).receipts[0]
        .outcome,
    ).toBe('dependency_pending');

    await agent
      .post('/sync/upload')
      .send({
        items: [
          {
            kind: 'operation',
            id: parentId,
            matchId,
            operationType: 'correct',
            canonicalEventId: canonical.id,
            replacement: { minute: 12 },
            causalParentIds: [],
          },
        ],
      })
      .expect(201)
      .expect(({ body }) => {
        expect(
          (body as { receipts: Array<{ outcome: string }> }).receipts[0]
            .outcome,
        ).toBe('accepted');
      });
    const retried = await agent
      .post('/sync/upload')
      .send({ items: [dependent] })
      .expect(201);
    expect(
      (retried.body as { receipts: Array<{ outcome: string }> }).receipts[0]
        .outcome,
    ).toBe('accepted');

    const duplicateReview = (
      reviews.body as Array<{
        id: string;
        status: string;
        observations: unknown[];
      }>
    ).find(
      (review) => review.status === 'open' && review.observations.length === 2,
    );
    expect(duplicateReview).toBeDefined();
    await agent
      .post(`/matches/${matchId}/event-reviews/${duplicateReview!.id}/resolve`)
      .send({ resolution: 'same_event' })
      .expect(201);
    const merged = await agent.get(`/matches/${matchId}/events`).expect(200);
    expect(merged.body).toHaveLength(0);

    const closeGoals = [
      item(randomUUID(), 900_000),
      item(randomUUID(), 903_000),
    ];
    for (const goal of closeGoals) {
      await agent
        .post('/sync/upload')
        .send({ items: [goal] })
        .expect(201);
    }
    const beforeSplit = await agent
      .get(`/matches/${matchId}/events`)
      .expect(200);
    expect(beforeSplit.body).toHaveLength(2);
    const allReviews = await agent
      .get(`/matches/${matchId}/event-reviews`)
      .expect(200);
    const closeReview = (
      allReviews.body as Array<{
        id: string;
        status: string;
        observations: Array<{ id: string }>;
      }>
    ).find(
      (review) =>
        review.status === 'open' &&
        closeGoals.every((goal) =>
          review.observations.some(
            (observation) => observation.id === goal.payload.clientRequestId,
          ),
        ),
    );
    expect(closeReview).toBeDefined();
    await agent
      .post(`/matches/${matchId}/event-reviews/${closeReview!.id}/resolve`)
      .send({ resolution: 'separate_events' })
      .expect(201);
    const separate = await agent.get(`/matches/${matchId}/events`).expect(200);
    expect(separate.body).toHaveLength(2);
  }, 90_000);

  it('rolls back every reconciliation write when processing fails mid-transaction', async () => {
    const identity = uniqueTestIdentity('offline-rollback');
    identities.push(identity);
    const { agent, user } = await registerCoach(app.getHttpServer(), identity);
    const matchId = await createLiveMatch(agent);
    const observationId = randomUUID();
    const payload = {
      team: 'own',
      eventType: 'goal',
      period: 'first_half',
      matchElapsedMs: 120_000,
      __testFailure: 'after_membership',
    };
    const database = app.get(DatabaseService).database;

    await database.execute(
      sql.raw(`
      CREATE OR REPLACE FUNCTION gaffer_test_fail_after_membership()
      RETURNS trigger LANGUAGE plpgsql AS $test_failure$
      DECLARE v_payload jsonb;
      BEGIN
        SELECT payload INTO v_payload FROM match_event_observations
         WHERE id = NEW.observation_id;
        IF v_payload ->> '__testFailure' = 'after_membership' THEN
          RAISE EXCEPTION 'injected failure after membership';
        END IF;
        RETURN NEW;
      END;
      $test_failure$
    `),
    );
    await database.execute(
      sql.raw(`
      DROP TRIGGER IF EXISTS gaffer_test_fail_after_membership_trigger
        ON match_event_memberships
    `),
    );
    await database.execute(
      sql.raw(`
      CREATE TRIGGER gaffer_test_fail_after_membership_trigger
      AFTER INSERT ON match_event_memberships
      FOR EACH ROW EXECUTE FUNCTION gaffer_test_fail_after_membership()
    `),
    );
    try {
      await expect(
        database.execute(sql`select ingest_match_event_observation(
          ${observationId}::uuid,
          ${matchId}::uuid,
          ${randomUUID()}::uuid,
          ${user.id}::text,
          ${'goal'}::match_event_type,
          ${'own'}::match_event_team,
          ${null}::uuid,
          ${null}::text,
          ${null}::uuid,
          ${'first_half'}::text,
          ${120_000}::integer,
          ${2}::integer,
          ${null}::text,
          ${JSON.stringify(payload)}::jsonb,
          ${'injected-failure-payload'}::text,
          ${new Date().toISOString()}::timestamptz,
          ${false}::boolean
        )`),
      ).rejects.toThrow();
    } finally {
      await database.execute(
        sql.raw(`
        DROP TRIGGER IF EXISTS gaffer_test_fail_after_membership_trigger
          ON match_event_memberships
      `),
      );
      await database.execute(
        sql.raw(`
        DROP FUNCTION IF EXISTS gaffer_test_fail_after_membership()
      `),
      );
    }

    const [observations, memberships, canonicalEvents] = await Promise.all([
      database
        .select({ id: matchEventObservations.id })
        .from(matchEventObservations)
        .where(eq(matchEventObservations.id, observationId)),
      database
        .select({ id: matchEventMemberships.observationId })
        .from(matchEventMemberships)
        .where(eq(matchEventMemberships.observationId, observationId)),
      database
        .select({ id: matchEvents.id })
        .from(matchEvents)
        .where(eq(matchEvents.clientRequestId, observationId)),
    ]);
    expect(observations).toHaveLength(0);
    expect(memberships).toHaveLength(0);
    expect(canonicalEvents).toHaveLength(0);
  }, 90_000);

  it('records clock changes once in the immutable operation ledger', async () => {
    const identity = uniqueTestIdentity('clock-ledger');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);
    const matchId = await createLiveMatch(agent);
    const operationId = randomUUID();
    const command = {
      operationId,
      baseRevision: 0,
      clientCreatedAt: new Date().toISOString(),
      period: 'first_half',
      running: true,
      elapsedMs: 15_000,
    };

    const first = await agent
      .patch(`/matches/${matchId}/clock`)
      .send(command)
      .expect(200);
    expect((first.body as { clockRevision: number }).clockRevision).toBe(1);

    const retry = await agent
      .patch(`/matches/${matchId}/clock`)
      .send(command)
      .expect(200);
    expect((retry.body as { clockRevision: number }).clockRevision).toBe(1);

    const operations = await agent
      .get(`/matches/${matchId}/clock-operations`)
      .expect(200);
    expect(operations.body).toEqual([
      expect.objectContaining({
        id: operationId,
        matchId,
        baseRevision: 0,
        appliedRevision: 1,
        outcome: 'applied',
        period: 'first_half',
        running: true,
        elapsedMs: 15_000,
      }),
    ]);
  }, 90_000);
});
