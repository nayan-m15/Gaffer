import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

describe('Statistics integrity (e2e)', () => {
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

  it('validates a standing PATCH against the complete stored row', async () => {
    const identity = uniqueTestIdentity('statistics-integrity');
    identities.push(identity);
    const { agent } = await registerCoach(app.getHttpServer(), identity);

    const competition = await agent
      .post('/statistics/competitions')
      .send({ name: 'Premier League', type: 'league' })
      .expect(201);
    const competitionId = (competition.body as { id: string }).id;
    const standing = await agent
      .post(`/statistics/competitions/${competitionId}/standings`)
      .send({
        teamName: 'Sporting FC',
        position: 1,
        played: 1,
        won: 1,
        drawn: 0,
        lost: 0,
        goalsFor: 2,
        goalsAgainst: 0,
        points: 3,
        isOwnTeam: true,
      })
      .expect(201);
    const standingId = (standing.body as { id: string }).id;

    await agent
      .patch(`/statistics/standings/${standingId}`)
      .send({ won: 0 })
      .expect(400);

    const valid = await agent
      .patch(`/statistics/standings/${standingId}`)
      .send({ played: 2, won: 1, drawn: 1, points: 4 })
      .expect(200);
    expect(valid.body).toMatchObject({
      played: 2,
      won: 1,
      drawn: 1,
      lost: 0,
      points: 4,
    });
  });
});
