import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GeminiClient } from '../src/insights/gemini-client';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUsers,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

type Agent = ReturnType<typeof request.agent>;

interface InsightBody {
  matchId?: string;
  status: 'ready' | 'failed' | 'stale' | 'pending' | 'unavailable';
  narrativeText?: string | null;
}

/** An ISO 8601 datetime `days` in the past, at midday UTC. */
function pastIso(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

/**
 * Insight generation runs fire-and-forget after `POST /finalise` responds
 * (see MatchesService.finaliseProjection), so tests poll briefly rather than
 * assuming it has landed by the time the HTTP response comes back.
 */
async function waitForInsightStatus(
  agent: Agent,
  matchId: string,
  status: InsightBody['status'],
  attempts = 20,
): Promise<InsightBody> {
  for (let i = 0; i < attempts; i += 1) {
    const response = await agent.get(`/matches/${matchId}/insight`).expect(200);
    const body = response.body as InsightBody;
    if (body.status === status) return body;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Insight for ${matchId} never reached status "${status}".`);
}

describe('Match insights (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];
  const mockGeminiClient = { generateNarrative: jest.fn() };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GeminiClient)
      .useValue(mockGeminiClient)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await cleanupUsers(identities);
    await app.close();
  });

  beforeEach(() => {
    mockGeminiClient.generateNarrative.mockReset();
  });

  async function createSquad(agent: Agent): Promise<string[]> {
    const responses = await Promise.all(
      Array.from({ length: 11 }, (_, index) =>
        agent
          .post('/athletes')
          .send({ firstName: `Player${index}`, lastName: `Test${index}` })
          .expect(201),
      ),
    );
    return responses.map((response) => (response.body as { id: string }).id);
  }

  /** Schedules, starts, logs a goal, and finishes a match — but does not finalise it. */
  async function seedFinishedMatch(
    agent: Agent,
    squad: string[],
    opponent: string,
  ): Promise<string> {
    const event = await agent
      .post('/events')
      .send({
        title: `vs ${opponent}`,
        type: 'match',
        scheduledAt: pastIso(1),
        location: 'Main field',
      })
      .expect(201);
    const eventId = (event.body as { id: string }).id;

    const started = await agent.post(`/events/${eventId}/start-match`).send({
      opponentName: opponent,
      isHome: true,
      startingAthleteIds: squad,
    });
    if (started.status !== 201) {
      throw new Error(
        `Starting vs ${opponent} failed with ${started.status}: ${JSON.stringify(started.body)}`,
      );
    }
    const matchId = (started.body as { id: string }).id;

    await agent
      .post(`/matches/${matchId}/events`)
      .send({
        clientRequestId: randomUUID(),
        team: 'own',
        eventType: 'goal',
        athleteId: squad[0],
        minute: 12,
      })
      .expect(201);

    await agent.post(`/matches/${matchId}/finish`).expect(201);
    return matchId;
  }

  async function finalise(agent: Agent, matchId: string) {
    const found = await agent.get(`/matches/${matchId}`).expect(200);
    const revision = (
      found.body as { projection: { revision: number } }
    ).projection.revision;
    await agent
      .post(`/matches/${matchId}/finalise`)
      .send({ expectedRevision: revision })
      .expect(201);
  }

  it('returns "unavailable" before the match is finalised', async () => {
    const identity = uniqueTestIdentity('insights-unavailable');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);
    const squad = await createSquad(agent);
    const matchId = await seedFinishedMatch(agent, squad, 'Rivals FC');

    const response = await agent.get(`/matches/${matchId}/insight`).expect(200);

    expect((response.body as InsightBody).status).toBe('unavailable');
  });

  it('generates a ready insight when a match is finalised', async () => {
    const identity = uniqueTestIdentity('insights-ready');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);
    const squad = await createSquad(agent);
    const matchId = await seedFinishedMatch(agent, squad, 'Rivals FC');
    mockGeminiClient.generateNarrative.mockResolvedValue(
      'A hard-fought win for the home side.',
    );

    await finalise(agent, matchId);

    const insight = await waitForInsightStatus(agent, matchId, 'ready');
    expect(insight.narrativeText).toBe('A hard-fought win for the home side.');
    expect(mockGeminiClient.generateNarrative).toHaveBeenCalledTimes(1);
  });

  it('records a failed status without blocking finalisation when Gemini errors', async () => {
    const identity = uniqueTestIdentity('insights-failed');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);
    const squad = await createSquad(agent);
    const matchId = await seedFinishedMatch(agent, squad, 'Rivals FC');
    mockGeminiClient.generateNarrative.mockRejectedValue(
      new Error('Gemini provider returned 429.'),
    );

    // Finalisation itself must succeed regardless of the Gemini outcome.
    await finalise(agent, matchId);

    const insight = await waitForInsightStatus(agent, matchId, 'failed');
    expect(insight.narrativeText ?? null).toBeNull();
  });

  it('includes recentInsights on the dashboard and statistics overview', async () => {
    const identity = uniqueTestIdentity('insights-overview');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);
    const squad = await createSquad(agent);
    const matchId = await seedFinishedMatch(agent, squad, 'Rivals FC');
    mockGeminiClient.generateNarrative.mockResolvedValue('Great result today.');

    await finalise(agent, matchId);
    await waitForInsightStatus(agent, matchId, 'ready');

    const dashboard = await agent.get('/dashboard').expect(200);
    const dashboardInsights = (
      dashboard.body as { recentInsights: InsightBody[] }
    ).recentInsights;
    expect(dashboardInsights.some((i) => i.matchId === matchId)).toBe(true);

    const statistics = await agent.get('/statistics').expect(200);
    const statisticsInsights = (
      statistics.body as { recentInsights: InsightBody[] }
    ).recentInsights;
    expect(statisticsInsights.some((i) => i.matchId === matchId)).toBe(true);
  });

  it("does not let a coach fetch another team's match insight", async () => {
    const identityA = uniqueTestIdentity('insights-isolation-a');
    const identityB = uniqueTestIdentity('insights-isolation-b');
    identities.push(identityA, identityB);
    const { agent: agentA } = await registerCoach(
      app.getHttpServer(),
      identityA,
    );
    const { agent: agentB } = await registerCoach(
      app.getHttpServer(),
      identityB,
    );
    const squadA = await createSquad(agentA);
    const matchId = await seedFinishedMatch(agentA, squadA, 'Rivals FC');

    await agentB.get(`/matches/${matchId}/insight`).expect(404);
  });
});
