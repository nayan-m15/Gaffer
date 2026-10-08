import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env'), quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const developmentDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for integration tests. Use a separate test database.',
  );
}

if (testDatabaseUrl === developmentDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must be different from DATABASE_URL to protect development data.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
// Verification is performed by the test helpers; never send real test emails.
process.env.BREVO_API_KEY = '';
// The auth rate limiter keys on the client IP, and every e2e suite calls the
// auth endpoints from the same loopback address against this one shared test
// database — production-sized budgets would be exhausted by unrelated suites
// long before any of them finished. These budgets are effectively unlimited;
// auth-rate-limit.e2e-spec.ts pins its own small budgets per test instead.
process.env.AUTH_SIGN_IN_RATE_LIMIT ??= '10000:60';
process.env.AUTH_EMAIL_RATE_LIMIT ??= '10000:60';
