import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backendRoot, '..', '.env') });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const developmentDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to migrate the test database.');
}
if (testDatabaseUrl === developmentDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must differ from DATABASE_URL before migrations can run.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
await import('./migrate.mjs');
