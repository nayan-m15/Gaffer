import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { ClientIdentity } from '../common/client-ip';

/**
 * Per-client request budget for the unauthenticated dashboard (SEC-008).
 *
 * `PublicDashboardCacheService` already bounds how often a *repeated* query
 * reaches the database; this limiter bounds the one case the cache cannot —
 * a single client churning through distinct filter combinations to force
 * misses, and plain request-volume floods against an endpoint that answers
 * without any credential at all.
 *
 * Counters are in-memory and therefore per-instance, matching the cache they
 * sit in front of. The auth routes deliberately use a database-backed limiter
 * (`AuthRateLimitService`, SEC-002) because a credential-stuffing budget must
 * hold across instances even at the cost of a write per attempt. The trade is
 * the other way round here: these are anonymous reads whose whole problem is
 * database load, so spending a write to police them would reintroduce the
 * cost being removed. A caller spread across N instances gets N budgets, each
 * still bounded, and the cache bounds what a budget can actually cost.
 *
 * ## Keying
 *
 * Two tiers, as `resolveClientIdentity` describes: the per-client bucket on
 * the Vercel-supplied client IP, and — only when it differs — an unforgeable
 * backstop bucket on the edge-observed IP. On the legitimate browser to
 * Vercel to Render path the backstop key is Vercel's *shared egress* IP, so
 * every real visitor counts against one bucket together; it is sized for that
 * (see `BACKSTOP_MULTIPLIER`) and exists to stop header-forged bucket
 * rotation, not to police ordinary traffic.
 */
@Injectable()
export class PublicDashboardRateLimitService {
  private readonly logger = new Logger('PublicDashboardRateLimit');
  private readonly windows = new Map<string, FixedWindow>();
  private lastPrunedAt = 0;

  /**
   * Consumes one request from the caller's budget, throwing 429 once a window
   * is exhausted. The unforgeable backstop is charged first, so when it
   * rejects, the request never reaches the (possibly forged) per-client
   * bucket at all.
   */
  enforce(identity: ClientIdentity): void {
    const rule = limitRule();
    if (identity.edgeIp) {
      this.consume(`edge:${identity.edgeIp}`, backstopRule(rule));
    }
    this.consume(`client:${identity.primaryIp}`, rule);
    this.prune();
  }

  /** Consumes one unit from `key`'s fixed window. */
  private consume(key: string, rule: RateLimitRule): void {
    const now = Date.now();
    const window = this.windows.get(key);

    if (!window || window.startedAt + rule.windowSeconds * 1000 <= now) {
      this.windows.set(key, { count: 1, startedAt: now });
      return;
    }

    window.count += 1;
    if (window.count > rule.max) {
      throw new HttpException(
        RATE_LIMITED_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Drops windows that lapsed long enough ago that their owner never came
   * back. Active keys recycle themselves on the next request, so this only
   * reclaims one-off callers; it runs at most once a minute and walks the map
   * in one pass, which is cheap at the sizes this limiter reaches.
   */
  private prune(): void {
    const now = Date.now();
    if (now - this.lastPrunedAt < PRUNE_INTERVAL_MS) return;
    this.lastPrunedAt = now;

    const cutoff = now - RETENTION_MS;
    for (const [key, window] of this.windows) {
      if (window.startedAt < cutoff) this.windows.delete(key);
    }

    if (this.windows.size > MAX_TRACKED_KEYS) {
      // A flood of distinct keys outran the sweep. Oldest-first eviction is
      // fail-open for those keys, which is the right way to fail for a memory
      // bound: the cache still protects the database behind it.
      const excess = this.windows.size - MAX_TRACKED_KEYS;
      let dropped = 0;
      for (const key of this.windows.keys()) {
        if (dropped >= excess) break;
        this.windows.delete(key);
        dropped += 1;
      }
      this.logger.warn(
        `Rate limit key table exceeded ${MAX_TRACKED_KEYS}; evicted ${excess} oldest windows`,
      );
    }
  }

  /** How many windows are currently tracked. Exposed for tests. */
  get trackedWindows(): number {
    return this.windows.size;
  }

  /** Drops every window. Exposed for tests; nothing in the app calls it. */
  clear(): void {
    this.windows.clear();
    this.lastPrunedAt = 0;
  }
}

export interface RateLimitRule {
  /** Requests allowed per window. */
  max: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

interface FixedWindow {
  count: number;
  startedAt: number;
}

/** Generic by design: a 429 should not describe the limiter it tripped. */
export const RATE_LIMITED_MESSAGE =
  'Too many requests. Please try again later.';

/**
 * Per-client budget. One dashboard load is already several requests — filters,
 * team statistics, the match pages, and the player pages three at a time
 * (`frontend/src/services/public-dashboard.ts`) — so roughly ten to fifteen
 * for a team with a full season, and more as a visitor switches filters.
 * 120 per minute leaves a visitor free to click around and reload while
 * capping any one client at two requests a second sustained.
 */
const DEFAULT_RULE: RateLimitRule = { max: 120, windowSeconds: 60 };

/**
 * How many times the per-client budget the shared backstop allows.
 *
 * The backstop's key is Vercel's egress IP for all genuine traffic, so this
 * multiplier is really "how many visitors may browse at once before they
 * start limiting each other". Twenty — 2,400 requests a minute — covers well
 * over a hundred simultaneous visitors at a realistic per-visitor rate, and
 * Vercel's egress addresses are dynamic, so real load spreads across several
 * backstop buckets rather than piling into one. A direct caller forging
 * `x-vercel-forwarded-for` is meanwhile capped at that same figure per real
 * source IP instead of being unbounded, and the cache decides what those
 * requests actually cost. Raise `PUBLIC_DASHBOARD_BACKSTOP_RATE_LIMIT` if
 * genuine concurrent traffic ever approaches it.
 */
const BACKSTOP_MULTIPLIER = 20;

/** How long a lapsed window is kept before the sweep drops it. */
const RETENTION_MS = 10 * 60 * 1000;
/** Minimum spacing between prune sweeps, per instance. */
const PRUNE_INTERVAL_MS = 60 * 1000;
/** Hard ceiling on tracked windows, enforced during the sweep. */
const MAX_TRACKED_KEYS = 50_000;

const warnedEnvNames = new Set<string>();

/**
 * The per-client rule, honouring `PUBLIC_DASHBOARD_RATE_LIMIT`
 * (`max:windowSeconds`, e.g. `60:60`). Read per call rather than once at boot
 * so an override applies without a restart.
 */
export function limitRule(): RateLimitRule {
  return readRuleFromEnv('PUBLIC_DASHBOARD_RATE_LIMIT', DEFAULT_RULE);
}

/**
 * The backstop rule: the explicit `PUBLIC_DASHBOARD_BACKSTOP_RATE_LIMIT`
 * override if set, otherwise a multiple of whatever per-client rule is in
 * effect, so the two tiers stay proportional when only the primary is tuned.
 */
export function backstopRule(primary: RateLimitRule): RateLimitRule {
  return readRuleFromEnv('PUBLIC_DASHBOARD_BACKSTOP_RATE_LIMIT', {
    max: primary.max * BACKSTOP_MULTIPLIER,
    windowSeconds: primary.windowSeconds,
  });
}

/**
 * Parses a `max:windowSeconds` override. Invalid values keep the defaults
 * (with a one-time warning) rather than disabling the limiter.
 */
function readRuleFromEnv(name: string, fallback: RateLimitRule): RateLimitRule {
  const raw = process.env[name];
  if (!raw) return fallback;

  const match = /^(\d+):(\d+)$/.exec(raw.trim());
  if (!match || Number(match[1]) < 1 || Number(match[2]) < 1) {
    if (!warnedEnvNames.has(name)) {
      warnedEnvNames.add(name);
      new Logger('PublicDashboardRateLimit').warn(
        `Invalid ${name}="${raw}" (expected "max:seconds"); using ${fallback.max}:${fallback.windowSeconds}`,
      );
    }
    return fallback;
  }

  return { max: Number(match[1]), windowSeconds: Number(match[2]) };
}
