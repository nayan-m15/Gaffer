import type { APIRequestContext, APIResponse, Page } from '@playwright/test';

// Loads the repo-root .env into process.env — the same file (via the same
// loading logic) the backend itself uses, so tokens minted here are signed
// with the exact BETTER_AUTH_SECRET of whichever backend the tests run
// against, and the URLs below match its trusted origins.
import '../../backend/src/database/environment';

/** Where the frontend dev server serves the app (mirrors the backend's default). */
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

/** Where the Nest API (and its Better Auth handler) listens. */
export const BACKEND_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

export const E2E_PASSWORD = 'password123';

/** Same TTL the backend's auth e2e suite mints its tokens with. */
const VERIFICATION_TTL_SECONDS = 60 * 60;

/** localStorage key `services/team-invites.ts` persists the pending token under. */
export const PENDING_TEAM_INVITE_TOKEN_KEY = 'gaffer:pendingTeamInviteToken';

type BetterAuthCrypto = {
  signJWT: (
    payload: Record<string, unknown>,
    secret: string,
    expiresIn?: number,
  ) => Promise<string>;
};

/**
 * Mints the self-contained HS256 verification token Better Auth issues for
 * "verify your email" links — `{ email }` signed with the auth secret — using
 * the backend's own installed better-auth, so format and version always match
 * what GET /auth/verify-email redeems.
 */
async function signEmailVerificationToken(email: string): Promise<string> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET is not set — cannot mint email verification tokens.',
    );
  }

  // Dynamically imported on purpose: the './crypto' subpath is ESM-only while
  // Playwright compiles these specs to CommonJS, so a static import would
  // resolve to a require() of an ESM module.
  const { signJWT } = (await import(
    '../../backend/node_modules/better-auth/dist/crypto/index.mjs'
  )) as BetterAuthCrypto;

  return signJWT(
    { email: email.toLowerCase() },
    secret,
    VERIFICATION_TTL_SECONDS,
  );
}

/**
 * Builds the GET URL that redeems a verification token — the exact request a
 * browser makes when the user clicks the link in the verification email. The
 * backend marks the address verified, sets a fresh session cookie
 * (`autoSignInAfterVerification`), and 302s the browser to `callbackURL`.
 *
 * E2E has no inbox to read the real link from, so the token is minted here
 * the same way the backend's own auth e2e suite does.
 */
export async function emailVerificationUrl(
  email: string,
  callbackURL: string,
): Promise<string> {
  const token = await signEmailVerificationToken(email);
  return `${BACKEND_URL}/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(callbackURL)}`;
}

/** The pending team-invite token this browser still holds, if any. */
export function pendingTeamInviteToken(page: Page): Promise<string | null> {
  return page.evaluate(
    (key) => localStorage.getItem(key),
    PENDING_TEAM_INVITE_TOKEN_KEY,
  );
}

async function expectOk(response: APIResponse, what: string): Promise<void> {
  if (!response.ok()) {
    throw new Error(
      `${what} failed (${response.status()}): ${await response.text()}`,
    );
  }
}

/**
 * Registers an email/password account through the real API and verifies the
 * address immediately (no email round trip in e2e). Leaves the request
 * context signed out — sign in afterwards if a session is needed.
 */
export async function registerVerifiedUser(
  request: APIRequestContext,
  email: string,
  name: string,
  password = E2E_PASSWORD,
): Promise<void> {
  await expectOk(
    await request.post(`${BACKEND_URL}/auth/sign-up`, {
      data: { name, email, password },
    }),
    'sign-up',
  );

  await expectOk(
    await request.get(
      await emailVerificationUrl(email, `${FRONTEND_URL}/login?verified=1`),
    ),
    'email verification',
  );
}

export interface SeededInvite {
  token: string;
  inviteUrl: string;
  email: string;
  expiresAt: string;
}

/**
 * Seeds a full coach-side fixture through the real API: a verified coach
 * account, their team, and a pending assistant invite for `assistantEmail`.
 * Returns the raw one-time token (which the API only ever shows at creation)
 * and the invite URL a coach would hand to their assistant.
 */
export async function seedCoachWithInvite(
  request: APIRequestContext,
  coach: { email: string; teamName: string },
  assistantEmail: string,
): Promise<SeededInvite> {
  await registerVerifiedUser(request, coach.email, 'E2E Coach');
  await expectOk(
    await request.post(`${BACKEND_URL}/auth/sign-in`, {
      data: { email: coach.email, password: E2E_PASSWORD },
    }),
    'coach sign-in',
  );
  await expectOk(
    await request.post(`${BACKEND_URL}/teams`, {
      data: { name: coach.teamName },
    }),
    'team creation',
  );

  const inviteResponse = await request.post(`${BACKEND_URL}/team-invites`, {
    data: { email: assistantEmail },
  });
  await expectOk(inviteResponse, 'invite creation');

  return (await inviteResponse.json()) as SeededInvite;
}
