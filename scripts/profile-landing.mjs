import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const exercise3D = process.env.PROFILE_LANDING_3D === '1';
const label = exercise3D ? 'scene' : 'fallback';
await mkdir('.performance-local', { recursive: true });
const browser = await chromium.launch({ args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 1350, height: 940 }, serviceWorkers: 'block' });
  await page.route('**/auth/session', route => route.fulfill({ status: 401, body: '{}' }));
  if (exercise3D) await page.route('**/assets/scene-capability.worker-*.js', route => route.fulfill({ contentType: 'application/javascript', body: 'self.postMessage(true);' }));
  await page.addInitScript(({ exercise3D }) => {
    window.__landingTasks = [];
    new PerformanceObserver(list => window.__landingTasks.push(...list.getEntries().map(entry => ({ start: entry.startTime, duration: entry.duration })))).observe({ type: 'longtask', buffered: true });
    if (exercise3D) {
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
      Object.defineProperty(navigator, 'deviceMemory', { value: 8 });
      for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
        const original = prototype.getParameter;
        prototype.getParameter = function (parameter) {
          if (parameter === 0x9246 || parameter === this.RENDERER) return 'Test hardware GPU';
          return original.call(this, parameter);
        };
      }
    }
  }, { exercise3D });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await page.goto(process.argv[2] || 'http://127.0.0.1:4187/');
  await page.locator('#preloader').waitFor({ state: 'detached', timeout: 60_000 });
  await page.locator(`[data-scene-status="${exercise3D ? 'ready' : 'fallback'}"]`).waitFor({ timeout: 60_000 });
  const scrollStart = await page.evaluate(() => performance.now());
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // Observe five seconds of scroll progression after initialization.
  await page.waitForTimeout(5000);
  const { profile } = await cdp.send('Profiler.stop');
  await writeFile(`.performance-local/${label}.cpuprofile`, JSON.stringify(profile));
  const tasks = await page.evaluate(() => window.__landingTasks);
  const summary = { exercise3D, note: '3D mode simulates hardware capability on SwiftShader; this is lifecycle and task-boundary evidence, not real GPU performance.', scrollStart, startup: tasks.filter(task => task.start < scrollStart), scroll: tasks.filter(task => task.start >= scrollStart) };
  await writeFile(`.performance-local/${label}-tasks.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
  // Software GPUs can stall screenshot readback after the full stadium reveal.
  if (!process.argv.includes('--no-screenshots')) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `.performance-local/${label}-light.png` });
    await page.getByRole('button', { name: 'Switch to dark mode' }).first().click();
    await page.screenshot({ path: `.performance-local/${label}-dark.png` });
    await page.locator('#tactics').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.performance-local/${label}-tactics.png` });
  }
} finally { await browser.close(); }
