import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
const command = process.argv[2];
if (!['instances', 'config', 'status', 'validate'].includes(command)) throw new Error('Use instances, config, status, or validate (read-only)');
const cache = resolve(root, '.npm-cache/_npx');
const install = readdirSync(cache).map((entry) => resolve(cache, entry, 'node_modules/powersync'))
  .find((path) => existsSync(resolve(path, 'package.json')) && JSON.parse(readFileSync(resolve(path, 'package.json'))).version === '0.10.1');
if (!install) throw new Error('PowerSync CLI 0.10.1 missing from workspace cache');
const args = command === 'instances'
  ? ['--org-id', '6aac1ea304e93a0007fcb0bf', '--project-id', '6aac1ed66860dd000702696f', '--output', 'json']
  : ['--instance-id', '6aac1ed7a77ca1231d28f82d', '--directory', 'powersync', '--output', 'json'];
if (command === 'validate') args.push('--validate-only', 'sync-config', '--sync-config-file-path', 'powersync/sync-config.yaml');
const cliCommand = command === 'validate' ? ['validate', ...args] : ['fetch', command, ...args];
const child = spawnSync(process.execPath, [resolve(install, 'bin/run.js'), ...cliCommand], {
  cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024,
});
// Cloud configuration may contain secret-backed fields. Never print/store raw output.
const sanitize = (value, name = '') => {
  if (name === 'allow_temporary_tokens' && typeof value === 'boolean') return value;
  if (/password|secret|token|private.?key|authorization|cookie/i.test(name)) return '[REDACTED]';
  if (Array.isArray(value)) return value.map((entry) => sanitize(entry));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitize(entry, key)]));
  if (typeof value === 'string') {
    if (value.includes('PRIVATE KEY') || /eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/.test(value)) return '[REDACTED]';
    return value.replace(/(postgres(?:ql)?:\/\/)[^\s@]+@/gi, '$1[REDACTED]@');
  }
  return value;
};
let data = null;
for (const output of [child.stdout, child.stderr]) {
  const clean = output?.replace(/\x1b\[[0-9;]*m/g, '').trim() ?? '';
  for (const [opening, closing] of [['{', '}'], ['[', ']']]) {
    const start = clean.indexOf(opening), end = clean.lastIndexOf(closing);
    if (start < 0 || end < start) continue;
    try { data = sanitize(JSON.parse(clean.slice(start, end + 1))); break; } catch { /* Omit raw failures. */ }
  }
  if (data) break;
}
const result = { capturedAt: new Date().toISOString(), command: cliCommand, exitCode: child.status,
  processErrorCode: child.error?.code ?? null, stdoutBytes: child.stdout?.length ?? 0, stderrBytes: child.stderr?.length ?? 0, data,
  failure: child.status !== 0 ? {
    http401: /401|unauthori[sz]ed/i.test(child.stderr + child.stdout),
    http403: /403|forbidden/i.test(child.stderr + child.stdout),
    missingLogin: /not logged|login required|not authenticated|no.*token/i.test(child.stderr + child.stdout),
    network: /ENOTFOUND|ECONN|fetch failed|ETIMEDOUT/i.test(child.stderr + child.stdout),
    rawOutputOmitted: true,
  } : null };
const directory = resolve(root, 'docs/phase26-validation');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, `cloud-${command}.json`), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, data: command === 'config' && data ? { ...data, syncRules: '[Content retained in evidence file]' } : data }, null, 2));
process.exitCode = child.status === 0 ? 0 : 1;
