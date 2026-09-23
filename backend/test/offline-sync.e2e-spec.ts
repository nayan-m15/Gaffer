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
  cleanupUser,
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
    await Promise.all(identities.map(cleanupUser));
    await app.close();
  });

  async function createLiveMatch(agent: Agent) {
    const athleteIds: string[] = [];
    for (let index = 0; index < 11; index += 1) {
      const athlete = await agent
        .post('/athletes')
        .send({ firstName: `Offline${index}`, lastName: 'Test' })
        .expect(201);
      athleteIds.push((athlete.body as { id: string }).id);
    }
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
        isHome: true,
        startingAthleteIds: athleteIds,
      })
      .expect(201);
    return (started.body as { id: string }).id;
  }

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
    expect(events.body).toHaveLength(1);
    const canonical = (
      events.body as Array<{ id: string; lifecycleStatus: string }>
    )[0];
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
