import { Injectable, Logger } from '@nestjs/common';

/**
 * Response cache for the unauthenticated dashboard (SEC-008).
 *
 * The public dashboard endpoints are the only anonymous routes that do real
 * database work: `getPlayers` fans a page of athletes out across
 * `athlete_match_stats`, `matches`, `events`, `competitions` and `seasons`,
 * with correlated `match_events` counts evaluated per athlete-match row. The
 * row count is therefore `page size x matches per athlete`, and before this
 * cache every anonymous request re-ran that aggregation from scratch — so the
 * same URL requested in a loop multiplied database load without limit.
 *
 * ## Why a cache is close to a complete answer here
 *
 * Every filter is a validated UUID (`public-api.schemas.ts`), so the set of
 * queries that return anything at all is the finite set of real team,
 * competition and season combinations — a small, enumerable key space that
 * this cache covers in full. A caller who invents UUIDs instead gets an empty
 * athlete page, which `getPlayers` short-circuits before the expensive join
 * runs. Forcing repeated expensive work therefore means repeatedly missing on
 * a *real* combination, which is exactly what the TTL prevents.
 *
 * ## Single-flight
 *
 * A TTL alone does not stop a burst: N simultaneous requests for a cold key
 * would all miss and all run the aggregation. Concurrent callers for the same
 * key therefore share one in-flight promise, so a cold key costs exactly one
 * query no matter how many callers arrive together. This is the property that
 * bounds a deliberate flood, rather than merely the steady state.
 *
 * ## Bounding
 *
 * Entries are capped and evicted oldest-first so that a caller rotating
 * filter values cannot grow the cache without limit. The map is kept in
 * insertion order and a served entry is not reordered: eviction is by age,
 * not by recency, which keeps a flood of one-off keys from displacing the
 * popular ones for longer than a TTL.
 *
 * In-memory and therefore per-instance: two Render instances keep independent
 * copies, each honouring the same TTL. That is deliberate — the alternative
 * (a shared store) would put a database round trip back on the hot path of a
 * change whose entire purpose is to take database work off it. Correctness
 * does not depend on instances agreeing, only on each bounding its own load.
 */
@Injectable()
export class PublicDashboardCacheService {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  /**
   * Returns `key`'s cached value, or runs `load` and caches the result.
   *
   * Rejections are never cached and never shared beyond the callers already
   * waiting on them, so a transient database failure costs one failed request
   * rather than poisoning the key for a whole TTL.
   */
  async resolve<T>(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }
    if (cached) this.entries.delete(key);

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const request = load()
      .then((value) => {
        this.store(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, request);
    return request;
  }

  /**
   * Builds a cache key from a route and its *validated* query object. Keys are
   * derived from the parsed DTO rather than the raw query string so that
   * requests differing only in parameter order, omitted-versus-default values
   * or casing collapse onto one entry instead of each paying for its own miss.
   */
  static key(route: string, query: Record<string, unknown>): string {
    const normalised = Object.keys(query)
      .filter((name) => query[name] !== undefined)
      .sort()
      .map((name) => `${name}=${String(query[name])}`)
      .join('&');
    return normalised ? `${route}?${normalised}` : route;
  }

  private store(key: string, value: unknown): void {
    if (this.entries.size >= maxEntries() && !this.entries.has(key)) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds() * 1000,
    });
  }

  /** Drops every entry. Exposed for tests; nothing in the app calls it. */
  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

/**
 * How long a public dashboard response is reused. Thirty seconds keeps the
 * page effectively live — a result logged during a match shows up on the next
 * refresh — while collapsing any realistic burst of identical anonymous
 * requests onto a single query. This data has no per-viewer component, so
 * every anonymous caller is served the same bytes by design.
 */
const DEFAULT_TTL_SECONDS = 30;

/**
 * Entry ceiling. The real key space is small (one entry per route per filter
 * combination that exists), so this is sized for the rotating-UUID case
 * rather than for legitimate traffic: 500 cached responses bound the memory a
 * caller can cause while leaving ample room for every genuine combination.
 */
const DEFAULT_MAX_ENTRIES = 500;

const warnedEnvNames = new Set<string>();

/** Reads `PUBLIC_DASHBOARD_CACHE_TTL_SECONDS`, falling back to the default. */
function ttlSeconds(): number {
  return readPositiveIntFromEnv(
    'PUBLIC_DASHBOARD_CACHE_TTL_SECONDS',
    DEFAULT_TTL_SECONDS,
  );
}

/** Reads `PUBLIC_DASHBOARD_CACHE_MAX_ENTRIES`, falling back to the default. */
function maxEntries(): number {
  return readPositiveIntFromEnv(
    'PUBLIC_DASHBOARD_CACHE_MAX_ENTRIES',
    DEFAULT_MAX_ENTRIES,
  );
}

/**
 * Parses a positive integer override. Read per call rather than once at boot
 * so an operator can retune a hot cache without a restart; invalid values keep
 * the default (with a one-time warning) rather than disabling the cache.
 */
function readPositiveIntFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const parsed = Number(raw.trim());
  if (!Number.isInteger(parsed) || parsed < 1) {
    if (!warnedEnvNames.has(name)) {
      warnedEnvNames.add(name);
      new Logger('PublicDashboardCache').warn(
        `Invalid ${name}="${raw}" (expected a positive integer); using ${fallback}`,
      );
    }
    return fallback;
  }
  return parsed;
}
