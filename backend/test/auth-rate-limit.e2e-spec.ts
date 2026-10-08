import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  cleanupUsers,
  clearAuthRateLimits,
  uniqueTestIdentity,
  verifyUserEmail,
  type TestIdentity,
} from './utils/test-db';

const PASSWORD = 'password123';

/**
 * Dedicated coverage for the application-level auth rate limiter (SEC-002).
 *
 * Two fully separate Nest instances are booted against the one shared test
 * database — the same shape as the Render deployment scaling to two backend
 * instances — so the suite can prove the limit lives in the database rather
 * than in any single process.
 *
 * The limiter keys every request by up to two tiers: the per-identity bucket
 * (the IP Vercel reports via x-vercel-forwarded-for) and an unforgeable
 * backstop bucket keyed on the edge-observed IP (CF-Connecting-IP — which
 * Render's Cloudflare edge writes and the caller cannot forge — falling back
 * to the rightmost X-Forwarded-For entry). The later tests simulate the two
 * attacker shapes the two-tier design exists for: a direct-to-Render caller
 * rotating spoofable headers, and legitimate Vercel-proxied users sharing one
 * egress IP.
 *
 * Each test draws its own client identity from the documentation ranges
 * (198.51.100.0/24 for per-user IPs, 203.0.113.0/24 for edge IPs) via request
 * headers, both to isolate buckets between tests and to exercise the headers
 * the production paths present. Budgets are pinned per test through the same
 * env overrides the deployment would use.
 */
describe('Auth rate limiting (e2e)', () => {
  let appOne: INestApplication<App>;
  let appTwo: INestApplication<App>;
  const identities: TestIdentity[] = [];

  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const name of [
      'AUTH_SIGN_IN_RATE_LIMIT',
      'AUTH_EMAIL_RATE_LIMIT',
      'AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT',
      'AUTH_EMAIL_BACKSTOP_RATE_LIMIT',
    ]) {
      savedEnv[name] = process.env[name];
    }

    // The buckets this spec pins are keyed by the fixed documentation-range
    // IPs below, so stale rows from a previous run of this file (against the
    // one shared test database) must not bleed into this one.
    await clearAuthRateLimits();

    const moduleOne: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    appOne = moduleOne.createNestApplication();
    await appOne.init();

    const moduleTwo: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    appTwo = moduleTwo.createNestApplication();
    await appTwo.init();
  });

  afterAll(async () => {
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }

    await cleanupUsers(identities);
    await clearAuthRateLimits();
    await appOne.close();
    await appTwo.close();
  }, 120_000);

  /** A not-yet-used client IP, unique per call. */
  let ipCounter = 1;
  function nextIp(): string {
    return `198.51.100.${(ipCounter++ % 250) + 1}`;
  }

  /** A not-yet-used edge IP (documentation range 203.0.113.0/24). */
  let edgeCounter = 1;
  function nextEdgeIp(): string {
    return `203.0.113.${(edgeCounter++ % 250) + 1}`;
  }

  function newIdentity(): TestIdentity {
    const identity = uniqueTestIdentity('sec002');
    identities.push(identity);
    return identity;
  }

  /** POSTs /auth/sign-in from a given (spoofed) client IP. */
  function signIn(
    app: INestApplication<App>,
    ip: string,
    body: { email: string; password: string },
  ) {
    return signInWithHeaders(app, { 'X-Forwarded-For': ip }, body);
  }

  /** POSTs /auth/sign-in with arbitrary proxy-identity headers. */
  function signInWithHeaders(
    app: INestApplication<App>,
    headers: Record<string, string>,
    body: { email: string; password: string },
  ) {
    return request(app.getHttpServer())
      .post('/auth/sign-in')
      .set(headers)
      .send(body);
  }

  it('returns 429 after repeated sign-in attempts and 401 before that', async () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '3:300';
    const ip = nextIp();
    const email = uniqueTestIdentity().email; // never registered — 401s only

    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await signIn(appOne, ip, {
        email,
        password: PASSWORD,
      });
      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        message: 'Invalid email or password',
      });
    }

    const throttled = await signIn(appOne, ip, { email, password: PASSWORD });
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({
      message: 'Too many requests. Please try again later.',
    });
    expect(throttled.headers['set-cookie']).toBeUndefined();
  });

  it('still completes a normal sign-up → sign-in flow below the limits', async () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';
    process.env.AUTH_EMAIL_RATE_LIMIT = '5:900';
    const ip = nextIp();
    const { email } = newIdentity();

    await request(appOne.getHttpServer())
      .post('/auth/sign-up')
      .set('X-Forwarded-For', ip)
      .send({ name: 'Rate Limit Test', email, password: PASSWORD })
      .expect(201);

    await verifyUserEmail(email);

    const response = await signIn(appOne, ip, { email, password: PASSWORD });
    expect(response.status).toBe(201);
    const body = response.body as { user: { email: string } };
    expect(body.user).toMatchObject({ email });
    expect(response.headers['set-cookie']).toBeDefined();
  });

  it('throttles repeated sign-ups under the email policy', async () => {
    process.env.AUTH_EMAIL_RATE_LIMIT = '2:900';
    const ip = nextIp();

    for (let attempt = 0; attempt < 2; attempt++) {
      const { email } = newIdentity();
      await request(appOne.getHttpServer())
        .post('/auth/sign-up')
        .set('X-Forwarded-For', ip)
        .send({ name: 'Rate Limit Test', email, password: PASSWORD })
        .expect(201);
    }

    const throttled = await request(appOne.getHttpServer())
      .post('/auth/sign-up')
      .set('X-Forwarded-For', ip)
      .send({
        name: 'Rate Limit Test',
        email: newIdentity().email,
        password: PASSWORD,
      });
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({
      message: 'Too many requests. Please try again later.',
    });
  });

  it('throttles verification-email resend abuse', async () => {
    process.env.AUTH_EMAIL_RATE_LIMIT = '2:900';
    const ip = nextIp();
    const { email } = newIdentity();

    await request(appOne.getHttpServer())
      .post('/auth/sign-up')
      .set('X-Forwarded-For', nextIp()) // separate bucket: don't pre-drain this test's
      .send({ name: 'Rate Limit Test', email, password: PASSWORD }) // resend budget
      .expect(201);

    for (let attempt = 0; attempt < 2; attempt++) {
      await request(appOne.getHttpServer())
        .post('/auth/send-verification-email')
        .set('X-Forwarded-For', ip)
        .send({ email })
        .expect(201);
    }

    const throttled = await request(appOne.getHttpServer())
      .post('/auth/send-verification-email')
      .set('X-Forwarded-For', ip)
      .send({ email });
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({
      message: 'Too many requests. Please try again later.',
    });
  });

  it('keeps the password and email policies independent', async () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '1:300';
    process.env.AUTH_EMAIL_RATE_LIMIT = '1:900';

    // Draining the password bucket must not touch the email bucket.
    const drainedPassword = nextIp();
    await signIn(appOne, drainedPassword, {
      email: uniqueTestIdentity().email,
      password: PASSWORD,
    }).expect(401);
    await signIn(appOne, drainedPassword, {
      email: uniqueTestIdentity().email,
      password: PASSWORD,
    }).expect(429);

    const { email } = newIdentity();
    await request(appOne.getHttpServer())
      .post('/auth/sign-up')
      .set('X-Forwarded-For', drainedPassword) // same IP, other policy
      .send({ name: 'Rate Limit Test', email, password: PASSWORD })
      .expect(201);

    // Draining the email bucket must not touch the password bucket.
    const drainedEmail = nextIp();
    await request(appOne.getHttpServer())
      .post('/auth/sign-up')
      .set('X-Forwarded-For', drainedEmail)
      .send({
        name: 'Rate Limit Test',
        email: newIdentity().email,
        password: PASSWORD,
      })
      .expect(201);
    await request(appOne.getHttpServer())
      .post('/auth/send-verification-email')
      .set('X-Forwarded-For', drainedEmail)
      .send({ email: uniqueTestIdentity().email })
      .expect(429);

    await signIn(appOne, drainedEmail, {
      email: uniqueTestIdentity().email,
      password: PASSWORD,
    }).expect(401);
  });

  it('answers 429 identically whether or not the account exists', async () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '2:300';
    const { email: existingEmail } = newIdentity();
    await request(appOne.getHttpServer())
      .post('/auth/sign-up')
      .set('X-Forwarded-For', nextIp())
      .send({
        name: 'Rate Limit Test',
        email: existingEmail,
        password: PASSWORD,
      })
      .expect(201);

    const knownIp = nextIp();
    for (let attempt = 0; attempt < 2; attempt++) {
      await signIn(appOne, knownIp, {
        email: existingEmail,
        password: 'wrong-password',
      }).expect(401);
    }
    const known = await signIn(appOne, knownIp, {
      email: existingEmail,
      password: 'wrong-password',
    });

    const unknownIp = nextIp();
    const unknownEmail = uniqueTestIdentity().email;
    for (let attempt = 0; attempt < 2; attempt++) {
      await signIn(appOne, unknownIp, {
        email: unknownEmail,
        password: 'wrong-password',
      }).expect(401);
    }
    const unknown = await signIn(appOne, unknownIp, {
      email: unknownEmail,
      password: 'wrong-password',
    });

    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    // Byte-for-byte parity: the throttled response must not hint at which
    // email exists, nor set cookies only one case would earn.
    expect(unknown.body).toEqual(known.body);
    expect(unknown.headers['set-cookie']).toBeUndefined();
    expect(known.headers['set-cookie']).toBeUndefined();
  });

  it('cannot be bypassed by concurrent requests', async () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '5:300';
    const ip = nextIp();
    const email = uniqueTestIdentity().email;

    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        signIn(appOne, ip, { email, password: PASSWORD }),
      ),
    );

    const statuses = responses.map((response) => response.status);
    // The single atomic upsert guarantees each request sees its own distinct
    // post-increment count: exactly the budget passes (and fails auth with
    // 401 — the email is unregistered), everything beyond it gets 429. A
    // check-then-increment limiter would let more than five through.
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);
  });

  it('shares one budget across two application instances', async () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '2:300';
    const ip = nextIp();
    const email = uniqueTestIdentity().email;

    // Instance one spends the whole budget.
    await signIn(appOne, ip, { email, password: PASSWORD }).expect(401);
    await signIn(appOne, ip, { email, password: PASSWORD }).expect(401);

    // Instance two — a separate process-level service with its own Nest
    // container — reads the same counter from the shared database and must
    // refuse the third attempt even though this instance never saw the first
    // two.
    await signIn(appTwo, ip, { email, password: PASSWORD }).expect(429);
  });

  it('cannot be bypassed by rotating x-vercel-forwarded-for while the edge IP stays fixed', async () => {
    // A direct-to-Render attacker with a stable source IP: the edge writes
    // CF-Connecting-IP (which they cannot forge), so no amount of rotating
    // the spoofable per-identity header can dodge the backstop bucket.
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';
    process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT = '3:300';
    const edgeIp = nextEdgeIp();
    const email = uniqueTestIdentity().email;

    for (let attempt = 0; attempt < 3; attempt++) {
      await signInWithHeaders(
        appOne,
        {
          'X-Forwarded-For': nextIp(), // junk the attacker also controls
          'CF-Connecting-IP': edgeIp,
          'x-vercel-forwarded-for': nextIp(), // a fresh "identity" each time
        },
        { email, password: PASSWORD },
      ).expect(401);
    }

    // Fourth request, brand-new spoofed identity, same real source IP: the
    // per-identity bucket is fresh but the backstop is not.
    const throttled = await signInWithHeaders(
      appOne,
      {
        'X-Forwarded-For': nextIp(),
        'CF-Connecting-IP': edgeIp,
        'x-vercel-forwarded-for': nextIp(),
      },
      { email, password: PASSWORD },
    );
    expect(throttled.status).toBe(429);
    expect(throttled.body).toMatchObject({
      message: 'Too many requests. Please try again later.',
    });
  });

  it('keys the backstop on CF-Connecting-IP even when the caller controls X-Forwarded-For', async () => {
    // The attacker feeds a rotating leftmost X-Forwarded-For chain — the
    // spoofable end of the header — hoping the resolver uses it as the edge
    // identity. CF-Connecting-IP must win, so the backstop bucket stays fixed
    // on their real address and fills up.
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';
    process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT = '3:300';
    const edgeIp = nextEdgeIp();
    const email = uniqueTestIdentity().email;

    for (let attempt = 0; attempt < 3; attempt++) {
      await signInWithHeaders(
        appOne,
        {
          'X-Forwarded-For': `${nextIp()}, ${nextIp()}`, // attacker-chosen chain
          'CF-Connecting-IP': edgeIp,
          'x-vercel-forwarded-for': nextIp(),
        },
        { email, password: PASSWORD },
      ).expect(401);
    }

    const throttled = await signInWithHeaders(
      appOne,
      {
        'X-Forwarded-For': `${nextIp()}, ${nextIp()}`,
        'CF-Connecting-IP': edgeIp,
        'x-vercel-forwarded-for': nextIp(),
      },
      { email, password: PASSWORD },
    );
    expect(throttled.status).toBe(429);
  });

  it('bounds direct requests without proxy headers even while x-vercel-forwarded-for rotates', async () => {
    // No CF-Connecting-IP, no X-Forwarded-For: the edge identity falls back
    // to the socket address — the one thing a direct TCP caller cannot choose.
    // Rotating the spoofable header must still hit the same backstop bucket.
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';
    process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT = '3:300';
    const email = uniqueTestIdentity().email;

    for (let attempt = 0; attempt < 3; attempt++) {
      await signInWithHeaders(
        appOne,
        { 'x-vercel-forwarded-for': nextIp() },
        { email, password: PASSWORD },
      ).expect(401);
    }

    const throttled = await signInWithHeaders(
      appOne,
      { 'x-vercel-forwarded-for': nextIp() },
      { email, password: PASSWORD },
    );
    expect(throttled.status).toBe(429);
    expect(throttled.headers['set-cookie']).toBeUndefined();
  });

  it('still limits Vercel-path users individually while the shared backstop stays generous', async () => {
    // Two real users behind the same Vercel egress IP (one shared
    // CF-Connecting-IP): each keeps an independent per-identity budget, and
    // the backstop (10x here) is roomy enough that neither user is locked
    // out by the other's failed attempts.
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '2:300';
    process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT = '20:300';
    const edgeIp = nextEdgeIp();
    const emailOne = uniqueTestIdentity().email;
    const emailTwo = uniqueTestIdentity().email;

    const userOne = nextIp();
    await signInWithHeaders(
      appOne,
      { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': userOne },
      { email: emailOne, password: PASSWORD },
    ).expect(401);
    await signInWithHeaders(
      appOne,
      { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': userOne },
      { email: emailOne, password: PASSWORD },
    ).expect(401);
    await signInWithHeaders(
      appOne,
      { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': userOne },
      { email: emailOne, password: PASSWORD },
    ).expect(429); // user one drained their own budget

    // User two, same egress: still free to sign in — the shared backstop has
    // only seen three requests — until their own budget runs out.
    const userTwo = nextIp();
    await signInWithHeaders(
      appOne,
      { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': userTwo },
      { email: emailTwo, password: PASSWORD },
    ).expect(401);
    await signInWithHeaders(
      appOne,
      { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': userTwo },
      { email: emailTwo, password: PASSWORD },
    ).expect(401);
    await signInWithHeaders(
      appOne,
      { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': userTwo },
      { email: emailTwo, password: PASSWORD },
    ).expect(429); // own budget, not the shared backstop
  });

  it('shares the backstop budget across two application instances', async () => {
    process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';
    process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT = '3:300';
    const edgeIp = nextEdgeIp();
    const email = uniqueTestIdentity().email;

    // Instance one exhausts the backstop with rotating spoofed identities.
    for (let attempt = 0; attempt < 3; attempt++) {
      await signInWithHeaders(
        appOne,
        { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': nextIp() },
        { email, password: PASSWORD },
      ).expect(401);
    }

    // Instance two — separate Nest container, same shared database — must
    // see the drained backstop and refuse even a brand-new spoofed identity.
    await signInWithHeaders(
      appTwo,
      { 'CF-Connecting-IP': edgeIp, 'x-vercel-forwarded-for': nextIp() },
      { email, password: PASSWORD },
    ).expect(429);
  });
});
