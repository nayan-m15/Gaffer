import { betterAuth } from 'better-auth';
import { and, eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDatabaseClient } from '../database/drizzle';
import * as schema from '../database/schema';
import {
  sendEmailChangeConfirmationEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../email/email';

/**
 * The single Better Auth instance for the backend.
 *
 * Connected to Neon Postgres through the existing Drizzle client. `transaction`
 * is disabled because the `neon-http` driver does not support interactive
 * transactions. `emailAndPassword` is the only sign-in method enabled for
 * Sprint 1 (S1-02).
 *
 * Email/password sign-up requires verifying the address before a session is
 * issued (`requireEmailVerification`): Better Auth sends the verification
 * email itself on sign-up and re-sends it if sign-in is attempted while
 * unverified, both via `sendVerificationEmail` below. Google sign-in is
 * unaffected — Better Auth trusts Google's own `email_verified` claim and
 * marks those accounts verified automatically.
 */
const db = createDatabaseClient();
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const normalizeEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() ?? '';

/**
 * Google identifies accounts by the stable `sub` claim, while Gaffer treats
 * the user's verified primary email as the account's current login identity.
 *
 * After a verified email change we intentionally keep the old Google account
 * row as a tombstone. That lets this gate recognise the old provider identity
 * and reject it instead of letting it authenticate the renamed Gaffer user (or
 * silently provision a fresh account with the old address). A Google identity
 * whose verified email matches the user's new primary email is still eligible
 * for Better Auth's normal same-email implicit linking.
 */
async function validateGoogleIdentity(
  userInfo: { email?: string | null },
  source: {
    action?: string;
    oauth?: { providerId?: string; profile?: unknown };
  },
) {
  if (source.action !== 'sign-in' || source.oauth?.providerId !== 'google') {
    return;
  }

  const profile = source.oauth.profile as
    | { sub?: unknown; email?: unknown; email_verified?: unknown }
    | undefined;
  const providerAccountId =
    typeof profile?.sub === 'string' ? profile.sub : undefined;
  const providerEmail = normalizeEmail(
    typeof userInfo.email === 'string'
      ? userInfo.email
      : typeof profile?.email === 'string'
        ? profile.email
        : undefined,
  );

  // A Google callback should always contain both a stable subject and email.
  // Fail closed if either is unexpectedly missing rather than risking a stale
  // provider identity bypassing the account-email check.
  if (!providerAccountId || !providerEmail) {
    return {
      error: 'google_identity_invalid',
      errorDescription: 'Google sign-in could not verify the account identity.',
    };
  }

  const [linkedAccount] = await db
    .select({ userId: schema.account.userId })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.providerId, 'google'),
        eq(schema.account.accountId, providerAccountId),
      ),
    )
    .limit(1);

  // No existing Google link means this is a new provider identity. Let Better
  // Auth continue: if its verified email matches an existing Gaffer user it
  // will be linked to that user; otherwise normal sign-up rules apply.
  if (!linkedAccount) return;

  const [linkedUser] = await db
    .select({ email: schema.user.email })
    .from(schema.user)
    .where(eq(schema.user.id, linkedAccount.userId))
    .limit(1);

  if (!linkedUser) {
    return {
      error: 'google_account_orphaned',
      errorDescription: 'This Google sign-in is no longer connected to an active account.',
    };
  }

  if (normalizeEmail(linkedUser.email) !== providerEmail) {
    return {
      error: 'google_email_no_longer_matches_account',
      errorDescription:
        'This Google account no longer matches the current email address on this Gaffer account. Use the Google account for the current email address instead.',
    };
  }
}


function rewriteEmailChangeVerificationUrl(url: string): string {
  try {
    const verificationUrl = new URL(url);
    const callbackURL = verificationUrl.searchParams.get('callbackURL');
    if (!callbackURL) return url;

    const callback = new URL(callbackURL, FRONTEND_URL);
    if (callback.pathname !== '/email-change/approved') return url;

    callback.pathname = '/email-change/complete';
    verificationUrl.searchParams.set('callbackURL', callback.toString());
    return verificationUrl.toString();
  } catch {
    return url;
  }
}

function isFinalEmailChangeVerification(request: Request | undefined): boolean {
  if (!request) return false;

  try {
    const callbackURL = new URL(request.url).searchParams.get('callbackURL');
    if (!callbackURL) return false;
    return new URL(callbackURL, FRONTEND_URL).pathname === '/email-change/complete';
  } catch {
    return false;
  }
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  basePath: '/auth',
  trustedOrigins: [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'https://gaffer-virid.vercel.app',
    'http://localhost:5173',
  ].filter(Boolean),
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
    transaction: false,
  }),
  user: {
    validateUserInfo: async ({ user, source }) =>
      validateGoogleIdentity(user, source),
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: false,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }) => {
        await sendEmailChangeConfirmationEmail({
          to: user.email,
          name: user.name,
          newEmail,
          url,
        });
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      // Do not await this request: keeping the response timing uniform makes
      // it harder to determine whether an email address has an account.
      void sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        url,
      }).catch((error) => {
        console.error('Failed to send password reset email', error);
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60, // 1 hour
    sendVerificationEmail: async ({ user, url }) => {
      // The current-email approval step and the new-email verification step
      // share Better Auth's callbackURL. Rewrite only the second email's link
      // so each stage lands on the correct Gaffer confirmation screen.
      const deliveryUrl = rewriteEmailChangeVerificationUrl(url);
      await sendVerificationEmail({
        to: user.email,
        name: user.name,
        url: deliveryUrl,
      });
    },
    afterEmailVerification: async (user, request) => {
      if (!isFinalEmailChangeVerification(request)) return;

      // A completed email change is a security boundary. Revoke every active
      // session for the user, including the browser that completed the flow.
      // Better Auth may subsequently set a cookie for that just-deleted
      // session during the redirect, but the token no longer exists in the
      // database and therefore cannot authenticate any further request.
      await db.delete(schema.session).where(eq(schema.session.userId, user.id));
    },
  },
  advanced: {
    // Better Auth defaults `skipOriginCheck` to true when it detects a test
    // environment (NODE_ENV=test), which — through its backward-compatible
    // coupling — also disables the request-aware login CSRF validation. That
    // default would silently reopen SEC-003 under `jest`. Setting it
    // explicitly keeps Origin/Fetch Metadata validation active (and covered
    // by the e2e suite) in every environment; in production `false` is
    // already the default, so this changes nothing there.
    disableOriginCheck: false,
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
      // Never permit a provider account with a different email to be attached
      // explicitly. The only supported Google link is one whose verified email
      // matches the Gaffer user's current primary email.
      allowDifferentEmails: false,
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
});
