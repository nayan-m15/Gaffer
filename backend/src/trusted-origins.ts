/**
 * The single source of truth for which browser origins the backend trusts
 * (HARD-001). Both the credentialed CORS allowlist (`main.ts`) and Better
 * Auth's Origin/CSRF checks (`auth/auth.ts`) read from here, so the two can
 * never drift apart again.
 *
 * Production trusts only the deployed Vercel frontend plus whatever
 * `FRONTEND_URL` the deployment explicitly configures. The localhost
 * defaults exist purely for local development and the test suites, and are
 * added only when `NODE_ENV` says so. Any other value — `production`,
 * unset, or a typo — fails closed, mirroring `handleUnconfiguredDelivery`
 * in `email/email.ts`.
 *
 * Functions take `env` rather than reading `process.env` at import time so
 * they see the values `database/environment.ts` loads from `.env`, and so the
 * spec can exercise production without mutating the real environment.
 */

type Env = Readonly<Record<string, string | undefined>>;

/** The deployed frontend. Vercel proxies `/auth` and `/api` to Render. */
export const PRODUCTION_FRONTEND_ORIGIN = 'https://gaffer-virid.vercel.app';

const DEVELOPMENT_FRONTEND_ORIGIN = 'http://localhost:5173';
const DEVELOPMENT_BACKEND_ORIGIN = 'http://localhost:3000';

export function allowsDevelopmentOrigins(env: Env = process.env): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

/** Reduces a configured URL to its bare origin, dropping unparseable values. */
function toOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function getTrustedOrigins(env: Env = process.env): string[] {
  const origins = [env.FRONTEND_URL, PRODUCTION_FRONTEND_ORIGIN];
  if (allowsDevelopmentOrigins(env)) {
    origins.push(DEVELOPMENT_FRONTEND_ORIGIN, DEVELOPMENT_BACKEND_ORIGIN);
  }

  return [
    ...new Set(
      origins
        .map(toOrigin)
        .filter((origin): origin is string => Boolean(origin)),
    ),
  ];
}

/**
 * Better Auth always trusts its own `baseURL` origin on top of
 * `trustedOrigins`, so a localhost fallback here would quietly re-trust
 * localhost in production. Outside development, an unset `BETTER_AUTH_URL`
 * falls back to the production frontend, which is what it must be set to
 * there anyway (see `.env.example`).
 */
export function getBetterAuthBaseURL(env: Env = process.env): string {
  if (env.BETTER_AUTH_URL) return env.BETTER_AUTH_URL;
  return allowsDevelopmentOrigins(env)
    ? DEVELOPMENT_BACKEND_ORIGIN
    : PRODUCTION_FRONTEND_ORIGIN;
}
