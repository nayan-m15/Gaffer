import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(__dirname, '../../.env') });

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
