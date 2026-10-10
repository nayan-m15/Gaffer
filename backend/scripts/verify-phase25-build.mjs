import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'docs/phase25-validation');
mkdirSync(directory, { recursive: true });
const base = 'e01fe3d18be0c47edc8a56ebcd70d7d83c9a7dec';
function run(name, command, args, cwd) {
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, windowsHide: true, encoding: 'utf8', timeout: 120000 });
  if (result.error) throw result.error;
  writeFileSync(resolve(directory, `${name}.log`), `${result.stdout ?? ''}${result.stderr ?? ''}`);
  const record = { name, command: [command, ...args], exitCode: result.status, durationMs: Date.now() - started };
  writeFileSync(resolve(directory, `${name}-process.json`), JSON.stringify(record, null, 2));
  console.log(JSON.stringify(record));
  return result;
}
const current = run('frontend-current-build', process.execPath, [resolve(root, 'frontend/node_modules/typescript/bin/tsc'), '-b', '--force'], resolve(root, 'frontend'));
const temporary = mkdtempSync(resolve(tmpdir(), 'gaffer-phase25-base-'));
const archive = resolve(temporary, 'base.zip');
const exported = run('base-export', 'git', ['archive', '--format=zip', `--output=${archive}`, base, 'frontend'], root);
if (exported.status !== 0) throw new Error('Base export failed');
const extracted = run('base-extract', 'tar', ['-xf', archive, '-C', temporary], root);
if (extracted.status !== 0) throw new Error('Base extraction failed');
const baseFrontend = resolve(temporary, 'frontend');
symlinkSync(resolve(root, 'frontend/node_modules'), resolve(baseFrontend, 'node_modules'), 'junction');
const historical = run('frontend-base-build', process.execPath, [resolve(root, 'frontend/node_modules/typescript/bin/tsc'), '-b', '--force'], baseFrontend);
const currentErrors = (current.stdout + current.stderr).trim();
const baseErrors = (historical.stdout + historical.stderr).trim();
const comparison = { base, temporary, dependencyScope: 'Existing installed dependencies reused; no dependency install or historical dependency reconstruction', currentExit: current.status, baseExit: historical.status, exactErrorsEqual: currentErrors === baseErrors };
writeFileSync(resolve(directory, 'frontend-build-comparison.json'), JSON.stringify(comparison, null, 2));
console.log(JSON.stringify(comparison));
console.log(readFileSync(resolve(directory, 'frontend-current-build.log'), 'utf8'));
