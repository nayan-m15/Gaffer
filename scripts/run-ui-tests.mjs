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
// loopback ports and use IPv4 explicitly so Node's localhost resolution cannot
// route API requests to an unbound ::1 socket.
const [backendPort, frontendPort] = await Promise.all([
  findAvailablePort(),
  findAvailablePort(),
]);
const backendURL = `http://127.0.0.1:${backendPort}`;
const frontendURL = `http://127.0.0.1:${frontendPort}`;

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
      PORT: String(backendPort),
      BETTER_AUTH_URL: backendURL,
      FRONTEND_URL: frontendURL,
    },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
