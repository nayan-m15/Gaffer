// LIGHTHOUSE_CLI must point to lighthouse/cli/index.js if Lighthouse is not installed locally.
import { createRequire } from 'node:module';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const cli = process.env.LIGHTHOUSE_CLI || require.resolve('lighthouse/cli/index.js');
const positional = process.argv.slice(2).filter(argument => argument !== '--resume');
const phase = positional[0] || 'after';
const url = positional[1] || 'http://127.0.0.1:4187/';
const resume = process.argv.includes('--resume');
if (!/^[a-z-]+$/.test(phase)) throw new Error('Use a lowercase phase name');
const output = '.performance-local';
await mkdir(output, { recursive: true });
const results = [];
for (const device of ['desktop', 'mobile']) {
  for (let run = 1; run <= 3; run++) {
    const report = `${output}/${phase}-${device}-${run}.json`;
    let data;
    if (resume) {
      try { data = JSON.parse(await readFile(report, 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const args = [cli, url, '--throttling-method=devtools', '--throttling.cpuSlowdownMultiplier=4',
      '--chrome-flags=--headless --enable-webgl --use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist',
      '--only-categories=performance', '--save-assets', '--output=json', `--output-path=${report}`, '--quiet'];
    if (device === 'desktop') args.push('--preset=desktop');
    if (!data) {
      const child = spawnSync(process.execPath, args, { stdio: 'inherit' });
      if (child.status !== 0) throw new Error(`Lighthouse failed: ${report}`);
      data = JSON.parse(await readFile(report, 'utf8'));
    }
    if (data.runtimeError) throw new Error(JSON.stringify(data.runtimeError));
    const ids = ['first-contentful-paint', 'largest-contentful-paint', 'total-blocking-time', 'cumulative-layout-shift', 'speed-index'];
    results.push({ device, run, lighthouseVersion: data.lighthouseVersion, userAgent: data.environment.networkUserAgent,
      configSettings: data.configSettings, metrics: Object.fromEntries(ids.map(id => [id, data.audits[id].numericValue])),
      mainThread: data.audits['mainthread-work-breakdown'].details.items,
      bootup: data.audits['bootup-time'].details.items,
      longTasks: data.audits['long-tasks']?.details?.items,
      nonCompositedAnimations: data.audits['non-composited-animations']?.details?.items,
    });
    console.log(`${phase} ${device} ${run}: TBT ${results.at(-1).metrics['total-blocking-time'].toFixed(0)} ms`);
  }
}
await writeFile(`${output}/${phase}-summary.json`, JSON.stringify({
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  workingTree: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }), url, results,
}, null, 2));
