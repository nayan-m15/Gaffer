import { expect, test } from '@playwright/test';

test('production PWA installs its worker and reopens its shell offline', async ({
  context,
  page,
}) => {
  await page.route('**/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'null',
    }),
  );

  await page.goto('/');
  await expect(page).toHaveTitle(/Gaffer/);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'domcontentloaded' });

  const workerState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    await registration.update();
    return {
      active: registration.active?.state,
      controlled: Boolean(navigator.serviceWorker.controller),
      caches: await caches.keys(),
      manifest: document.querySelector<HTMLLinkElement>(
        'link[rel="manifest"]',
      )?.href,
    };
  });
  expect(workerState.active).toBe('activated');
  expect(workerState.controlled).toBe(true);
  expect(workerState.caches.length).toBeGreaterThan(0);
  expect(workerState.manifest).toMatch(/manifest\.webmanifest$/);

  await page.unroute('**/auth/session');
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle(/Gaffer/);
  await expect(page.locator('#root')).not.toBeEmpty();

  const authenticatedApiUnavailable = await page.evaluate(async () => {
    try {
      await fetch('/auth/session', { cache: 'no-store' });
      return false;
    } catch {
      return true;
    }
  });
  expect(authenticatedApiUnavailable).toBe(true);
});
