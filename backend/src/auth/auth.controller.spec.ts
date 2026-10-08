import { Test, TestingModule } from '@nestjs/testing';

jest.mock('./auth', () => ({
  auth: {
    api: {
      signUpEmail: jest.fn(),
      sendVerificationEmail: jest.fn(),
      signInEmail: jest.fn(),
      changePassword: jest.fn(),
      setPassword: jest.fn(),
      listUserAccounts: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

jest.mock('./auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

// Jest's unit run is CommonJS and can't `require()` better-auth's ESM-only
// builds (the e2e config solves this with a Babel transform; the unit config
// has none). The controller only needs `APIError`'s shape — instanceof,
// `body.message`, `statusCode` — so this minimal stand-in replaces the real
// class for unit purposes, and the e2e suite covers the real thing.
jest.mock('better-auth/api', () => {
  class APIError extends Error {
    readonly statusCode: number;
    readonly body: { message?: string } | undefined;

    constructor(status: string, body?: { message?: string }) {
      super(body?.message ?? 'Authentication request failed.');
      this.statusCode =
        status === 'TOO_MANY_REQUESTS'
          ? 429
          : status === 'FORBIDDEN'
            ? 403
            : 400;
      this.body = body;
    }
  }
  return { APIError };
});

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
  toNodeHandler: jest.fn(),
}));

import { HttpException, HttpStatus } from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request, Response } from 'express';
import { auth } from './auth';
import { AuthController } from './auth.controller';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { AthletesService } from '../athletes/athletes.service';
import { TeamsService } from '../teams/teams.service';

const signUpEmail = auth.api.signUpEmail as unknown as jest.Mock;
const signInEmail = auth.api.signInEmail as unknown as jest.Mock;
const changePassword = auth.api.changePassword as unknown as jest.Mock;
const setPassword = auth.api.setPassword as unknown as jest.Mock;
const listUserAccounts = auth.api.listUserAccounts as unknown as jest.Mock;
const sendVerificationEmail = auth.api
  .sendVerificationEmail as unknown as jest.Mock;
const fromNodeHeadersMock = fromNodeHeaders as unknown as jest.Mock;

/**
 * Minimal Express request shape `signIn` reads. It must satisfy both features
 * the merged controller wires in: the socket address the rate limiter keys on
 * (SEC-002) alongside the headers, and the protocol/host/originalUrl/method
 * the rebuilt web `Request` handed to Better Auth needs for login-CSRF
 * validation (SEC-003).
 */
const signInRequest = (headers: Record<string, string> = {}) =>
  ({
    headers,
    protocol: 'http',
    originalUrl: '/auth/sign-in',
    method: 'POST',
    socket: { remoteAddress: '203.0.113.7' },
  }) as unknown as Request;

// Stand-in for the Express request the limiter keys on. Unit tests only
// exercise the wiring (which policy, which identity) —
// `resolveRateLimitIdentity` itself has its own dedicated spec. Sign-up and
// the resend never build a web Request, so unlike `signInRequest` this shape
// carries no protocol/URL fields — keep `signInRequest` for `signIn` tests.
const makeReq = (headers: Record<string, string> = {}): Request =>
  ({
    headers,
    socket: { remoteAddress: '203.0.113.7' },
  }) as unknown as Request;

// Mirrors the controller's own fallback so expectations track whatever the
// environment actually resolved FRONTEND_URL to.
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

// Mirrors the controller's `expireDontRememberCookie` naming so these
// expectations hold whether or not the test env resolved BETTER_AUTH_URL.
const BETTER_AUTH_URL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const SECURE_COOKIE_PREFIX = BETTER_AUTH_URL.startsWith('https://')
  ? '__Secure-'
  : '';
const EXPIRED_DONT_REMEMBER = `${SECURE_COOKIE_PREFIX}better-auth.dont_remember=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${
  SECURE_COOKIE_PREFIX ? '; Secure' : ''
}`;

// Same shape team-invites issues: base64url of 32 random bytes (43 chars).
const INVITE_TOKEN = 'A'.repeat(43);

const signUpResponse = (emailVerified: boolean) => ({
  headers: new Headers(),
  response: {
    user: {
      id: 'user-id',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified,
    },
  },
});

describe('AuthController', () => {
  let controller: AuthController;

  // Minimal stateful header store so `getHeader` sees what `setHeader` wrote,
  // mirroring Express's real response semantics
  // (`expireDontRememberCookie` appends to the cookies `forwardSetCookie`
  // just set on the response).
  let responseHeaders: Map<string, string | string[]>;
  const res = {
    setHeader: jest.fn((name: string, value: string | string[]) => {
      responseHeaders.set(name, value);
    }),
    getHeader: jest.fn((name: string) => responseHeaders.get(name)),
  } as unknown as Response;

  const enforceRateLimit = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    responseHeaders = new Map<string, string | string[]>();
    enforceRateLimit.mockReset();
    enforceRateLimit.mockResolvedValue(undefined);
    // The controller builds the web Request it forwards to Better Auth from
    // these headers, so the mock mirrors the real adapter's behaviour.
    fromNodeHeadersMock.mockImplementation(
      (headers: Record<string, string>) => new Headers(headers),
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: TeamsService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: AthletesService, useValue: {} },
        {
          provide: AuthRateLimitService,
          useValue: { enforce: enforceRateLimit },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signUp', () => {
    it('enforces the email rate limit policy against the request identity before anything else', async () => {
      signUpEmail.mockResolvedValue(signUpResponse(false));
      const req = makeReq({ 'x-forwarded-for': '198.51.100.9' });

      await controller.signUp(
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'password123',
        },
        req,
        res,
      );

      // No x-vercel-forwarded-for: the single unforgeable bucket keyed on the
      // edge-observed IP (rightmost XFF entry here) is the whole identity.
      expect(enforceRateLimit).toHaveBeenCalledWith('email', {
        primaryIp: '198.51.100.9',
      });
    });

    it('passes the two-tier Vercel-path identity through to the limiter', async () => {
      signUpEmail.mockResolvedValue(signUpResponse(false));
      const req = makeReq({
        'x-vercel-forwarded-for': '203.0.113.10',
        'cf-connecting-ip': '198.51.100.50',
      });

      await controller.signUp(
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'password123',
        },
        req,
        res,
      );

      // Per-user bucket keyed on what Vercel reported, backstop bucket keyed
      // on the edge-observed IP — the controller must forward both tiers.
      expect(enforceRateLimit).toHaveBeenCalledWith('email', {
        primaryIp: '203.0.113.10',
        edgeIp: '198.51.100.50',
      });
    });

    it('surfaces the limiter 429 without touching Better Auth', async () => {
      enforceRateLimit.mockRejectedValueOnce(
        new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      await expect(
        controller.signUp(
          {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            password: 'password123',
          },
          makeReq(),
          res,
        ),
      ).rejects.toThrow('Too many requests. Please try again later.');
      expect(signUpEmail).not.toHaveBeenCalled();
    });

    it('sends the standard verified-login callbackURL and reports the verification requirement', async () => {
      signUpEmail.mockResolvedValue(signUpResponse(false));

      const result = await controller.signUp(
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'Password123!',
        },
        makeReq(),
        res,
      );

      expect(signUpEmail).toHaveBeenCalledWith({
        body: {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'Password123!',
          callbackURL: `${FRONTEND_URL}/login?verified=1`,
        },
        returnHeaders: true,
      });
      expect(result).toEqual({
        user: signUpResponse(false).response.user,
        emailVerificationRequired: true,
      });
    });

    it('routes the verification email back to the pending team invite', async () => {
      signUpEmail.mockResolvedValue(signUpResponse(false));

      await controller.signUp(
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'Password123!',
          inviteToken: INVITE_TOKEN,
        },
        makeReq(),
        res,
      );

      expect(signUpEmail).toHaveBeenCalledWith({
        body: {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'Password123!',
          callbackURL: `${FRONTEND_URL}/join-team/${INVITE_TOKEN}`,
        },
        returnHeaders: true,
      });
    });

    it('routes competition signup verification back to the competition invite', async () => {
      signUpEmail.mockResolvedValue(signUpResponse(false));
      await controller.signUp(
        {
          name: 'Ada',
          email: 'ada@example.com',
          password: 'Password123!',
          inviteToken: INVITE_TOKEN,
          inviteKind: 'competition',
        },
        makeReq(),
        res,
      );
      expect(signUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            callbackURL: `${FRONTEND_URL}/join-competition/${INVITE_TOKEN}`,
          }) as unknown,
        }),
      );
    });

    it('rejects an unknown invite kind', async () => {
      await expect(
        controller.signUp(
          {
            name: 'Ada',
            email: 'ada@example.com',
            password: 'Password123!',
            inviteToken: INVITE_TOKEN,
            inviteKind: 'other',
          },
          makeReq(),
          res,
        ),
      ).rejects.toThrow();
      expect(signUpEmail).not.toHaveBeenCalled();
    });

    it('rejects a malformed invite token', async () => {
      await expect(
        controller.signUp(
          {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            password: 'Password123!',
            inviteToken: 'not-a-token',
          },
          makeReq(),
          res,
        ),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(signUpEmail).not.toHaveBeenCalled();
    });
  });

  describe('signIn', () => {
    const sessionCookie =
      'better-auth.session_token=signed-token; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax';
    const dontRememberCookie =
      'better-auth.dont_remember=signed-flag; Path=/; HttpOnly; SameSite=Lax';

    const signInResponse = (cookies: string[]) => {
      const headers = new Headers();
      for (const cookie of cookies) {
        headers.append('set-cookie', cookie);
      }
      return {
        headers,
        response: { user: { id: 'user-id', email: 'ada@example.com' } },
      };
    };

    /** The Set-Cookie state of the mocked response after the call. */
    const finalSetCookie = (): string | string[] | undefined =>
      responseHeaders.get('Set-Cookie');

    it('enforces the password rate limit policy against the request IP before anything else', async () => {
      signInEmail.mockResolvedValue(
        signInResponse([
          'better-auth.session_token=signed-token; Path=/; HttpOnly; SameSite=Lax',
        ]),
      );

      await controller.signIn(
        { email: 'ada@example.com', password: 'password123' },
        signInRequest({ 'x-forwarded-for': '198.51.100.9' }),
        res,
      );

      expect(enforceRateLimit).toHaveBeenCalledWith('password', {
        primaryIp: '198.51.100.9',
      });
      expect(signInEmail).toHaveBeenCalledTimes(1);
    });

    it('surfaces the limiter 429 without attempting authentication', async () => {
      enforceRateLimit.mockRejectedValueOnce(
        new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      await expect(
        controller.signIn(
          { email: 'ada@example.com', password: 'password123' },
          signInRequest(),
          res,
        ),
      ).rejects.toThrow('Too many requests. Please try again later.');
      expect(signInEmail).not.toHaveBeenCalled();
    });

    it('honours rememberMe: true and expires any stale dont_remember flag', async () => {
      signInEmail.mockResolvedValue(signInResponse([sessionCookie]));

      const result = await controller.signIn(
        { email: 'ada@example.com', password: 'password123', rememberMe: true },
        signInRequest({ origin: 'http://localhost:5173' }),
        res,
      );

      expect(signInEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            email: 'ada@example.com',
            password: 'password123',
            rememberMe: true,
          },
          asResponse: false,
          returnHeaders: true,
        }),
      );
      expect(result).toEqual({
        user: { id: 'user-id', email: 'ada@example.com' },
      });
      // The forwarded persistent cookie stays, and the stale "don't remember"
      // flag is expired in the same response so it can no longer downgrade
      // later sessions or block session refresh.
      expect(finalSetCookie()).toEqual([sessionCookie, EXPIRED_DONT_REMEMBER]);
    });

    it('leaves the dont_remember cookie untouched when rememberMe is false', async () => {
      signInEmail.mockResolvedValue(
        signInResponse([
          'better-auth.session_token=signed-token; Path=/; HttpOnly; SameSite=Lax',
          dontRememberCookie,
        ]),
      );

      await controller.signIn(
        {
          email: 'ada@example.com',
          password: 'password123',
          rememberMe: false,
        },
        signInRequest(),
        res,
      );

      expect(signInEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            email: 'ada@example.com',
            password: 'password123',
            rememberMe: false,
          },
          asResponse: false,
          returnHeaders: true,
        }),
      );
      // Browser-session semantics: Better Auth's own cookies are forwarded
      // verbatim and nothing is expired or synthesised.
      expect(finalSetCookie()).toEqual([
        'better-auth.session_token=signed-token; Path=/; HttpOnly; SameSite=Lax',
        dontRememberCookie,
      ]);
    });

    it('treats an omitted rememberMe as false (schema default) without expiring the flag', async () => {
      signInEmail.mockResolvedValue(
        signInResponse([
          'better-auth.session_token=signed-token; Path=/; HttpOnly; SameSite=Lax',
          dontRememberCookie,
        ]),
      );

      await controller.signIn(
        { email: 'ada@example.com', password: 'password123' },
        signInRequest(),
        res,
      );

      expect(signInEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            email: 'ada@example.com',
            password: 'password123',
            rememberMe: false,
          },
          asResponse: false,
          returnHeaders: true,
        }),
      );
      expect(finalSetCookie()).toEqual([
        'better-auth.session_token=signed-token; Path=/; HttpOnly; SameSite=Lax',
        dontRememberCookie,
      ]);
    });

    it('forwards the incoming request so Better Auth can validate it for login CSRF', async () => {
      signInEmail.mockResolvedValue(signInResponse([sessionCookie]));

      await controller.signIn(
        { email: 'ada@example.com', password: 'password123' },
        signInRequest({
          origin: 'http://localhost:5173',
          'sec-fetch-site': 'same-site',
          'sec-fetch-mode': 'cors',
        }),
        res,
      );

      expect(signInEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.any(Headers) as Headers,
          request: expect.any(Request) as Request,
          asResponse: false,
          returnHeaders: true,
        }),
      );
      const calls = signInEmail.mock.calls as {
        request: { method: string; headers: Headers };
      }[][];
      const call = calls[0][0];
      // The rebuilt request must carry the browser's CSRF signals through to
      // Better Auth's `formCsrfMiddleware`; without them it silently no-ops.
      expect(call.request.method).toBe('POST');
      expect(call.request.headers.get('origin')).toBe('http://localhost:5173');
      expect(call.request.headers.get('sec-fetch-site')).toBe('same-site');
      expect(call.request.headers.get('sec-fetch-mode')).toBe('cors');
    });

    it('surfaces Better Auth CSRF rejections as 403 without issuing cookies', async () => {
      // `formCsrfMiddleware` throws APIError(FORBIDDEN) for cross-site or
      // untrusted-origin logins; the wrapper must map that faithfully and
      // forward nothing — no session cookie can leak out of a rejected login.
      signInEmail.mockRejectedValueOnce(
        new APIError('FORBIDDEN', { message: 'Invalid origin' }),
      );

      const rejection = await controller
        .signIn(
          { email: 'ada@example.com', password: 'password123' },
          signInRequest({ origin: 'https://attacker.example' }),
          res,
        )
        .catch((error: unknown) => error);

      expect(rejection).toBeInstanceOf(HttpException);
      expect((rejection as HttpException).getStatus()).toBe(403);
      expect((rejection as HttpException).message).toBe('Invalid origin');
      expect(finalSetCookie()).toBeUndefined();
    });
  });

  describe('sendVerificationEmail', () => {
    it('enforces the email rate limit policy against the request identity before anything else', async () => {
      const result = await controller.sendVerificationEmail(
        {
          email: 'ada@example.com',
        },
        makeReq({ 'x-forwarded-for': '198.51.100.9' }),
      );

      expect(enforceRateLimit).toHaveBeenCalledWith('email', {
        primaryIp: '198.51.100.9',
      });
      expect(result).toEqual({ status: true });
    });

    it('surfaces the limiter 429 without triggering a send', async () => {
      enforceRateLimit.mockRejectedValueOnce(
        new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );

      await expect(
        controller.sendVerificationEmail(
          {
            email: 'ada@example.com',
          },
          makeReq(),
        ),
      ).rejects.toThrow('Too many requests. Please try again later.');
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends the standard verified-login callbackURL', async () => {
      const result = await controller.sendVerificationEmail(
        {
          email: 'ada@example.com',
        },
        makeReq(),
      );

      expect(sendVerificationEmail).toHaveBeenCalledWith({
        body: {
          email: 'ada@example.com',
          callbackURL: `${FRONTEND_URL}/login?verified=1`,
        },
      });
      expect(result).toEqual({ status: true });
    });

    it('routes competition verification resends back to the competition invite', async () => {
      await controller.sendVerificationEmail(
        {
          email: 'ada@example.com',
          inviteToken: INVITE_TOKEN,
          inviteKind: 'competition',
        },
        makeReq(),
      );
      expect(sendVerificationEmail).toHaveBeenCalledWith({
        body: {
          email: 'ada@example.com',
          callbackURL: `${FRONTEND_URL}/join-competition/${INVITE_TOKEN}`,
        },
      });
    });

    it('routes the resend back to the pending team invite', async () => {
      await controller.sendVerificationEmail(
        {
          email: 'ada@example.com',
          inviteToken: INVITE_TOKEN,
        },
        makeReq(),
      );

      expect(sendVerificationEmail).toHaveBeenCalledWith({
        body: {
          email: 'ada@example.com',
          callbackURL: `${FRONTEND_URL}/join-team/${INVITE_TOKEN}`,
        },
      });
    });

    it('rejects a malformed invite token', async () => {
      await expect(
        controller.sendVerificationEmail(
          {
            email: 'ada@example.com',
            inviteToken: 'not-a-token',
          },
          makeReq(),
        ),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('swallows non-disclosing Better Auth APIErrors so sends stay indistinguishable', async () => {
      sendVerificationEmail.mockRejectedValueOnce(
        new APIError('USER_NOT_FOUND', { message: 'User not found.' }),
      );

      const result = await controller.sendVerificationEmail(
        {
          email: 'ada@example.com',
        },
        makeReq(),
      );

      expect(result).toEqual({ status: true });
    });

    it('surfaces actionable Better Auth APIErrors like rate limiting', async () => {
      sendVerificationEmail.mockRejectedValueOnce(
        new APIError('TOO_MANY_REQUESTS', { message: 'Too many requests.' }),
      );

      await expect(
        controller.sendVerificationEmail(
          {
            email: 'ada@example.com',
          },
          makeReq(),
        ),
      ).rejects.toThrow('Too many requests.');
    });
  });

  describe('passwordStatus', () => {
    const req = {
      headers: { cookie: 'better-auth.session_token=signed-token' },
    } as never;

    it('reports when a credential password exists', async () => {
      listUserAccounts.mockResolvedValue([
        { id: 'google-account', providerId: 'google' },
        { id: 'credential-account', providerId: 'credential' },
      ]);

      await expect(controller.passwordStatus(req)).resolves.toEqual({
        hasPassword: true,
      });
    });

    it('reports OAuth-only accounts as having no password', async () => {
      listUserAccounts.mockResolvedValue([
        { id: 'google-account', providerId: 'google' },
      ]);

      await expect(controller.passwordStatus(req)).resolves.toEqual({
        hasPassword: false,
      });
    });
  });

  describe('setPassword', () => {
    const req = {
      headers: { cookie: 'better-auth.session_token=signed-token' },
    } as never;

    it('sets the first password for an OAuth-only account', async () => {
      listUserAccounts.mockResolvedValue([
        { id: 'google-account', providerId: 'google' },
      ]);
      setPassword.mockResolvedValue({ status: true });

      await expect(
        controller.setPassword({ newPassword: 'Newpassword456!' }, req),
      ).resolves.toEqual({ status: true });

      expect(setPassword).toHaveBeenCalledWith({
        body: { newPassword: 'Newpassword456!' },
        headers: new Headers({
          cookie: 'better-auth.session_token=signed-token',
        }),
      });
    });

    it('refuses to overwrite an existing credential password without current-password verification', async () => {
      listUserAccounts.mockResolvedValue([
        { id: 'credential-account', providerId: 'credential' },
      ]);

      await expect(
        controller.setPassword({ newPassword: 'Newpassword456!' }, req),
      ).rejects.toThrow(
        'A password is already set for this account. Use Change Password instead.',
      );

      expect(setPassword).not.toHaveBeenCalled();
    });

    it('applies the same strong password policy to first-time passwords', async () => {
      await expect(
        controller.setPassword({ newPassword: 'short' }, req),
      ).rejects.toThrow('Password must be at least 8 characters.');

      expect(listUserAccounts).not.toHaveBeenCalled();
      expect(setPassword).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const req = {
      headers: { cookie: 'better-auth.session_token=signed-token' },
    } as never;

    it('verifies the current password, changes it and revokes other sessions', async () => {
      changePassword.mockResolvedValue({ status: true });

      const result = await controller.changePassword(
        {
          currentPassword: 'password123',
          newPassword: 'Newpassword456!',
        },
        req,
      );

      expect(changePassword).toHaveBeenCalledWith({
        body: {
          currentPassword: 'password123',
          newPassword: 'Newpassword456!',
          revokeOtherSessions: true,
        },
        headers: new Headers({
          cookie: 'better-auth.session_token=signed-token',
        }),
      });
      expect(result).toEqual({ status: true });
    });

    it('rejects a new password shorter than the eight-character minimum', async () => {
      await expect(
        controller.changePassword(
          {
            currentPassword: 'password123',
            newPassword: 'short',
          },
          req,
        ),
      ).rejects.toThrow('Password must be at least 8 characters.');

      expect(changePassword).not.toHaveBeenCalled();
    });

    it('rejects a new password that does not meet the complexity requirements', async () => {
      await expect(
        controller.changePassword(
          {
            currentPassword: 'password123',
            newPassword: 'alllowercase123!',
          },
          req,
        ),
      ).rejects.toThrow('Password must include at least one uppercase letter.');

      expect(changePassword).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password as the new password', async () => {
      await expect(
        controller.changePassword(
          {
            currentPassword: 'Password123!',
            newPassword: 'Password123!',
          },
          req,
        ),
      ).rejects.toThrow(
        'New password must be different from your current password.',
      );

      expect(changePassword).not.toHaveBeenCalled();
    });

    it('requires the current password before calling Better Auth', async () => {
      await expect(
        controller.changePassword(
          {
            currentPassword: '',
            newPassword: 'Newpassword456!',
          },
          req,
        ),
      ).rejects.toThrow('Current password is required.');

      expect(changePassword).not.toHaveBeenCalled();
    });
  });
});
