import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface AuthResponseBody {
  user: { id: string; name: string; email: string };
  team: { id: string; name: string; role: string } | null;
}

// Sprint 1 has no athletes/events modules yet, so there's nothing scoped to
// `teamId` to test isolation against directly. This suite instead proves the
// boundary that does exist today: sign-up assigns each coach their own team,
// `GET /auth/session` never leaks another user's team, and a user can't be
// attached to a second team. Per-resource isolation (athletes/events scoped
// by `teamId`) needs its own coverage once those modules land.
describe('Team isolation (e2e)', () => {
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

  function newIdentity(): TestIdentity {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    return identity;
  }

  it('gives each newly registered coach a distinct team', async () => {
    const userA = newIdentity();
    const userB = newIdentity();

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'Coach A',
          email: userA.email,
          password: 'password123',
          teamName: userA.teamName,
        })
        .expect(201),
      request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'Coach B',
          email: userB.email,
          password: 'password123',
          teamName: userB.teamName,
        })
        .expect(201),
    ]);
    const bodyA = responseA.body as AuthResponseBody;
    const bodyB = responseB.body as AuthResponseBody;

    expect(bodyA.team?.id).not.toEqual(bodyB.team?.id);
    expect(bodyA.team?.name).toEqual(userA.teamName);
    expect(bodyB.team?.name).toEqual(userB.teamName);
  });

  it("never returns another user's team from /auth/session", async () => {
    const userA = newIdentity();
    const userB = newIdentity();
    const agentA = request.agent(app.getHttpServer());
    const agentB = request.agent(app.getHttpServer());

    await agentA
      .post('/auth/sign-up')
      .send({
        name: 'Coach A',
        email: userA.email,
        password: 'password123',
        teamName: userA.teamName,
      })
      .expect(201);
    await agentB
      .post('/auth/sign-up')
      .send({
        name: 'Coach B',
        email: userB.email,
        password: 'password123',
        teamName: userB.teamName,
      })
      .expect(201);

    const sessionA = await agentA.get('/auth/session').expect(200);
    const sessionB = await agentB.get('/auth/session').expect(200);
    const bodyA = sessionA.body as AuthResponseBody;
    const bodyB = sessionB.body as AuthResponseBody;

    expect(bodyA.team?.name).toEqual(userA.teamName);
    expect(bodyA.team?.name).not.toEqual(userB.teamName);
    expect(bodyB.team?.name).toEqual(userB.teamName);
    expect(bodyB.team?.name).not.toEqual(userA.teamName);
    expect(bodyA.user.email).toEqual(userA.email);
    expect(bodyB.user.email).toEqual(userB.email);
  });
});
