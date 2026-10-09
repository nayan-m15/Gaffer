import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { isIP } from 'node:net';
import { sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';

/**
 * Application-level rate limiting for the public auth routes (SEC-002).
 *
 * The custom NestJS wrappers call Better Auth's internal `auth.api.*` methods
 * directly, which never pass through Better Auth's HTTP router — the only
 * place its rate limiter runs. These endpoints therefore had no limit at all,
 * enabling credential stuffing (sign-in) and email bombing (sign-up /
 * verification resend).
 *
 * Counters live in the shared Postgres database (the only shared store this
 * deployment has — the backend runs on Render with Neon Postgres), so every
 * instance enforces the same budget. Each bucket is consumed in a single
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement: Postgres locks
 * the conflicting row for the upsert, so concurrent requests serialise and
 * each observes its own distinct post-increment count — simultaneous requests
 * cannot all pass on a stale read.
 *
 * Two independent policies exist because their abuse profiles differ:
 * - `password` — authentication attempts (sign-in): credential stuffing.
 * - `email` — operations that trigger a verification email (sign-up and
 *   resend): email bombing and provider spend. Sign-up lands here, not under
 *   `password`, because it performs no credential check — its cost is the
 *   email and the user row, exactly like a resend.
 *
 * ## Two-tier keying (spoofing resistance)
 *
 * Production traffic reaches this service through Render's Cloudflare edge.
 * Per Render's own documentation, Cloudflare appends to `X-Forwarded-For`
 * (so a caller controls the leftmost entry) but writes `CF-Connecting-IP`,
 * overwriting whatever the caller sent. Nothing else about a request's
 * claimed identity is trustworthy, because the Render origin is publicly
 * reachable and a client hitting it directly can set arbitrary headers:
 *
 * - `x-vercel-forwarded-for` carries the real client IP *only* on the path
 *   browser → Vercel rewrite → Render (Vercel overwrites it there). Direct
 *   callers can set it to anything, so on its own it enables free bucket
 *   rotation.
 * - The leftmost `X-Forwarded-For` entry and `x-real-ip` are plain
 *   caller-controlled headers on the direct path. Neither is trusted.
 *
 * Every request is therefore limited by up to two buckets:
 * 1. the per-identity bucket keyed on `x-vercel-forwarded-for` — per-user on
 *    the legitimate proxied path;
 * 2. an unforgeable backstop bucket keyed on the edge-observed IP
 *    (`CF-Connecting-IP`, falling back to the rightmost `X-Forwarded-For`
 *    entry — the position the edge appends to). On the proxied path this is
 *    the shared Vercel egress IP; for a direct caller it is their real
 *    source IP, so rotating the spoofable header cannot dodge it.
 *
 * Both buckets are consumed only when the two IPs differ; when they are equal
 * the identity is already unforgeable and a single bucket is counted once
 * (no double-counting for direct requests).
 *
 * ## Remaining deployment limitation
 *
 * The backstop bounds a direct attacker rather than eliminating them: they
 * can still spend the (ten times larger) backstop budget per real source IP,
 * and rotating genuine source IPs remains beyond any IP limiter. The complete
 * fix is restricting the Render service's inbound traffic to Vercel's egress
 * (Render "Inbound IP Rules" plus Vercel "Static IPs") so that
 * `x-vercel-forwarded-for` presence genuinely implies Vercel — an
 * infrastructure and plan change that is deliberately out of scope here.
 */
@Injectable()
export class AuthRateLimitService {
  private readonly logger = new Logger('AuthRateLimit');
  private lastPrunedAt = 0;

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Consumes one request from the policy's per-identity bucket — and, when
   * the request's edge-observed IP differs from the identity IP, from the
   * unforgeable backstop bucket first — throwing a generic 429 once either
   * window's budget is exhausted.
   *
   * Fixed-window semantics: the window starts at the first request of a
   * burst; once it lapses the next request resets the counter. Database
   * failures inside the limiter are logged and swallowed — a broken limiter
   * must not take authentication itself down (the auth call that follows will
   * surface a genuine database outage as 503 through its own error path).
   */
  async enforce(
    policy: RateLimitPolicy,
    identity: RateLimitIdentity,
  ): Promise<void> {
    if (identity.edgeIp) {
      // The unforgeable bound runs first: when it rejects, the request never
      // reaches the per-identity (possibly forged) bucket at all.
      await this.consume(
        `${policy}:edge:${identity.edgeIp}`,
        backstopLimitFor(policy),
      );
    }
    await this.consume(`${policy}:${identity.primaryIp}`, limitFor(policy));

    void this.maybePrune();
  }

  /** Atomically consumes one unit from `key`'s fixed window. */
  private async consume(key: string, limit: RateLimitRule): Promise<void> {
    try {
      const consumed = await this.databaseService.database.execute(
        sql`
          INSERT INTO auth_rate_limits (key, count, window_started_at)
          VALUES (${key}, 1, now())
          ON CONFLICT (key) DO UPDATE SET
            count =
              CASE WHEN auth_rate_limits.window_started_at
                     > now() - make_interval(secs => ${limit.windowSeconds})
                   THEN auth_rate_limits.count + 1
                   ELSE 1
              END,
            window_started_at =
              CASE WHEN auth_rate_limits.window_started_at
                     > now() - make_interval(secs => ${limit.windowSeconds})
                   THEN auth_rate_limits.window_started_at
                   ELSE now()
              END
          RETURNING count
        `,
      );

      const count = Number(
        (consumed.rows[0] as { count: number | string } | undefined)?.count,
      );
      if (Number.isFinite(count) && count > limit.max) {
        throw new HttpException(
          RATE_LIMITED_MESSAGE,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Fail open, but leave a trail: an outage here means the limiter is
      // silently disabled, which deserves attention.
      this.logger.error('Rate limit check failed; allowing request', error);
    }
  }

  /**
   * Deletes windows that expired long enough ago that their owners never came
   * back. Opportunistic and fire-and-forget: the hot path self-recycles
   * active keys via the upsert's window reset, so this only reclaims rows
   * abandoned by one-off clients. Runs at most once per hour per instance.
   */
  private async maybePrune(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPrunedAt < PRUNE_INTERVAL_MS) return;
    this.lastPrunedAt = now;

    try {
      await this.databaseService.database.execute(
        sql`DELETE FROM auth_rate_limits
            WHERE window_started_at
              < now() - make_interval(secs => ${RETENTION_SECONDS})`,
      );
    } catch (error) {
      this.logger.warn('Rate limit pruning failed; will retry later', error);
    }
  }
}

export type RateLimitPolicy = 'password' | 'email';

export interface RateLimitRule {
  /** Requests allowed per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

/**
 * The two identities a request is limited by. `primaryIp` keys the
 * per-identity bucket; `edgeIp` — present only when it differs from
 * `primaryIp` — keys the unforgeable backstop bucket.
 */
export interface RateLimitIdentity {
  primaryIp: string;
  edgeIp?: string;
}

/**
 * Deliberately generic and identical for every policy and request: a 429 must
 * not hint at whether the account exists any more than the auth responses do.
 */
export const RATE_LIMITED_MESSAGE =
  'Too many requests. Please try again later.';

/**
 * Sign-in attempts. 10 per 5 minutes per IP bounds sustained guessing to two
 * attempts a minute while leaving ample room for mistyped passwords and
 * password-manager retries. Better Auth's own default (3/10s) only stops
 * bursts — it still permits ~25k attempts/day against a single account.
 */
const PASSWORD_DEFAULT: RateLimitRule = { max: 10, windowSeconds: 300 };

/**
 * Email-triggering operations (sign-up and verification resend), throttled
 * together under one policy because both spend the same resource: a Brevo
 * transactional email. 5 per 15 minutes per IP is generous for a real user
 * resending a verification link while capping email-bombing and provider
 * spend.
 */
const EMAIL_DEFAULT: RateLimitRule = { max: 5, windowSeconds: 900 };

/**
 * How many times the per-identity budget the shared backstop allows. Sized so
 * legitimate bursts that share one egress IP — e.g. a whole team signing up
 * after a session (30 sign-ups plus a few resends sit well under 50 emails /
 * 15 minutes) — fit with headroom, while a direct attacker is capped at ten
 * times the per-user budget per real source IP instead of unlimited. Vercel's
 * egress IPs are dynamic, so real proxied load also spreads across several
 * backstop buckets.
 */
const BACKSTOP_MULTIPLIER = 10;

/** How long an expired window's row is kept before the prune sweep drops it. */
const RETENTION_SECONDS = 24 * 60 * 60;
/** Minimum spacing between opportunistic prune sweeps, per instance. */
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Resolves the effective rule for a policy, honouring the
 * `AUTH_SIGN_IN_RATE_LIMIT` / `AUTH_EMAIL_RATE_LIMIT` overrides
 * (`max:windowSeconds`, e.g. `3:60`). Read per call rather than once at boot
 * so environment changes apply without a restart; the values are stable in
 * practice because `process.env` is fixed for a running deployment.
 */
export function limitFor(policy: RateLimitPolicy): RateLimitRule {
  return policy === 'password'
    ? readRuleFromEnv('AUTH_SIGN_IN_RATE_LIMIT', PASSWORD_DEFAULT)
    : readRuleFromEnv('AUTH_EMAIL_RATE_LIMIT', EMAIL_DEFAULT);
}

/**
 * The backstop rule for a policy: the explicit
 * `AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT` / `AUTH_EMAIL_BACKSTOP_RATE_LIMIT`
 * override if set, otherwise ten times whatever primary rule is in effect
 * (including primary env overrides, so the two tiers stay proportional).
 */
export function backstopLimitFor(policy: RateLimitPolicy): RateLimitRule {
  const primary = limitFor(policy);
  return readRuleFromEnv(
    policy === 'password'
      ? 'AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT'
      : 'AUTH_EMAIL_BACKSTOP_RATE_LIMIT',
    {
      max: primary.max * BACKSTOP_MULTIPLIER,
      windowSeconds: primary.windowSeconds,
    },
  );
}

const warnedEnvNames = new Set<string>();

/**
 * Parses a `max:windowSeconds` override. Invalid values keep the defaults
 * (with a one-time warning) rather than disabling the limiter.
 */
function readRuleFromEnv(name: string, fallback: RateLimitRule): RateLimitRule {
  const raw = process.env[name];
  if (!raw) return fallback;

  const match = /^(\d+):(\d+)$/.exec(raw.trim());
  if (!match) {
    if (!warnedEnvNames.has(name)) {
      warnedEnvNames.add(name);
      new Logger('AuthRateLimit').warn(
        `Invalid ${name}="${raw}" (expected "max:seconds"); using ${fallback.max}:${fallback.windowSeconds}`,
      );
    }
    return fallback;
  }

  return {
    max: Number(match[1]),
    windowSeconds: Number(match[2]),
  };
}

/** Headers `resolveRateLimitIdentity` consults, in Node's lowercased form. */
export interface ProxyHeaders {
  [key: string]: string | string[] | undefined;
  'x-vercel-forwarded-for'?: string | string[] | undefined;
  'cf-connecting-ip'?: string | string[] | undefined;
  'x-forwarded-for'?: string | string[] | undefined;
}

/**
 * Derives the two rate-limit identities a request answers to.
 *
 * `primaryIp` is the `x-vercel-forwarded-for` value — the real client IP on
 * the legitimate browser → Vercel → Render path, where Vercel overwrites it,
 * but a freely chosen string for anyone hitting the Render origin directly.
 * That is why `edgeIp` (see `resolveEdgeObservedIp`) rides along whenever it
 * differs: the backstop bucket keyed on it is the one the caller cannot
 * rotate. When both resolve to the same address — a direct request without a
 * forged header, or a forgery that replays the caller's own IP — the single
 * unforgeable bucket is counted exactly once.
 */
export function resolveRateLimitIdentity(
  headers: ProxyHeaders,
  socketRemoteAddress?: string,
): RateLimitIdentity {
  const edgeIp = resolveEdgeObservedIp(headers, socketRemoteAddress);
  const forwarded = headerIp(headers['x-vercel-forwarded-for'], 'first');

  if (forwarded && forwarded !== edgeIp) {
    return { primaryIp: forwarded, edgeIp };
  }
  return { primaryIp: edgeIp };
}

/**
 * The IP Render's Cloudflare edge observed as the immediate client — the one
 * address in the request the caller cannot choose:
 *
 * 1. `CF-Connecting-IP`, which Cloudflare writes on every request reaching a
 *    Render web service and overwrites whatever the caller sent. On the
 *    proxied path it holds the shared Vercel egress IP; for a direct caller,
 *    their real source IP.
 * 2. The rightmost `X-Forwarded-For` entry — the position the edge appends
 *    its observed peer to (the leftmost is caller-controlled and spoofable).
 *    Equivalent to `CF-Connecting-IP` on both paths.
 * 3. The socket address, for direct requests that carry no proxy headers at
 *    all (local development and tests — behind Render the first two are
 *    always present).
 * 4. `'unknown'` — a deliberate shared bucket, so an unresolvable request
 *    still gets limited (fail closed) rather than exempted.
 *
 * `x-real-ip` is deliberately absent: it is a plain caller-settable header
 * with no edge guarantee behind it.
 */
export function resolveEdgeObservedIp(
  headers: ProxyHeaders,
  socketRemoteAddress?: string,
): string {
  return (
    headerIp(headers['cf-connecting-ip'], 'first') ??
    headerIp(headers['x-forwarded-for'], 'last') ??
    socketRemoteAddress ??
    'unknown'
  );
}

/**
 * Extracts a validated IP from a header that may hold a comma-separated
 * chain (and, in Node, may arrive as an array of such chains). `which` picks
 * the trustworthy end: the FIRST entry of a single-address header, or the
 * LAST entry of `x-forwarded-for` — the position Render's edge appends to.
 * Values that are not bare IP addresses are discarded rather than trusted: a
 * junk value must never become a bucket key (or collide with the `edge:`
 * backstop prefix by forging `x-vercel-forwarded-for: edge:1.2.3.4`).
 */
function headerIp(
  value: string | string[] | undefined,
  which: 'first' | 'last',
): string | undefined {
  const raw = Array.isArray(value)
    ? which === 'last'
      ? value[value.length - 1]
      : value[0]
    : value;
  if (typeof raw !== 'string') return undefined;

  const entries = raw.split(',').map((entry) => entry.trim().toLowerCase());
  const entry = which === 'last' ? entries[entries.length - 1] : entries[0];
  return entry && isIP(entry) ? entry : undefined;
}
