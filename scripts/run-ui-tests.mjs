import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
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

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const { port } = server.address();
  await new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return port;
}

// The Gitea runners can retain processes from earlier jobs. Allocate isolated
// loopback ports; the servers bind IPv4 (backend 0.0.0.0, frontend 127.0.0.1).
//
// The URLs must still say `localhost`, not 127.0.0.1. In CI the backend runs
// with NODE_ENV=production, so session cookies are Secure, and Playwright's
// API clients (`request`, `page.context().request`) only send Secure cookies
// over plain HTTP to `localhost` — against 127.0.0.1 every API call a spec
// makes after signing in is rejected with 401. Chromium, Playwright and
// Node 22 all fall back from an unbound ::1 to 127.0.0.1 for `localhost`.
const [backendPort, frontendPort] = await Promise.all([
  findAvailablePort(),
  findAvailablePort(),
]);
const backendURL = `http://localhost:${backendPort}`;
const frontendURL = `http://localhost:${frontendPort}`;

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
      // Every full-stack spec signs up from loopback. Give synthetic accounts
      // the same budgets as API integration tests, including retry attempts.
      AUTH_SIGN_IN_RATE_LIMIT: process.env.AUTH_SIGN_IN_RATE_LIMIT ?? '10000:60',
      AUTH_EMAIL_RATE_LIMIT: process.env.AUTH_EMAIL_RATE_LIMIT ?? '10000:60',
      PORT: String(backendPort),
      BETTER_AUTH_URL: backendURL,
      FRONTEND_URL: frontendURL,
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
