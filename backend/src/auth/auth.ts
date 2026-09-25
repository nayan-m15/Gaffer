import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDatabaseClient } from '../database/drizzle';
import * as schema from '../database/schema';
import { sendVerificationEmail } from '../email/email';

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
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  basePath: '/auth',
  trustedOrigins: [
    process.env.FRONTEND_URL ?? 'http://localhost:5173',
    'https://gaffer-virid.vercel.app',
    'http://localhost:5173',
  ].filter(Boolean),
  database: drizzleAdapter(createDatabaseClient(), {
    provider: 'pg',
    schema,
    transaction: false,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60, // 1 hour
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail({ to: user.email, name: user.name, url });
    },
  },
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
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
