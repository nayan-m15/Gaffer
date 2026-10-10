import { buildCorsOptionsDelegate } from './cors-config';
import {
  allowsDevelopmentOrigins,
  getBetterAuthBaseURL,
  getTrustedOrigins,
  PRODUCTION_FRONTEND_ORIGIN,
} from './trusted-origins';

const LOCALHOST_ORIGINS = ['http://localhost:5173', 'http://localhost:3000'];

describe('allowsDevelopmentOrigins', () => {
  it.each([
    ['development', true],
    ['test', true],
    ['production', false],
    ['staging', false],
    [undefined, false],
  ])('NODE_ENV=%s -> %s', (nodeEnv, expected) => {
    expect(allowsDevelopmentOrigins({ NODE_ENV: nodeEnv })).toBe(expected);
  });
});

describe('getTrustedOrigins', () => {
  it('trusts only the production frontend in production', () => {
    expect(
      getTrustedOrigins({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://gaffer-virid.vercel.app/',
      }),
    ).toEqual([PRODUCTION_FRONTEND_ORIGIN]);
  });

  it('never falls back to localhost when production has no FRONTEND_URL', () => {
    expect(getTrustedOrigins({ NODE_ENV: 'production' })).toEqual([
      PRODUCTION_FRONTEND_ORIGIN,
    ]);
  });

  it('fails closed when NODE_ENV is unset', () => {
    const origins = getTrustedOrigins({});
    for (const origin of LOCALHOST_ORIGINS) {
      expect(origins).not.toContain(origin);
    }
  });

  it('adds an explicitly configured FRONTEND_URL in production', () => {
    expect(
      getTrustedOrigins({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://coach.example.com/app',
      }),
    ).toEqual(['https://coach.example.com', PRODUCTION_FRONTEND_ORIGIN]);
  });

  it('drops an unparseable FRONTEND_URL instead of trusting it', () => {
    expect(
      getTrustedOrigins({ NODE_ENV: 'production', FRONTEND_URL: 'not a url' }),
    ).toEqual([PRODUCTION_FRONTEND_ORIGIN]);
  });

  it.each(['development', 'test'])(
    'keeps the localhost origins in %s',
    (nodeEnv) => {
      expect(
        getTrustedOrigins({
          NODE_ENV: nodeEnv,
          FRONTEND_URL: 'http://localhost:5173',
        }),
      ).toEqual([
        'http://localhost:5173',
        PRODUCTION_FRONTEND_ORIGIN,
        'http://localhost:3000',
      ]);
    },
  );
});

describe('getBetterAuthBaseURL', () => {
  it('uses BETTER_AUTH_URL whenever it is set', () => {
    expect(
      getBetterAuthBaseURL({
        NODE_ENV: 'production',
        BETTER_AUTH_URL: 'https://gaffer-virid.vercel.app',
      }),
    ).toBe('https://gaffer-virid.vercel.app');
  });

  it('falls back to the production frontend, not localhost, in production', () => {
    expect(getBetterAuthBaseURL({ NODE_ENV: 'production' })).toBe(
      PRODUCTION_FRONTEND_ORIGIN,
    );
  });

  it('falls back to the local backend in development', () => {
    expect(getBetterAuthBaseURL({ NODE_ENV: 'development' })).toBe(
      'http://localhost:3000',
    );
  });
});

describe('production CORS policy', () => {
  const delegate = buildCorsOptionsDelegate(
    new Set(
      getTrustedOrigins({
        NODE_ENV: 'production',
        FRONTEND_URL: PRODUCTION_FRONTEND_ORIGIN,
      }),
    ),
  );

  function resolveOptions(path: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      delegate({ path }, (error, options) =>
        error ? reject(error) : resolve(options ?? {}),
      );
    });
  }

  async function isAllowed(path: string, origin: string): Promise<boolean> {
    const options = await resolveOptions(path);
    const check = options.origin as (
      origin: string | undefined,
      cb: (error: Error | null, allow?: boolean) => void,
    ) => void;
    return new Promise((resolve) =>
      check(origin, (error, allow) => resolve(!error && allow === true)),
    );
  }

  it('allows credentialed requests from the Vercel frontend', async () => {
    await expect(isAllowed('/teams', PRODUCTION_FRONTEND_ORIGIN)).resolves.toBe(
      true,
    );
  });

  it.each([...LOCALHOST_ORIGINS, 'https://evil.example.com'])(
    'rejects credentialed requests from %s',
    async (origin) => {
      await expect(isAllowed('/teams', origin)).resolves.toBe(false);
    },
  );

  it('keeps the unauthenticated public API open to any origin', async () => {
    await expect(resolveOptions('/v1/formations')).resolves.toEqual({
      origin: '*',
      credentials: false,
    });
  });
});
