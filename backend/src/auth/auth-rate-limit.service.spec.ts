import { HttpException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  AuthRateLimitService,
  backstopLimitFor,
  limitFor,
  resolveEdgeObservedIp,
  resolveRateLimitIdentity,
} from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  describe('resolveRateLimitIdentity', () => {
    it('keys the Vercel path on the reported client IP plus the edge-observed IP', () => {
      expect(
        resolveRateLimitIdentity(
          {
            'x-vercel-forwarded-for': '203.0.113.10',
            'cf-connecting-ip': '198.51.100.50',
          },
          '10.0.0.1',
        ),
      ).toEqual({ primaryIp: '203.0.113.10', edgeIp: '198.51.100.50' });
    });

    it('collapses to a single bucket when both tiers resolve to the same IP', () => {
      // Vercel reporting the edge's own address (or a direct caller replaying
      // their real IP) must count one bucket exactly once, never twice.
      expect(
        resolveRateLimitIdentity(
          {
            'x-vercel-forwarded-for': '198.51.100.99',
            'cf-connecting-ip': '198.51.100.99',
          },
          '10.0.0.1',
        ),
      ).toEqual({ primaryIp: '198.51.100.99' });
    });

    it('keys direct requests on the edge-observed IP alone', () => {
      expect(
        resolveRateLimitIdentity(
          { 'x-forwarded-for': '203.0.113.99 , 198.51.100.7' },
          '10.0.0.1',
        ),
      ).toEqual({ primaryIp: '198.51.100.7' });
    });

    it('uses the socket address for direct requests without proxy headers', () => {
      expect(resolveRateLimitIdentity({}, '127.0.0.1')).toEqual({
        primaryIp: '127.0.0.1',
      });
    });

    it('keys unresolvable requests onto a shared bucket instead of exempting them', () => {
      expect(resolveRateLimitIdentity({}, undefined)).toEqual({
        primaryIp: 'unknown',
      });
      expect(
        resolveRateLimitIdentity({ 'x-forwarded-for': ' , ' }, undefined),
      ).toEqual({ primaryIp: 'unknown' });
    });

    it('discards junk x-vercel-forwarded-for values rather than trusting them as keys', () => {
      // "edge:1.2.3.4" would collide with the backstop key namespace if it
      // were trusted — it is not a bare IP address, so it is dropped and the
      // request collapses onto its unforgeable edge identity.
      expect(
        resolveRateLimitIdentity(
          {
            'x-vercel-forwarded-for': 'edge:1.2.3.4',
            'cf-connecting-ip': '198.51.100.50',
          },
          '10.0.0.1',
        ),
      ).toEqual({ primaryIp: '198.51.100.50' });
    });
  });

  describe('resolveEdgeObservedIp', () => {
    it('prefers CF-Connecting-IP even when X-Forwarded-For is caller-controlled', () => {
      // The leftmost XFF entry is spoofable; CF-Connecting-IP is written by
      // Render's edge and must win whenever it is present.
      expect(
        resolveEdgeObservedIp(
          {
            'cf-connecting-ip': '198.51.100.50',
            'x-forwarded-for': '203.0.113.99, 198.51.100.50',
          },
          '10.0.0.1',
        ),
      ).toBe('198.51.100.50');
    });

    it('falls back to the rightmost X-Forwarded-For entry — never the spoofable leftmost', () => {
      expect(
        resolveEdgeObservedIp(
          { 'x-forwarded-for': '203.0.113.99 , 198.51.100.50' },
          '10.0.0.1',
        ),
      ).toBe('198.51.100.50');
    });

    it('ignores x-real-ip entirely', () => {
      expect(
        resolveEdgeObservedIp({ 'x-real-ip': '192.0.2.5' }, '10.0.0.1'),
      ).toBe('10.0.0.1');
    });

    it('uses the socket address for direct requests without proxy headers', () => {
      expect(resolveEdgeObservedIp({}, '127.0.0.1')).toBe('127.0.0.1');
    });

    it('keys unresolvable requests onto a shared bucket', () => {
      expect(resolveEdgeObservedIp({}, undefined)).toBe('unknown');
      expect(
        resolveEdgeObservedIp({ 'x-forwarded-for': ' , ' }, undefined),
      ).toBe('unknown');
    });

    it('tolerates Node array-valued headers and normalises case', () => {
      // Node joins repeated headers into an array; the last array element
      // then splits into its comma chain — the trustworthy end of both.
      expect(
        resolveEdgeObservedIp(
          { 'x-forwarded-for': ['203.0.113.20', '198.51.100.1'] },
          '10.0.0.1',
        ),
      ).toBe('198.51.100.1');
      expect(
        resolveEdgeObservedIp(
          { 'x-forwarded-for': ['203.0.113.20, 198.51.100.1'] },
          '10.0.0.1',
        ),
      ).toBe('198.51.100.1');
      expect(
        resolveEdgeObservedIp(
          { 'cf-connecting-ip': ['2001:DB8::1'] },
          '10.0.0.1',
        ),
      ).toBe('2001:db8::1');
    });
  });

  describe('limitFor', () => {
    const ENV_NAMES = ['AUTH_SIGN_IN_RATE_LIMIT', 'AUTH_EMAIL_RATE_LIMIT'];

    afterEach(() => {
      for (const name of ENV_NAMES) delete process.env[name];
    });

    it('defaults to 10 attempts / 5 minutes for password and 5 sends / 15 minutes for email', () => {
      expect(limitFor('password')).toEqual({ max: 10, windowSeconds: 300 });
      expect(limitFor('email')).toEqual({ max: 5, windowSeconds: 900 });
    });

    it('honours max:windowSeconds overrides per policy', () => {
      process.env.AUTH_SIGN_IN_RATE_LIMIT = '3:60';
      process.env.AUTH_EMAIL_RATE_LIMIT = '2:120';

      expect(limitFor('password')).toEqual({ max: 3, windowSeconds: 60 });
      expect(limitFor('email')).toEqual({ max: 2, windowSeconds: 120 });
    });

    it('keeps the safe default on malformed overrides instead of disabling the limiter', () => {
      process.env.AUTH_SIGN_IN_RATE_LIMIT = 'not-a-limit';
      process.env.AUTH_EMAIL_RATE_LIMIT = '-5:0';

      expect(limitFor('password')).toEqual({ max: 10, windowSeconds: 300 });
      expect(limitFor('email')).toEqual({ max: 5, windowSeconds: 900 });
    });
  });

  describe('backstopLimitFor', () => {
    const ENV_NAMES = [
      'AUTH_SIGN_IN_RATE_LIMIT',
      'AUTH_EMAIL_RATE_LIMIT',
      'AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT',
      'AUTH_EMAIL_BACKSTOP_RATE_LIMIT',
    ];

    afterEach(() => {
      for (const name of ENV_NAMES) delete process.env[name];
    });

    it('defaults to ten times the primary budget with the same window', () => {
      expect(backstopLimitFor('password')).toEqual({
        max: 100,
        windowSeconds: 300,
      });
      expect(backstopLimitFor('email')).toEqual({
        max: 50,
        windowSeconds: 900,
      });
    });

    it('stays proportional when the primary budget is overridden', () => {
      process.env.AUTH_SIGN_IN_RATE_LIMIT = '3:60';

      expect(backstopLimitFor('password')).toEqual({
        max: 30,
        windowSeconds: 60,
      });
    });

    it('honours an explicit backstop override over the multiplier', () => {
      process.env.AUTH_EMAIL_BACKSTOP_RATE_LIMIT = '7:900';

      expect(backstopLimitFor('email')).toEqual({ max: 7, windowSeconds: 900 });
    });

    it('keeps the proportional default on malformed backstop overrides', () => {
      process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT = 'lots';

      expect(backstopLimitFor('password')).toEqual({
        max: 100,
        windowSeconds: 300,
      });
    });
  });

  describe('enforce', () => {
    const execute = jest.fn();
    let service: AuthRateLimitService;

    beforeEach(() => {
      execute.mockReset();
      execute.mockResolvedValue({ rows: [] });
      service = new AuthRateLimitService({
        database: { execute },
      } as unknown as DatabaseService);
    });

    afterEach(() => {
      delete process.env.AUTH_SIGN_IN_RATE_LIMIT;
      delete process.env.AUTH_EMAIL_RATE_LIMIT;
      delete process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT;
      delete process.env.AUTH_EMAIL_BACKSTOP_RATE_LIMIT;
    });

    /** Collects the bound SQL parameter values of the n-th upsert. */
    function chunkValuesOf(call: number): unknown[] {
      const calls = execute.mock.calls as unknown[][];
      const upsert = calls[call][0] as { queryChunks: unknown[] };
      return upsert.queryChunks.map((chunk) =>
        typeof chunk === 'object' && chunk !== null && 'value' in chunk
          ? chunk.value
          : chunk,
      );
    }

    it('consumes exactly one bucket for a single-tier identity', async () => {
      execute.mockResolvedValueOnce({ rows: [{ count: 10 }] });
      process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';

      await expect(
        service.enforce('password', { primaryIp: '203.0.113.7' }),
      ).resolves.toBe(undefined);

      // A single-tier identity must consume exactly one bucket — the upsert
      // keyed on the policy and the IP, never on the email: keys are the only
      // place a request's identity could leak into storage. (Drizzle's
      // template SQL interleaves StringChunk objects with the raw bound
      // values, so both are collected to inspect the parameters. A fresh
      // service instance also fires the opportunistic prune sweep; its only
      // bound value is the retention seconds, not a bucket key.)
      const upserts = execute.mock.calls
        .map((_, index) => chunkValuesOf(index))
        .filter((values) => values.includes('password:203.0.113.7'));
      expect(upserts).toHaveLength(1);
      expect(upserts[0]).toContain(300);
      // No backstop bucket exists for a collapsed identity — the one bucket
      // must not be double-counted.
      expect(
        execute.mock.calls.some((_, index) =>
          chunkValuesOf(index).some(
            (value) =>
              typeof value === 'string' && value.startsWith('password:edge:'),
          ),
        ),
      ).toBe(false);
    });

    it('consumes the unforgeable backstop first, then the per-identity bucket', async () => {
      process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';

      await expect(
        service.enforce('password', {
          primaryIp: '203.0.113.7',
          edgeIp: '198.51.100.50',
        }),
      ).resolves.toBe(undefined);

      // The first two database calls are the two bucket upserts, and their
      // order is the security property: the unforgeable backstop runs before
      // the (possibly forged) per-identity bucket. (The opportunistic prune
      // sweep trails afterwards on a fresh instance.)
      expect(chunkValuesOf(0)).toContain('password:edge:198.51.100.50');
      expect(chunkValuesOf(1)).toContain('password:203.0.113.7');
      expect(chunkValuesOf(0)).not.toContain('password:203.0.113.7');
    });

    it('rejects on the backstop without touching the per-identity bucket', async () => {
      process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';
      process.env.AUTH_SIGN_IN_BACKSTOP_RATE_LIMIT = '5:300';
      execute.mockResolvedValueOnce({ rows: [{ count: 6 }] });

      await expect(
        service.enforce('password', {
          primaryIp: '203.0.113.7',
          edgeIp: '198.51.100.50',
        }),
      ).rejects.toThrow('Too many requests. Please try again later.');

      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('throws the generic 429 once the count exceeds the budget', async () => {
      process.env.AUTH_SIGN_IN_RATE_LIMIT = '10:300';
      execute.mockResolvedValueOnce({ rows: [{ count: 11 }] });

      await expect(
        service.enforce('password', { primaryIp: '203.0.113.7' }),
      ).rejects.toThrow('Too many requests. Please try again later.');

      execute.mockResolvedValueOnce({ rows: [{ count: 12 }] });
      await expect(
        service.enforce('password', { primaryIp: '203.0.113.7' }),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('treats a string count from the driver like a number', async () => {
      execute.mockResolvedValueOnce({ rows: [{ count: '6' }] });
      process.env.AUTH_EMAIL_RATE_LIMIT = '5:900';

      await expect(
        service.enforce('email', { primaryIp: '203.0.113.7' }),
      ).rejects.toThrow('Too many requests. Please try again later.');
    });

    it('fails open when the limiter database call fails', async () => {
      execute.mockRejectedValueOnce(new Error('neon fetch failed'));

      await expect(
        service.enforce('password', { primaryIp: '203.0.113.7' }),
      ).resolves.toBeUndefined();
    });
  });
});
