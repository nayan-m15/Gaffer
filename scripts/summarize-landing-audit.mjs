import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
const read = async file => JSON.parse(await readFile(file, 'utf8'));
const metrics = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'];
const results = [];
const settings = {};
for (const device of ['desktop', 'mobile']) {
  for (const [phase, prefix] of [['before', 'production-before'], ['after', 'final-after']]) {
    for (let run = 1; run <= 3; run++) {
      const data = await read(`.performance-local/${prefix}-${device}-${run}.json`);
      settings[device] ??= data.configSettings;
      if (JSON.stringify(settings[device]) !== JSON.stringify(data.configSettings)) throw new Error('Audit configurations differ');
      results.push({ phase, device, run, date: data.fetchTime, metrics: Object.fromEntries(metrics.map(id => [id, data.audits[id].numericValue])),
        longestTaskMs: Math.max(...(data.audits['long-tasks']?.details?.items || []).map(task => task.duration), 0),
        nonCompositedAnimations: data.audits['non-composited-animations']?.details?.items?.length || 0,
        mainThread: data.audits['mainthread-work-breakdown'].details.items,
      });
    }
  }
}
const bundles = await read('.performance-local/before-bundles.json');
const afterBundles = [];
for (const name of await readdir('frontend/dist/assets')) {
  if (!/^(index-|landing-scene-|LandingPage-|three.module-|AppShell-|PlayerShell-|scene-capability.worker-).*\.js$/.test(name)) continue;
  const bytes = await readFile(`frontend/dist/assets/${name}`);
  afterBundles.push({ name, bytes: bytes.length, gzip: gzipSync(bytes).length });
}
const images = [];
for (const directory of ['frontend/public', 'frontend/public/landing']) {
  for (const name of await readdir(directory)) {
    if (name.endsWith('.webp')) images.push({ path: `${directory}/${name}`, bytes: (await stat(`${directory}/${name}`)).size });
  }
}
const baselineRevision = execFileSync('git', ['rev-parse', '00529949'], { encoding: 'utf8' }).trim();
const afterRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const changedFrontendFiles = execFileSync('git', ['diff', '--name-only', baselineRevision, '--', 'frontend/src', 'frontend/public', 'frontend/index.html', 'frontend/vite.config.ts'], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const sourceManifest = [];
for (const path of changedFrontendFiles) sourceManifest.push({ path, sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
const evidence = {
  baselineRevision, afterRevision,
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  trackedDiffSha256: createHash('sha256').update(execFileSync('git', ['diff', baselineRevision])).digest('hex'),
  environment: { os: 'Windows 10.0.26300', logicalProcessors: 12, memoryGiB: 16, lighthouse: '13.5.0', chromium: '151.0.0.0', gpu: 'SwiftShader', url: 'http://127.0.0.1:4187/' },
  sourceManifest, settings, results, beforeBundles: bundles, afterBundles, images,
};
await writeFile('docs/landing-performance-results.json', JSON.stringify(evidence, null, 2) + '\n');
for (const device of ['desktop', 'mobile']) {
  for (const metric of metrics) {
    console.log(device, metric, ...['before', 'after'].map(phase => {
      const values = results.filter(result => result.device === device && result.phase === phase).map(result => result.metrics[metric]).sort((a, b) => a - b);
      return `${phase}: ${values[1]} (${values[0]}–${values[2]})`;
    }));
  }
}
