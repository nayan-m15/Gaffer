import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createDatabaseClient } from '../database/drizzle';
import * as schema from '../database/schema';

/**
 * The single Better Auth instance for the backend.
 *
 * Connected to Neon Postgres through the existing Drizzle client. `transaction`
 * is disabled because the `neon-http` driver does not support interactive
 * transactions. `emailAndPassword` is the only sign-in method enabled for
 * Sprint 1 (S1-02).
 */
export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  database: drizzleAdapter(createDatabaseClient(), {
    provider: 'pg',
    schema,
    transaction: false,
  }),
  emailAndPassword: {
    enabled: true,
  },
});
