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

interface SessionBody {
  user: { id: string; name: string; email: string };
  team: { id: string; name: string; role: string } | null;
}

// Proves the team boundary at the session level: registration gives each coach
// their own team, and `GET /auth/session` never leaks another user's. Isolation
// of individual resources (athletes, events, statistics, seasons) is covered by
// those modules' own suites.
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

  async function newCoach(name: string) {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    const registered = await registerCoach(app.getHttpServer(), identity, name);
    return { ...registered, identity };
  }

  it('gives each newly registered coach a distinct team', async () => {
    // Sequential rather than parallel: registration now spans sign-up,
    // verification and team creation, and two interleaved flows against the
    // shared dev database make failures hard to read.
    const coachA = await newCoach('Coach A');
    const coachB = await newCoach('Coach B');

    expect(coachA.team.id).not.toEqual(coachB.team.id);
    expect(coachA.team.name).toEqual(coachA.identity.teamName);
    expect(coachB.team.name).toEqual(coachB.identity.teamName);
  });

  it('rejects a second team for the same coach', async () => {
    const coach = await newCoach('Coach A');

    await coach.agent
      .post('/teams')
      .send({ name: `${coach.identity.teamName} Reserves` })
      .expect(409);
  });

  it("never returns another user's team from /auth/session", async () => {
    const coachA = await newCoach('Coach A');
    const coachB = await newCoach('Coach B');

    const sessionA = await coachA.agent.get('/auth/session').expect(200);
    const sessionB = await coachB.agent.get('/auth/session').expect(200);
    const bodyA = sessionA.body as SessionBody;
    const bodyB = sessionB.body as SessionBody;

    expect(bodyA.team?.name).toEqual(coachA.identity.teamName);
    expect(bodyA.team?.name).not.toEqual(coachB.identity.teamName);
    expect(bodyB.team?.name).toEqual(coachB.identity.teamName);
    expect(bodyB.team?.name).not.toEqual(coachA.identity.teamName);
    expect(bodyA.user.email).toEqual(coachA.identity.email);
    expect(bodyB.user.email).toEqual(coachB.identity.email);
  });
});
