import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../backend/node_modules/dotenv/lib/main.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(root, '.env'), quiet: true });
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for browser tests.');
}
if (!process.env.CI && testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('Browser tests require a database separate from development.');
}

const result = spawnSync(
  process.execPath,
  [resolve(root, 'node_modules/@playwright/test/cli.js'), 'test', ...process.argv.slice(2)],
  {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl,
      BREVO_API_KEY: '',
      PORT: process.env.CI ? (process.env.PORT ?? '3100') : '3100',
      BETTER_AUTH_URL: process.env.CI
        ? (process.env.BETTER_AUTH_URL ?? 'http://localhost:3100')
        : 'http://localhost:3100',
      FRONTEND_URL: process.env.CI
        ? (process.env.FRONTEND_URL ?? 'http://localhost:5173')
        : 'http://localhost:5173',
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
