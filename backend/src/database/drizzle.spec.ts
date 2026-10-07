import { resilientFetch } from './drizzle';

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
