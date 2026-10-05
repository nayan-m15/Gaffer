import { neon } from '@neondatabase/serverless';
import { parse } from 'dotenv';
import {
  readFileSync,
  mkdirSync,
  writeFileSync,
  createWriteStream,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = resolve(root, 'backend');
const directory = resolve(root, 'docs/phase2-validation');
mkdirSync(directory, { recursive: true });
const config = {
  ...parse(readFileSync(resolve(root, '.env'))),
  ...process.env,
};
const mode = process.argv[2];
const commands = {
  concurrency: [
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/phase2-sync-privacy.e2e-spec.ts',
    '--testNamePattern',
    'serialises concurrent linked clock',
  ],
  offline: [
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/offline-sync.e2e-spec.ts',
  ],
  competition: [
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/competitions.e2e-spec.ts',
  ],
  migrate: ['scripts/migrate.mjs'],
  revocation: [
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/phase2-sync-privacy.e2e-spec.ts',
    '--testNamePattern',
    'denies a revoked member',
  ],
  focused: [
    '--experimental-vm-modules',
    'node_modules/jest/bin/jest.js',
    '--runInBand',
    'src/matches/shared-session-privacy.spec.ts',
    'src/matches/shared-session-integrity.spec.ts',
    'src/sync/sync.controller.spec.ts',
    'src/sync/sync-jwks.controller.spec.ts',
    'src/sync/sync-authorization.spec.ts',
  ],
  unit: [
    '--experimental-vm-modules',
    'node_modules/jest/bin/jest.js',
    '--runInBand',
  ],
  e2e: [
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/phase2-sync-privacy.e2e-spec.ts',
  ],
  regressions: [
    'node_modules/jest/bin/jest.js',
    '--config',
    './test/jest-e2e.json',
    '--runInBand',
    'test/friendly-fixtures.e2e-spec.ts',
    'test/competitions.e2e-spec.ts',
    'test/team-isolation.e2e-spec.ts',
    'test/offline-sync.e2e-spec.ts',
  ],
  build: ['node_modules/@nestjs/cli/bin/nest.js', 'build'],
  lint: ['node_modules/eslint/bin/eslint.js', 'src/**/*.ts', 'test/**/*.ts'],
};
if (!commands[mode]) throw new Error('Unknown validation mode');
let identity;
if (
  [
    'e2e',
    'regressions',
    'revocation',
    'migrate',
    'competition',
    'offline',
    'concurrency',
  ].includes(mode)
) {
  const url = new URL(config.TEST_DATABASE_URL);
  if (
    url.hostname !==
      'ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech' ||
    url.pathname !== '/neondb'
  )
    throw new Error('STOP: unapproved test database');
  const sql = neon(config.TEST_DATABASE_URL);
  [identity] = await sql.query(
    "SELECT current_database() AS database, current_setting('neon.branch_id') AS branch, current_setting('neon.endpoint_id') AS endpoint",
  );
  if (
    identity.branch !== 'br-misty-moon-b2be9vmt' ||
    identity.endpoint !== 'ep-royal-star-b253pvlk' ||
    identity.database !== 'neondb'
  )
    throw new Error('STOP: database identity mismatch');
  if (mode === 'migrate') {
    const rows = await sql.query(
      'SELECT created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1',
    );
    if (rows[0]?.created_at !== '1790976000000')
      throw new Error('STOP: expected only migration 0052 to be pending');
  }
}
const started = Date.now();
const args = commands[mode];
const logfile = resolve(directory, `${mode}.log`);
const output = createWriteStream(logfile);
const child = spawn(process.execPath, args, {
  cwd: backend,
  windowsHide: true,
  env: {
    ...config,
    ...(mode === 'migrate' ? { DATABASE_URL: config.TEST_DATABASE_URL } : {}),
    TWO_SIDED_LIVE_LOGGING_ENABLED: 'true',
    OFFLINE_SYNC_ENABLED: 'true',
    BREVO_API_KEY: '',
    PHASE2_EVIDENCE_DIR: directory,
    ...(['revocation', 'concurrency'].includes(mode)
      ? { PHASE2_EVIDENCE_NAME: `${mode}-http-evidence.json` }
      : {}),
  },
});
child.stdout.pipe(output, { end: false });
child.stderr.pipe(output, { end: false });
const code = await new Promise((accept, reject) => {
  child.once('error', reject);
  child.once('close', accept);
});
await new Promise((accept) => output.end(accept));
const result = {
  mode,
  identity,
  command: [process.execPath, ...args],
  exitCode: code,
  durationMs: Date.now() - started,
  log: logfile,
};
writeFileSync(
  resolve(directory, `${mode}-process.json`),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
console.log(readFileSync(logfile, 'utf8').split('\n').slice(-18).join('\n'));
process.exitCode = code;
