import type { BetterAuthOptions } from 'better-auth';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  sendEmailChangeConfirmationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../email/email';

const mockBetterAuth = jest.fn((options: BetterAuthOptions) => options);
const mockLimit = jest.fn();
const mockWhere = jest.fn<Promise<void>, [SQL]>();
const mockDatabase = {
  select: jest.fn(() => ({
    from: jest.fn(() => ({ where: jest.fn(() => ({ limit: mockLimit })) })),
  })),
  delete: jest.fn(() => ({ where: mockWhere })),
};

jest.mock('better-auth', () => ({
  betterAuth: (options: BetterAuthOptions) => mockBetterAuth(options),
}));
jest.mock('better-auth/adapters/drizzle', () => ({
  drizzleAdapter: jest.fn(() => 'mock-adapter'),
}));
jest.mock('../database/drizzle', () => ({
  createDatabaseClient: () => mockDatabase,
}));
jest.mock('../email/email', () => ({
  sendEmailChangeConfirmationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
  sendVerificationEmail: jest.fn(),
}));
jest.mock('../trusted-origins', () => ({
  getBetterAuthBaseURL: () => 'https://api.example.com',
  getTrustedOrigins: () => ['https://app.example.com'],
}));

const user = {
  id: 'user-1',
  name: 'Coach',
  email: 'coach@example.com',
  emailVerified: true,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
};

function loadOptions(): BetterAuthOptions {
  jest.isolateModules(() => {
    jest.requireActual('./auth');
  });
  return mockBetterAuth.mock.calls.at(-1)![0];
}

function verificationUrl(callback?: string): string {
  const url = new URL(
    'https://api.example.com/auth/verify-email?token=test-token',
  );
  if (callback !== undefined) url.searchParams.set('callbackURL', callback);
  return url.toString();
}

describe('Better Auth configuration and callbacks', () => {
  let options: BetterAuthOptions;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.FRONTEND_URL = 'https://app.example.com';
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    jest.clearAllMocks();
    mockLimit.mockReset();
    mockWhere.mockReset().mockResolvedValue(undefined);
    jest.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);
    options = loadOptions();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  function validate(
    email: string | undefined,
    source: Parameters<
      NonNullable<NonNullable<BetterAuthOptions['user']>['validateUserInfo']>
    >[0]['source'] = {
      action: 'sign-in',
      method: 'oauth',
      oauth: { providerId: 'google', profile: { sub: 'google-sub' } },
    },
  ) {
    const callback = options.user!.validateUserInfo!;
    return callback(
      { user: { email }, source },
      {} as Parameters<typeof callback>[1],
    );
  }

  describe('Google identity validation', () => {
    it.each([
      {
        action: 'create-user' as const,
        method: 'oauth' as const,
        oauth: { providerId: 'google' },
      },
      { action: 'sign-in' as const, method: 'email' as const },
      {
        action: 'sign-in' as const,
        method: 'oauth' as const,
        oauth: { providerId: 'github' },
      },
    ])('skips unrelated authentication flows: %p', async (source) => {
      await expect(validate(user.email, source)).resolves.toBeUndefined();
      expect(mockDatabase.select).not.toHaveBeenCalled();
    });

    it.each([
      { profile: undefined, email: user.email },
      { profile: { sub: 42 }, email: user.email },
      { profile: { sub: '' }, email: user.email },
      { profile: { sub: 'google-sub' }, email: undefined },
      { profile: { sub: 'google-sub', email: 42 }, email: undefined },
      { profile: { sub: 'google-sub' }, email: '   ' },
    ])(
      'rejects incomplete identities before querying: %p',
      async ({ profile, email }) => {
        await expect(
          validate(email, {
            action: 'sign-in',
            method: 'oauth',
            oauth: { providerId: 'google', profile },
          }),
        ).resolves.toMatchObject({ error: 'google_identity_invalid' });
        expect(mockDatabase.select).not.toHaveBeenCalled();
      },
    );

    it('allows an unlinked Google identity to continue normal sign-up/linking', async () => {
      mockLimit.mockResolvedValueOnce([]);
      await expect(validate(user.email)).resolves.toBeUndefined();
      expect(mockDatabase.select).toHaveBeenCalledTimes(1);
    });

    it('rejects a provider account whose linked user no longer exists', async () => {
      mockLimit
        .mockResolvedValueOnce([{ userId: user.id }])
        .mockResolvedValueOnce([]);
      await expect(validate(user.email)).resolves.toMatchObject({
        error: 'google_account_orphaned',
      });
    });

    it('rejects a stale Google identity after the primary email changes', async () => {
      mockLimit
        .mockResolvedValueOnce([{ userId: user.id }])
        .mockResolvedValueOnce([{ email: 'new@example.com' }]);
      await expect(validate(user.email)).resolves.toMatchObject({
        error: 'google_email_no_longer_matches_account',
      });
    });

    it('normalizes both addresses before allowing an existing link', async () => {
      mockLimit
        .mockResolvedValueOnce([{ userId: user.id }])
        .mockResolvedValueOnce([{ email: ' COACH@Example.com ' }]);
      await expect(validate(' coach@example.COM ')).resolves.toBeUndefined();
    });

    it('falls back to the provider email when user info has none', async () => {
      mockLimit
        .mockResolvedValueOnce([{ userId: user.id }])
        .mockResolvedValueOnce([{ email: user.email }]);
      await expect(
        validate(undefined, {
          action: 'sign-in',
          method: 'oauth',
          oauth: {
            providerId: 'google',
            profile: { sub: 'google-sub', email: ' COACH@EXAMPLE.COM ' },
          },
        }),
      ).resolves.toBeUndefined();
    });

    it('propagates database failure instead of allowing sign-in', async () => {
      const error = new Error('database unavailable');
      mockLimit.mockRejectedValueOnce(error);
      await expect(validate(user.email)).rejects.toBe(error);
    });
  });

  describe('email-change verification', () => {
    it.each([
      '/email-change/approved',
      'https://app.example.com/email-change/approved?mode=change',
    ])(
      'rewrites the new-address verification callback: %s',
      async (callback) => {
        await options.emailVerification!.sendVerificationEmail!({
          user,
          url: verificationUrl(callback),
          token: 'test-token',
        });
        const delivery = jest.mocked(sendVerificationEmail).mock.calls[0][0];
        const url = new URL(delivery.url);
        const rewritten = new URL(url.searchParams.get('callbackURL')!);
        expect(delivery).toMatchObject({ to: user.email, name: user.name });
        expect(url.searchParams.get('token')).toBe('test-token');
        expect(rewritten.origin).toBe('https://app.example.com');
        expect(rewritten.pathname).toBe('/email-change/complete');
        expect(rewritten.search).toBe(
          new URL(callback, 'https://app.example.com').search,
        );
      },
    );

    it.each([
      'invalid-url',
      verificationUrl(),
      verificationUrl('/dashboard'),
      verificationUrl('http://['),
    ])(
      'preserves unrelated or malformed verification links: %s',
      async (url) => {
        await options.emailVerification!.sendVerificationEmail!({
          user,
          url,
          token: 'test-token',
        });
        expect(sendVerificationEmail).toHaveBeenCalledWith({
          to: user.email,
          name: user.name,
          url,
        });
      },
    );

    it('sends approval to the current address with the proposed new address', async () => {
      const url = verificationUrl('/email-change/approved');
      await options.user!.changeEmail!.sendChangeEmailConfirmation!({
        user,
        newEmail: 'new@example.com',
        url,
        token: 'test-token',
      });
      expect(sendEmailChangeConfirmationEmail).toHaveBeenCalledWith({
        to: user.email,
        name: user.name,
        newEmail: 'new@example.com',
        url,
      });
    });

    it.each([undefined, '/email-change/approved', '/dashboard', 'http://['])(
      'does not revoke sessions before final email-change verification: %p',
      async (callback) => {
        await options.emailVerification!.afterEmailVerification!(
          user,
          callback === undefined
            ? undefined
            : new Request(verificationUrl(callback)),
        );
        expect(mockDatabase.delete).not.toHaveBeenCalled();
      },
    );

    it('ignores a verification request without a callback', async () => {
      await options.emailVerification!.afterEmailVerification!(
        user,
        new Request(verificationUrl()),
      );
      expect(mockDatabase.delete).not.toHaveBeenCalled();
    });

    it('revokes only the verified user sessions on the final callback', async () => {
      await options.emailVerification!.afterEmailVerification!(
        user,
        new Request(verificationUrl('/email-change/complete')),
      );
      expect(mockDatabase.delete).toHaveBeenCalledTimes(1);
      const predicate = new PgDialect().sqlToQuery(mockWhere.mock.calls[0][0]);
      expect(predicate.sql).toContain('"session"."user_id" =');
      expect(predicate.params).toEqual([user.id]);
    });
  });

  describe('password reset delivery', () => {
    it('returns while email delivery is still pending', async () => {
      let finish!: () => void;
      jest.mocked(sendPasswordResetEmail).mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      await options.emailAndPassword!.sendResetPassword!({
        user,
        url: 'https://app.example.com/reset',
        token: 'reset-token',
      });
      expect(sendPasswordResetEmail).toHaveBeenCalledWith({
        to: user.email,
        name: user.name,
        url: 'https://app.example.com/reset',
      });
      finish();
    });

    it('handles background delivery failures without rejecting the reset request', async () => {
      const error = new Error('email unavailable');
      const log = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);
      jest.mocked(sendPasswordResetEmail).mockRejectedValueOnce(error);
      await expect(
        options.emailAndPassword!.sendResetPassword!({
          user,
          url: 'https://app.example.com/reset',
          token: 'reset-token',
        }),
      ).resolves.toBeUndefined();
      expect(log).toHaveBeenCalledWith(
        'Failed to send password reset email',
        error,
      );
    });
  });

  it('keeps origin checks and same-email account linking enabled', () => {
    expect(options.advanced).toMatchObject({
      disableOriginCheck: false,
      defaultCookieAttributes: { sameSite: 'lax', secure: false },
    });
    expect(options.account?.accountLinking).toMatchObject({
      enabled: true,
      trustedProviders: ['google'],
      allowDifferentEmails: false,
    });
    expect(options.user?.changeEmail).toMatchObject({
      enabled: true,
      updateEmailWithoutVerification: false,
    });
    expect(options.socialProviders).toEqual({});
  });

  it('configures Google only when both credentials are present and secures production cookies', () => {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    const configured = loadOptions();
    expect(configured.socialProviders?.google).toMatchObject({
      clientId: 'test-client',
      clientSecret: 'test-secret',
    });
    expect(configured.advanced?.defaultCookieAttributes?.secure).toBe(true);
  });

  it('omits Google when only the client ID is configured', () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client';
    expect(loadOptions().socialProviders).toEqual({});
  });

  it('uses the local frontend fallback for relative email-change callbacks', async () => {
    delete process.env.FRONTEND_URL;
    const local = loadOptions();
    await local.emailVerification!.sendVerificationEmail!({
      user,
      url: verificationUrl('/email-change/approved'),
      token: 'test-token',
    });
    const url = new URL(
      jest.mocked(sendVerificationEmail).mock.calls[0][0].url,
    );
    expect(url.searchParams.get('callbackURL')).toBe(
      'http://localhost:5173/email-change/complete',
    );
  });
});
