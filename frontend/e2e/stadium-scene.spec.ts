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
