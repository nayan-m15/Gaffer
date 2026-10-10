import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { and, eq, like } from 'drizzle-orm';
import request from 'supertest';
import { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { createDatabaseClient } from '../src/database/drizzle';
import { verification } from '../src/database/schema';
import {
  cleanupUsers,
  clearAuthRateLimits,
  uniqueTestIdentity,
  verifyUserEmail,
  type TestIdentity,
} from './utils/test-db';

// The suite shares one loopback socket with every other e2e suite, so it pins
// its own small budgets (the isolated-db setup defaults to effectively
// unlimited). The email and password budgets intentionally differ — the tests
// exhaust each endpoint at a different request count, proving the right
// policy is wired to each route. The backstop override proves a caller cannot
// escape the limit by rotating the spoofable identity header.
const EMAIL_BUDGET = 3;
const PASSWORD_BUDGET = 4;
const EMAIL_BACKSTOP_BUDGET = 2;

const RATE_LIMITED_MESSAGE = 'Too many requests. Please try again later.';

/** Fresh identity IPs come from this documentation range. */
const identityIp = (suffix: number) => `198.51.100.${suffix}`;

interface ForgotPasswordBody {
  status: boolean;
}

interface ErrorBody {
  message: string;
  statusCode: number;
}

describe('Auth password-reset rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];
  const testDb = createDatabaseClient();

  beforeAll(async () => {
    process.env.AUTH_EMAIL_RATE_LIMIT = `${EMAIL_BUDGET}:900`;
    process.env.AUTH_SIGN_IN_RATE_LIMIT = `${PASSWORD_BUDGET}:300`;
    process.env.AUTH_EMAIL_BACKSTOP_RATE_LIMIT = `${EMAIL_BACKSTOP_BUDGET}:900`;

    await clearAuthRateLimits();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    delete process.env.AUTH_EMAIL_RATE_LIMIT;
    delete process.env.AUTH_SIGN_IN_RATE_LIMIT;
    delete process.env.AUTH_EMAIL_BACKSTOP_RATE_LIMIT;
    await clearAuthRateLimits();
    await cleanupUsers(identities);
    await app.close();
  });

  /** Registers a fresh coach for one test and queues it for cleanup. */
  function newIdentity(): TestIdentity {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    return identity;
  }

  async function signUpVerified(identity: TestIdentity): Promise<string> {
    const signUp = await request(app.getHttpServer())
      .post('/auth/sign-up')
      .send({
        name: 'Reset Coach',
        email: identity.email,
        password: 'GafferTest1!',
      })
      .expect(201);
    const { user: signedUp } = signUp.body as { user: { id: string } };

    await verifyUserEmail(identity.email);
    return signedUp.id;
  }

  const forgotPassword = (email: string, ip: string) =>
    request(app.getHttpServer())
      .post('/auth/forgot-password')
      .set('x-forwarded-for', ip)
      .send({ email });

  const resetPassword = (token: string, ip: string) =>
    request(app.getHttpServer())
      .post('/auth/reset-password')
      .set('x-forwarded-for', ip)
      .send({ token, newPassword: 'ResetPass1!' });

  it('answers known and unknown addresses identically inside the email budget', async () => {
    const identity = newIdentity();
    await signUpVerified(identity);

    const known = await forgotPassword(identity.email, identityIp(21)).expect(
      201,
    );
    const unknown = await forgotPassword(
      `nobody-${randomUUID()}@example.com`,
      identityIp(21),
    ).expect(201);

    // The uniform { status: true } shape must not disclose which address
    // exists — the limiter runs before that answer either way.
    expect(known.body as ForgotPasswordBody).toEqual({ status: true });
    expect(unknown.body as ForgotPasswordBody).toEqual({ status: true });
  });

  it('429s forgot-password once the email budget is exhausted and restarts for a rotated identity', async () => {
    for (let attempt = 0; attempt < EMAIL_BUDGET; attempt += 1) {
      await forgotPassword(
        `flood-${randomUUID()}@example.com`,
        identityIp(22),
      ).expect(201);
    }

    const limited = await forgotPassword(
      `flood-${randomUUID()}@example.com`,
      identityIp(22),
    ).expect(429);
    expect((limited.body as ErrorBody).message).toBe(RATE_LIMITED_MESSAGE);

    // A different identity starts with its own fresh budget.
    await forgotPassword(
      `flood-${randomUUID()}@example.com`,
      identityIp(23),
    ).expect(201);
  });

  it('serialises concurrent requests so only the budgeted number pass', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: EMAIL_BUDGET + 2 }, () =>
        forgotPassword(`race-${randomUUID()}@example.com`, identityIp(24)).then(
          (response) => response.status,
        ),
      ),
    );

    const statuses = results.map((result) =>
      result.status === 'fulfilled' ? result.value : 429,
    );
    // The atomic counter must let exactly the budget through regardless of
    // arrival order — this is what bounds every backend instance together.
    expect(statuses.filter((status) => status === 201)).toHaveLength(
      EMAIL_BUDGET,
    );
    expect(statuses.filter((status) => status === 429)).toHaveLength(2);
  });

  it('keeps the full reset round-trip working under the limiter', async () => {
    const identity = newIdentity();
    const userId = await signUpVerified(identity);

    await forgotPassword(identity.email, identityIp(31)).expect(201);

    // The reset link token is stored as the verification row's identifier
    // suffix (`reset-password:<token>`), so redeem it the way the emailed
    // link would.
    const [row] = await testDb
      .select()
      .from(verification)
      .where(
        and(
          eq(verification.value, userId),
          like(verification.identifier, 'reset-password:%'),
        ),
      );
    expect(row).toBeTruthy();
    const token = row.identifier.replace(/^reset-password:/, '');

    const reset = await resetPassword(token, identityIp(31)).expect(201);
    expect(reset.body as ForgotPasswordBody).toEqual({ status: true });

    // The old password must no longer work; the new one must sign in.
    await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set('x-forwarded-for', identityIp(31))
      .send({ email: identity.email, password: 'GafferTest1!' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/sign-in')
      .set('x-forwarded-for', identityIp(31))
      .send({ email: identity.email, password: 'ResetPass1!' })
      .expect(201);
  });

  it('429s reset-password once the password budget is exhausted', async () => {
    // Guessing attempts still reach Better Auth (invalid-token 400s) until
    // the password budget runs out — then the limiter answers first.
    for (let attempt = 0; attempt < PASSWORD_BUDGET; attempt += 1) {
      const guessed = await resetPassword('b'.repeat(24), identityIp(41));
      expect(guessed.status).toBe(400);
      expect(guessed.status).not.toBe(429);
    }

    const limited = await resetPassword('b'.repeat(24), identityIp(41)).expect(
      429,
    );
    expect((limited.body as ErrorBody).message).toBe(RATE_LIMITED_MESSAGE);
  });

  it('bounds a direct caller who rotates the spoofable identity via the edge backstop', async () => {
    // Only the spoofable header rotates; the edge-observed IP is fixed, so
    // the backstop bucket — not the per-identity one — must stop the flood.
    const rotate = (suffix: number) =>
      request(app.getHttpServer())
        .post('/auth/forgot-password')
        .set('x-vercel-forwarded-for', identityIp(suffix))
        .set('cf-connecting-ip', identityIp(99))
        .send({ email: `rotated-${randomUUID()}@example.com` });

    await rotate(51).expect(201);
    await rotate(52).expect(201);
    const limited = await rotate(53).expect(429);
    expect((limited.body as ErrorBody).message).toBe(RATE_LIMITED_MESSAGE);
  });
});
