import {
  createDatabaseClient,
  isDatabaseConnectionError,
  resilientFetch,
} from './drizzle';

/** A "fetch failed" TypeError as undici raises it, wrapping a socket error. */
function fetchFailed(cause: unknown): TypeError {
  return new TypeError('fetch failed', { cause });
}

function socketError(code: string, syscall: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${syscall} ${code}`), { code, syscall });
}

describe('resilientFetch', () => {
  const ok = new Response('{}', { status: 200 });
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries when every address timed out while connecting', async () => {
    fetchMock
      .mockRejectedValueOnce(
        fetchFailed(
          new AggregateError([
            socketError('ETIMEDOUT', 'connect'),
            socketError('ENETUNREACH', 'connect'),
          ]),
        ),
      )
      .mockRejectedValueOnce(
        fetchFailed(
          Object.assign(new Error('Connect Timeout Error'), {
            code: 'UND_ERR_CONNECT_TIMEOUT',
          }),
        ),
      )
      .mockResolvedValueOnce(ok);

    await expect(
      resilientFetch('https://db.example/sql', { method: 'POST' }),
    ).resolves.toBe(ok);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never replays a request that may already have reached the database', async () => {
    fetchMock.mockRejectedValue(fetchFailed(socketError('ECONNRESET', 'read')));

    await expect(
      resilientFetch('https://db.example/sql', { method: 'POST' }),
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after a bounded number of connection attempts', async () => {
    fetchMock.mockRejectedValue(
      fetchFailed(socketError('ECONNREFUSED', 'connect')),
    );

    await expect(
      resilientFetch('https://db.example/sql', { method: 'POST' }),
    ).rejects.toThrow('fetch failed');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  }, 10_000);
});

describe('isDatabaseConnectionError', () => {
  it('ignores a falsy value', () => {
    expect(isDatabaseConnectionError(null)).toBe(false);
    expect(isDatabaseConnectionError(undefined)).toBe(false);
    expect(isDatabaseConnectionError('')).toBe(false);
  });

  it.each([
    'ConnectTimeoutError',
    'UND_ERR_CONNECT_TIMEOUT',
    'Failed to get session',
    'Failed query: select 1',
    'fetch failed',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'NeonDbError: relation missing',
  ])('recognises %p as a connection failure', (text) => {
    expect(isDatabaseConnectionError(new Error(text))).toBe(true);
  });

  it('matches regardless of casing', () => {
    expect(isDatabaseConnectionError(new Error('econnreset'))).toBe(true);
    expect(isDatabaseConnectionError(new Error('EConnReset'))).toBe(true);
  });

  it('reads a plain string error', () => {
    expect(isDatabaseConnectionError('fetch failed')).toBe(true);
    expect(isDatabaseConnectionError('bad request')).toBe(false);
  });

  it('reads the message carried on an error cause', () => {
    expect(
      isDatabaseConnectionError(
        new Error('request failed', { cause: new Error('ETIMEDOUT') }),
      ),
    ).toBe(true);
  });

  it('reads a string cause', () => {
    expect(
      isDatabaseConnectionError(
        new Error('request failed', { cause: 'ECONNREFUSED' }),
      ),
    ).toBe(true);
  });

  it('reads an object cause by serialising it', () => {
    expect(
      isDatabaseConnectionError(
        new Error('request failed', { cause: { code: 'ECONNRESET' } }),
      ),
    ).toBe(true);
  });

  it('tolerates an unserialisable cause', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      isDatabaseConnectionError(new Error('nope', { cause: circular })),
    ).toBe(false);
  });

  it('tolerates a nullish cause', () => {
    expect(
      isDatabaseConnectionError(new Error('nope', { cause: undefined })),
    ).toBe(false);
  });

  it('serialises a plain object thrown as an error', () => {
    expect(isDatabaseConnectionError({ message: 'fetch failed' })).toBe(true);
    expect(isDatabaseConnectionError({ message: 'bad input' })).toBe(false);
  });

  it('ignores a non-object, non-string value', () => {
    expect(isDatabaseConnectionError(42)).toBe(false);
  });

  it('does not misread an ordinary application error', () => {
    expect(isDatabaseConnectionError(new Error('Athlete not found.'))).toBe(
      false,
    );
  });
});

describe('createDatabaseClient', () => {
  const originalUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  it('refuses to build a client without a connection string', () => {
    delete process.env.DATABASE_URL;

    expect(() => createDatabaseClient()).toThrow('DATABASE_URL is required');
  });

  it('refuses an explicitly empty connection string', () => {
    expect(() => createDatabaseClient('')).toThrow('DATABASE_URL is required');
  });

  it('builds a client from an explicit connection string', () => {
    expect(
      createDatabaseClient('postgres://user:pass@db.test/neondb'),
    ).toBeDefined();
  });

  it('falls back to the environment variable', () => {
    process.env.DATABASE_URL = 'postgres://user:pass@db.test/neondb';

    expect(createDatabaseClient()).toBeDefined();
  });
});
