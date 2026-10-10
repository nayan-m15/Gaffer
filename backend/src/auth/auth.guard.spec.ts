import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

const getSession = jest.fn();

jest.mock('./auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]): Promise<unknown> =>
        getSession(...args) as Promise<unknown>,
    },
  },
}));

// Jest's unit run is CommonJS and can't `require()` better-auth's ESM-only
// builds (the e2e config solves this with a Babel transform; the unit config
// has none). The guard only uses `fromNodeHeaders` to turn Node's header
// record into a `Headers`, so this stand-in does exactly that.
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: (headers: Record<string, string>) => new Headers(headers),
}));

import { AuthGuard, type AuthenticatedRequest } from './auth.guard';

const session = {
  user: {
    id: 'user-1',
    name: 'Alex Coach',
    email: 'alex@example.com',
    emailVerified: true,
  },
  session: { id: 'session-1' },
};

const requestFor = (headers: Record<string, string> = {}) =>
  ({ headers }) as unknown as AuthenticatedRequest;

const contextFor = (request: AuthenticatedRequest) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as ExecutionContext;

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new AuthGuard();
  });

  it('attaches the resolved user and session to the request', async () => {
    getSession.mockResolvedValue(session);
    const request = requestFor({ cookie: 'better-auth.session_token=abc' });

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

    expect(request.user).toEqual(session.user);
    expect(request.sessionId).toBe('session-1');
  });

  it('forwards the request headers to Better Auth', async () => {
    getSession.mockResolvedValue(session);

    await guard.canActivate(
      contextFor(requestFor({ cookie: 'better-auth.session_token=abc' })),
    );

    const [{ headers }] = getSession.mock.calls[0] as [{ headers: Headers }];
    expect(headers.get('cookie')).toBe('better-auth.session_token=abc');
  });

  it('rejects a request with no session', async () => {
    getSession.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor(requestFor()))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('does not attach a user when the session is missing', async () => {
    getSession.mockResolvedValue(null);
    const request = requestFor();

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(request.user).toBeUndefined();
    expect(request.sessionId).toBeUndefined();
  });

  it('reports a database connection failure as 503, not 401', async () => {
    // The guard must not tell an authenticated user to sign in again just
    // because the database was briefly unreachable.
    getSession.mockRejectedValue(new Error('fetch failed: ETIMEDOUT'));

    await expect(guard.canActivate(contextFor(requestFor()))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('recognises a connection failure carried on the error cause', async () => {
    getSession.mockRejectedValue(
      new Error('fetch failed', { cause: new Error('ECONNREFUSED') }),
    );

    await expect(guard.canActivate(contextFor(requestFor()))).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('rethrows an unrelated failure untouched', async () => {
    const failure = new Error('better-auth exploded');
    getSession.mockRejectedValue(failure);

    await expect(guard.canActivate(contextFor(requestFor()))).rejects.toBe(
      failure,
    );
  });

  it('rethrows its own unauthorized rejection rather than masking it as 503', async () => {
    getSession.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor(requestFor()))).rejects.toThrow(
      'Sign in required.',
    );
  });
});
