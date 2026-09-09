import { Test, TestingModule } from '@nestjs/testing';

jest.mock('./auth', () => ({
  auth: {
    api: {
      signUpEmail: jest.fn(),
      sendVerificationEmail: jest.fn(),
      signInEmail: jest.fn(),
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
      this.statusCode = 400;
      this.body = body;
    }
  }
  return { APIError };
});

jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(),
  toNodeHandler: jest.fn(),
}));

import { APIError } from 'better-auth/api';
import type { Response } from 'express';
import { auth } from './auth';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AthletesService } from '../athletes/athletes.service';
import { TeamsService } from '../teams/teams.service';

const signUpEmail = auth.api.signUpEmail as unknown as jest.Mock;
const sendVerificationEmail = auth.api
  .sendVerificationEmail as unknown as jest.Mock;

// Mirrors the controller's own fallback so expectations track whatever the
// environment actually resolved FRONTEND_URL to.
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

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

  const res = { setHeader: jest.fn() } as unknown as Response;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: TeamsService, useValue: {} },
        { provide: AuthService, useValue: {} },
        { provide: AthletesService, useValue: {} },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('signUp', () => {
    it('sends the standard verified-login callbackURL and reports the verification requirement', async () => {
      signUpEmail.mockResolvedValue(signUpResponse(false));

      const result = await controller.signUp(
        {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'password123',
        },
        res,
      );

      expect(signUpEmail).toHaveBeenCalledWith({
        body: {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'password123',
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
          password: 'password123',
          inviteToken: INVITE_TOKEN,
        },
        res,
      );

      expect(signUpEmail).toHaveBeenCalledWith({
        body: {
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          password: 'password123',
          callbackURL: `${FRONTEND_URL}/join-team/${INVITE_TOKEN}`,
        },
        returnHeaders: true,
      });
    });

    it('rejects a malformed invite token', async () => {
      await expect(
        controller.signUp(
          {
            name: 'Ada Lovelace',
            email: 'ada@example.com',
            password: 'password123',
            inviteToken: 'not-a-token',
          },
          res,
        ),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(signUpEmail).not.toHaveBeenCalled();
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends the standard verified-login callbackURL', async () => {
      const result = await controller.sendVerificationEmail({
        email: 'ada@example.com',
      });

      expect(sendVerificationEmail).toHaveBeenCalledWith({
        body: {
          email: 'ada@example.com',
          callbackURL: `${FRONTEND_URL}/login?verified=1`,
        },
      });
      expect(result).toEqual({ status: true });
    });

    it('routes the resend back to the pending team invite', async () => {
      await controller.sendVerificationEmail({
        email: 'ada@example.com',
        inviteToken: INVITE_TOKEN,
      });

      expect(sendVerificationEmail).toHaveBeenCalledWith({
        body: {
          email: 'ada@example.com',
          callbackURL: `${FRONTEND_URL}/join-team/${INVITE_TOKEN}`,
        },
      });
    });

    it('rejects a malformed invite token', async () => {
      await expect(
        controller.sendVerificationEmail({
          email: 'ada@example.com',
          inviteToken: 'not-a-token',
        }),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('swallows Better Auth APIErrors so sends stay indistinguishable', async () => {
      sendVerificationEmail.mockRejectedValueOnce(
        new APIError('TOO_MANY_REQUESTS', { message: 'Too many requests.' }),
      );

      const result = await controller.sendVerificationEmail({
        email: 'ada@example.com',
      });

      expect(result).toEqual({ status: true });
    });
  });
});
