import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import type { Agent } from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
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
});
