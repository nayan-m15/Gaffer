import { expect, test, type Page } from '@playwright/test';

async function dashboard(page: Page) {
  await page.route('**/auth/session', route => route.fulfill({ json: {
    user: { id: 'stadium-coach', name: 'Stadium Coach', email: 'stadium@example.com', image: null, emailVerified: true },
    team: { id: 'stadium-team', name: 'Gaffer FC', role: 'coach', primaryColor: '#00D99A' },
    claimedAthletes: [],
  } }));
  await page.route('**/api/**', route => route.fulfill({ json:
    route.request().url().endsWith('/dashboard')
      ? { activeAthletesCount: 24, totalEventsCount: 0, upcomingEvents: [] }
      : [],
  }));
  await page.goto('/dashboard');
  await expect(page.locator('.dashboard-stadium-scene canvas')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(page.locator('#preloader')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
}

test('stadium survives responsive resizing and changes theme without remounting', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' || /THREE.*warning|WebGL.*INVALID/i.test(message.text())) errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await dashboard(page);
  const canvas = page.locator('.dashboard-stadium-scene canvas');
  await canvas.evaluate(el => { el.dataset.instance = 'original'; });
  for (const [width, height] of [[1920, 1080], [1440, 900], [1366, 768], [1024, 768], [430, 932], [390, 844], [360, 800]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => canvas.evaluate(el => ({ width: el.width, height: el.height })), { timeout: 30_000 }).toEqual({ width, height });
    await expect(canvas).toHaveAttribute('data-instance', 'original');
    await expect(page.locator('.dashboard-stadium-scene')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('.dashboard-stadium-vignette')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const toggle = page.getByRole('button', { name: /Switch to (light|dark) mode/ }).first();
  const before = await canvas.screenshot();
  await toggle.click();
  // With reduced motion the scene updates on the first requested frame.
  await page.waitForTimeout(300);
  const after = await canvas.screenshot();
  expect(before.equals(after)).toBe(false);
  await expect(canvas).toHaveAttribute('data-instance', 'original');
  await toggle.click();
  await expect(canvas).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('leaving the dashboard releases geometry and instance GPU buffers', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const live = new Set<WebGLBuffer>();
    // WebGL2 uses the WebGL1 methods inherited by its context prototype.
    for (const proto of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const create = proto.createBuffer, remove = proto.deleteBuffer;
      proto.createBuffer = function () { const value = create.call(this); if (value) live.add(value); return value; };
      proto.deleteBuffer = function (value) { if (value) live.delete(value); return remove.call(this, value); };
    }
    Object.defineProperty(window, '__stadiumLiveBuffers', { get: () => live.size });
  });
  await dashboard(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stadiumLiveBuffers: number }).__stadiumLiveBuffers)).toBeGreaterThan(0);
  const canvas = page.locator('.dashboard-stadium-scene canvas');
  const initialCount = await page.evaluate(() => (window as unknown as { __stadiumLiveBuffers: number }).__stadiumLiveBuffers);
  await page.getByRole('link', { name: 'Events', exact: true }).first().click();
  await expect(page).toHaveURL(/\/events$/, { timeout: 30_000 });
  await expect(canvas).toHaveCount(0, { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stadiumLiveBuffers: number }).__stadiumLiveBuffers)).toBe(0);
  await page.getByRole('link', { name: 'Dashboard', exact: true }).first().click();
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __stadiumLiveBuffers: number }).__stadiumLiveBuffers)).toBe(initialCount);
});
