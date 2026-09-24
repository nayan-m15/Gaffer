import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const report = resolve(backendRoot, 'coverage/lcov.info');
const coverage = readFileSync(report, 'utf8').replace(/^SF:(.+)$/gm, (_, source) => {
  const normalized = source.trim().replaceAll('\\', '/');
  const relative = normalized.startsWith('backend/')
    ? normalized
    : `backend/${normalized}`;
  return `SF:${relative}`;
});
writeFileSync(report, coverage);
