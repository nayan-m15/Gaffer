import { buildCorsOptionsDelegate, isPublicApiPath } from './cors-config';

describe('isPublicApiPath', () => {
  it.each([
    ['/v1/formations', true],
    ['/v1/formations?id=4-3-3', true],
    ['/v1/tactics', true],
    ['/v1/tactics?id=possession', true],
    ['/game-plans', false],
    ['/teams', false],
    ['/v1/formations-typo', true], // startsWith is intentionally prefix-based
  ])('%s -> %s', (path, expected) => {
    expect(isPublicApiPath(path)).toBe(expected);
  });
});

describe('buildCorsOptionsDelegate', () => {
  const allowedOrigins = new Set(['https://gaffer-virid.vercel.app']);
  const delegate = buildCorsOptionsDelegate(allowedOrigins);

  function resolve(path: string): Promise<Record<string, unknown> | undefined> {
    return new Promise((resolve, reject) => {
      delegate({ path }, (error, options) => {
        if (error) reject(error);
        else resolve(options);
      });
    });
  }

  it('allows any origin, without credentials, for the public API', async () => {
    const options = await resolve('/v1/formations');
    expect(options).toEqual({ origin: '*', credentials: false });
  });

  it('allows any origin, without credentials, for public tactics routes', async () => {
    const options = await resolve('/v1/tactics');
    expect(options).toEqual({ origin: '*', credentials: false });
  });

  it('uses a strict, credentialed origin check for every other route', async () => {
    const options = await resolve('/teams');
    expect(options?.credentials).toBe(true);
    expect(typeof options?.origin).toBe('function');

    const originFn = options?.origin as (
      origin: string | undefined,
      cb: (error: Error | null, allow?: boolean) => void,
    ) => void;

    await expect(
      new Promise((res, rej) =>
        originFn('https://gaffer-virid.vercel.app', (err, allow) =>
          err ? rej(err) : res(allow),
        ),
      ),
    ).resolves.toBe(true);

    await expect(
      new Promise((res, rej) =>
        originFn(undefined, (err, allow) => (err ? rej(err) : res(allow))),
      ),
    ).resolves.toBe(true);

    await expect(
      new Promise((res, rej) =>
        originFn('https://evil.example.com', (err, allow) =>
          err ? rej(err) : res(allow),
        ),
      ),
    ).rejects.toThrow('Origin is not allowed by CORS.');
  });
});
