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

// Same shape team-invites issues: base64url of 32 random bytes (43 chars).
// Only the shape matters here — the callback routing is per-request and the
// token never needs to resolve against the invites table.
const INVITE_TOKEN = 'A'.repeat(43);

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

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

interface SignUpResponseBody {
  user: SessionUserBody;
  emailVerificationRequired: boolean;
}

interface AuthResponseBody {
  user: SessionUserBody;
  team: SessionTeamBody | null;
}

interface ErrorResponseBody {
  message: string;
}

// Unlike `app.e2e-spec.ts`, this suite does NOT mock `DatabaseService` — it
// needs the real DB behind it to exercise Better Auth end to end.
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
   * GET /auth/verify-email endpoint. `callbackURL` is what the controller
   * embeds in the emailed link, so redeeming it mirrors clicking that link.
   */
  async function verifyEmail(email: string, callbackURL: string) {
    const token = await signJWT(
      { email: email.toLowerCase() },
      process.env.BETTER_AUTH_SECRET!,
      60 * 60,
    );

    return request(app.getHttpServer())
      .get(
        `/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent(callbackURL)}`,
      )
      .expect(302);
  }

  describe('POST /auth/sign-up', () => {
    it('creates the user but withholds the session and team until the email is verified', async () => {
      const { email } = newIdentity();

      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Ada Lovelace', email, password: PASSWORD })
        .expect(201);
      const body = response.body as SignUpResponseBody;

      expect(body.user).toMatchObject({ email, name: 'Ada Lovelace' });
      expect(body.emailVerificationRequired).toBe(true);
      // Sign-up never creates or returns a team (that moved to the dashboard's
      // Add Team flow) and never issues a session until the address is
      // verified.
      expect(body).not.toHaveProperty('team');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('accepts a pending team-invite token without creating a session', async () => {
      const { email } = newIdentity();

      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'Ada Lovelace',
          email,
          password: PASSWORD,
          inviteToken: INVITE_TOKEN,
        })
        .expect(201);
      const body = response.body as SignUpResponseBody;

      expect(body.user).toMatchObject({ email });
      expect(body.emailVerificationRequired).toBe(true);
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('rejects a malformed invite token', async () => {
      const { email } = newIdentity();

      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'Ada Lovelace',
          email,
          password: PASSWORD,
          inviteToken: 'not-a-token',
        })
        .expect(400);
      const body = response.body as ErrorResponseBody;

      expect(body.message).toBe('This invite link is no longer valid.');
    });

    it('rejects a payload that fails validation', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: '',
          email: 'not-an-email',
          password: 'short',
        })
        .expect(400);
      const body = response.body as ErrorResponseBody;

      expect(body.message).toEqual(expect.any(String));
    });

    it('answers a duplicate email exactly like a fresh sign-up (no enumeration leak)', async () => {
      const { email } = newIdentity();
      const body = {
        name: 'Ada Lovelace',
        email,
        password: PASSWORD,
      };

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send(body)
        .expect(201);

      // With requireEmailVerification Better Auth deliberately mirrors the
      // first sign-up's response instead of returning 4xx, so a caller can't
      // probe which addresses already have accounts.
      const response = await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ ...body, name: 'Someone Else' })
        .expect(201);
      const responseBody = response.body as SignUpResponseBody;

      expect(responseBody.user).toMatchObject({ email });
      expect(responseBody.emailVerificationRequired).toBe(true);
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('GET /auth/verify-email', () => {
    it('redirects back to the pending team invite with a fresh session cookie', async () => {
      const { email } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({
          name: 'Ada Lovelace',
          email,
          password: PASSWORD,
          inviteToken: INVITE_TOKEN,
        })
        .expect(201);

      const callbackURL = `${FRONTEND_URL}/join-team/${INVITE_TOKEN}`;
      const response = await verifyEmail(email, callbackURL);

      expect(response.headers.location).toBe(callbackURL);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('redirects to the verified-login page by default with a fresh session cookie', async () => {
      const { email } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Grace Hopper', email, password: PASSWORD })
        .expect(201);

      const callbackURL = `${FRONTEND_URL}/login?verified=1`;
      const response = await verifyEmail(email, callbackURL);

      expect(response.headers.location).toBe(callbackURL);
      expect(response.headers['set-cookie']).toBeDefined();
    });
  });

  describe('POST /auth/sign-in', () => {
    it('signs an existing verified user in and sets a session cookie', async () => {
      const { email } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Grace Hopper', email, password: PASSWORD })
        .expect(201);
      await verifyEmail(email, `${FRONTEND_URL}/login?verified=1`);

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
      const { email } = newIdentity();

      await request(app.getHttpServer())
        .post('/auth/sign-up')
        .send({ name: 'Grace Hopper', email, password: PASSWORD })
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

    it('returns the current user and a null team until they create or join one', async () => {
      const { email } = newIdentity();
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/auth/sign-up')
        .send({ name: 'Katherine Johnson', email, password: PASSWORD })
        .expect(201);
      await verifyEmail(email, `${FRONTEND_URL}/login?verified=1`);
      await agent
        .post('/auth/sign-in')
        .send({ email, password: PASSWORD })
        .expect(201);

      const response = await agent.get('/auth/session').expect(200);
      const body = response.body as AuthResponseBody;

      expect(body.user).toMatchObject({ email });
      expect(body.team).toBeNull();
    });
  });

  describe('POST /auth/sign-out', () => {
    it('rejects sign-out with no session', async () => {
      await request(app.getHttpServer()).post('/auth/sign-out').expect(401);
    });

    it('clears the session so a later /auth/session call is unauthenticated', async () => {
      const { email } = newIdentity();
      const agent = request.agent(app.getHttpServer());

      await agent
        .post('/auth/sign-up')
        .send({ name: 'Margaret Hamilton', email, password: PASSWORD })
        .expect(201);
      await verifyEmail(email, `${FRONTEND_URL}/login?verified=1`);
      await agent
        .post('/auth/sign-in')
        .send({ email, password: PASSWORD })
        .expect(201);

      await agent.get('/auth/session').expect(200);
      await agent.post('/auth/sign-out').expect(201);
      await agent.get('/auth/session').expect(401);
    });
  });
});
