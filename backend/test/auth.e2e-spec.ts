import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { signJWT } from 'better-auth/crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

const PASSWORD = 'password123';

interface SessionUserBody {
  id: string;
  name: string;
  email: string;
}

interface SessionTeamBody {
  id: string;
  name: string;
  role: string;
}

interface AuthResponseBody {
  user: SessionUserBody;
  team: SessionTeamBody | null;
}

interface ErrorResponseBody {
  message: string;
}

// Unlike `app.e2e-spec.ts`, this suite does NOT mock `DatabaseService` — it
// needs the real DB behind it to exercise Better Auth and `TeamsService` end
// to end.
describe('Auth (e2e)', () => {
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

  /** Registers a fresh identity for one test and queues it for cleanup. */
  function newIdentity(): TestIdentity {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    return identity;
  }

  /**
   * Marks a freshly-registered address verified so sign-in may issue a
   * session (`requireEmailVerification` withholds it until then).
   *
   * Better Auth 1.6's verification token is a self-contained HS256 JWT over
   * `{ email }` signed with the auth secret — minted here the same way its
   * `createEmailVerificationToken` does, then redeemed through the real
   * GET /auth/verify-email endpoint.
   */
  async function verifyEmail(email: string): Promise<void> {
    const token = await signJWT(
      { email: email.toLowerCase() },
      process.env.BETTER_AUTH_SECRET!,
      60 * 60,
    );
    const callbackURL = encodeURIComponent(
      'http://localhost:5173/login?verified=1',
    );

    await request(app.getHttpServer())
      .get(`/auth/verify-email?token=${token}&callbackURL=${callbackURL}`)
      .expect(302);
  }

  describe('POST /auth/sign-up', () => {
    it('creates a user and their team, and sets a session cookie', async () => {
      const { email, teamName } = newIdentity();

      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Ada Lovelace', email, password: PASSWORD, teamName })
        .expect(201);
      const body = response.body as AuthResponseBody;

      expect(body.user).toMatchObject({ email, name: 'Ada Lovelace' });
      expect(body.team).toMatchObject({ name: teamName, role: 'coach' });
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('rejects a payload that fails validation', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: '',
          email: 'not-an-email',
          password: 'short',
          teamName: '',
        })
        .expect(400);
      const body = response.body as ErrorResponseBody;

      expect(body.message).toEqual(expect.any(String));
    });

    it('rejects a duplicate email', async () => {
      const { email, teamName } = newIdentity();
      const body = {
        name: 'Ada Lovelace',
        email,
        password: PASSWORD,
        teamName,
      };

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(body)
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...body, teamName: `${teamName}-2` });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });
  });

  describe('POST /auth/sign-in', () => {
    it('signs an existing verified user in and sets a session cookie', async () => {
      const { email, teamName } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Grace Hopper', email, password: PASSWORD, teamName })
        .expect(201);
      await verifyEmail(email);

      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email, password: PASSWORD })
        .expect(201);
      const body = response.body as AuthResponseBody;

      expect(body.user).toMatchObject({ email });
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('rejects an unknown email with a "no account" message', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email: uniqueTestIdentity().email, password: PASSWORD })
        .expect(401);
      const body = response.body as ErrorResponseBody;

      expect(body.message).toBe('No account found with this email address.');
    });

    it('rejects the wrong password with the generic credentials message', async () => {
      const { email, teamName } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Grace Hopper', email, password: PASSWORD, teamName })
        .expect(201);

      const response = await request(app.getHttpServer())
        .post('/auth/sign-in')
        .send({ email, password: 'wrong-password' })
        .expect(401);
      const body = response.body as ErrorResponseBody;

      expect(body.message).toBe('Invalid email or password');
    });
  });

  describe('GET /auth/session', () => {
    it('returns 401 when there is no session', async () => {
      await request(app.getHttpServer()).get('/auth/session').expect(401);
    });

    it('returns the current user and team when signed in', async () => {
      const { email, teamName } = newIdentity();
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/auth/sign-up')
        .send({
          name: 'Katherine Johnson',
          email,
          password: PASSWORD,
          teamName,
        })
        .expect(201);

      const response = await agent.get('/auth/session').expect(200);
      const body = response.body as AuthResponseBody;

      expect(body.user).toMatchObject({ email });
      expect(body.team).toMatchObject({ name: teamName });
    });
  });

  describe('POST /auth/sign-out', () => {
    it('rejects sign-out with no session', async () => {
      await request(app.getHttpServer()).post('/auth/sign-out').expect(401);
    });

    it('clears the session so a later /auth/session call is unauthenticated', async () => {
      const { email, teamName } = newIdentity();
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/auth/sign-up')
        .send({
          name: 'Margaret Hamilton',
          email,
          password: PASSWORD,
          teamName,
        })
        .expect(201);

      await agent.get('/auth/session').expect(200);
      await agent.post('/auth/sign-out').expect(201);
      await agent.get('/auth/session').expect(401);
    });
  });
});
