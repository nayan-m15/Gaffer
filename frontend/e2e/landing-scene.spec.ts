import { expect, test, type Page } from "@playwright/test";

// Loading Three.js and compiling its first WebGL scene can be noticeably
// slower on shared CI runners using SwiftShader than on a developer machine.
const SCENE_TIMEOUT = 30_000;

// Exercise the 3D lifecycle on CI's software GPU. Separate tests below verify
// the actual software-renderer fallback without this test-only capability shim.
async function enableScene(page: Page) {
  await page.route('**/assets/scene-capability.worker-*.js', route => route.fulfill({ contentType: 'application/javascript', body: 'self.postMessage(true);' }));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8 });
    Object.defineProperty(navigator, 'deviceMemory', { value: 8 });
    for (const prototype of [WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype]) {
      const original = prototype.getParameter;
      prototype.getParameter = function (parameter: number) {
        if (parameter === 0x9246 || parameter === this.RENDERER) return 'Test hardware GPU';
        return original.call(this, parameter);
      };
    }
  });
}

async function openLandingPage(page: Page) {
  await page.route("**/auth/session", (route) => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/");
  await expect(page.locator("#root .loading-overlay")).toBeHidden({ timeout: SCENE_TIMEOUT });
  await expect(page.locator("#preloader")).toHaveCount(0, { timeout: SCENE_TIMEOUT });
}

test.describe("landing-page tactical background", () => {
  test("enhances the hero without intercepting its controls", async ({ page }) => {
    await enableScene(page);
    await openLandingPage(page);

    const scene = page.locator(".landing-scene");
    await expect(scene).toHaveAttribute("data-ready", "true", { timeout: SCENE_TIMEOUT });
    await expect(scene.locator("canvas")).toHaveCount(1, { timeout: SCENE_TIMEOUT });
    await expect(scene).toHaveCSS("pointer-events", "none");

    const pause = page.getByRole("button", { name: "Pause background" });
    await expect(pause).toBeVisible({ timeout: SCENE_TIMEOUT });
    await pause.click();
    await expect(page.getByRole("button", { name: "Resume background" })).toHaveAttribute("aria-pressed", "true");

    await expect(page.getByRole("link", { name: "Get Started", exact: true }).first()).toHaveAttribute("href", "/signup");
    await expect(page.getByRole("link", { name: "Log In", exact: true }).first()).toHaveAttribute("href", "/login");
  });

  test("uses the static fallback when reduced motion is requested", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLandingPage(page);

    await expect(page.locator(".landing-scene canvas")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /background/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("renders a bounded static canvas on mobile", async ({ page }) => {
    await enableScene(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await openLandingPage(page);

    const canvas = page.locator(".landing-scene canvas");
    await expect(canvas).toBeVisible({ timeout: SCENE_TIMEOUT });
    await expect(page.getByRole("button", { name: /background/ })).toBeHidden();

    const bufferSize = await canvas.evaluate((element: HTMLCanvasElement) => ({
      width: element.width,
      height: element.height,
    }));
    expect(bufferSize.width * bufferSize.height).toBeLessThanOrEqual(800_000);
  });

  test("updates the existing scene across repeated theme changes", async ({ page }) => {
    await enableScene(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("sport-coaching-theme", "dark");
    });
    await openLandingPage(page);

    const canvas = page.locator(".landing-scene canvas");
    await expect(canvas).toHaveCount(1, { timeout: SCENE_TIMEOUT });
    await canvas.evaluate((element) => {
      element.dataset.sceneInstance = "original";
    });

    const themeToggle = page.getByRole("button", { name: /Switch to (light|dark) mode/ }).first();
    for (const expectedTheme of ["light", "dark", "light", "dark"] as const) {
      await themeToggle.click();
      await expect(page.locator("html")).toHaveClass(
        expectedTheme === "dark" ? /dark/ : /^(?!.*dark)/,
      );
      await expect(canvas).toHaveAttribute("data-scene-instance", "original");
      await expect(canvas).toHaveCount(1);
    }
  });

  test('software rendering retains the optimized static background', async ({ page }) => {
    await openLandingPage(page);
    await expect(page.locator('[data-scene-status]')).toHaveAttribute('data-scene-status', 'fallback', { timeout: SCENE_TIMEOUT });
    await expect(page.locator('.landing-scene canvas')).toHaveCount(0);
    await expect(page.locator('img[src="/hero-stadium-bg-960.webp"]')).toBeVisible();
  });

  test('a reduced-motion change disposes the scene and can restart it', async ({ page }) => {
    await enableScene(page);
    await openLandingPage(page);
    await expect(page.locator('.landing-scene')).toHaveAttribute('data-ready', 'true', { timeout: SCENE_TIMEOUT });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(page.locator('.landing-scene canvas')).toHaveCount(0, { timeout: SCENE_TIMEOUT });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('.landing-scene')).toHaveAttribute('data-ready', 'true', { timeout: SCENE_TIMEOUT });
    await expect(page.locator('.landing-scene canvas')).toHaveCount(1);
  });

  test('navigation cancels initialization and back navigation creates one scene', async ({ page }) => {
    await enableScene(page);
    await page.route('**/auth/session', route => route.fulfill({ status: 401, body: '{}' }));
    await page.goto('/');
    await expect(page.locator('.landing-scene canvas')).toHaveCount(1, { timeout: SCENE_TIMEOUT });
    await expect(page.locator('.landing-scene')).toHaveAttribute('data-ready', 'false');
    await page.getByRole('link', { name: 'Log In', exact: true }).first().click({ force: true });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator('.landing-scene canvas')).toHaveCount(0);
    await page.goBack();
    await expect(page.locator('.landing-scene')).toHaveAttribute('data-ready', 'true', { timeout: SCENE_TIMEOUT });
    await expect(page.locator('.landing-scene canvas')).toHaveCount(1);
  });

  test('failed shirt assets preserve procedural shirts and rapid scroll works', async ({ page }) => {
    await enableScene(page);
    await page.route('**/models/landing-shirt*', route => route.abort());
    await openLandingPage(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.locator('.landing-scene')).toHaveAttribute('data-ready', 'true', { timeout: SCENE_TIMEOUT });
    await expect(page.getByRole('button', { name: 'Pause background' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('WebGL failure leaves content and navigation usable', async ({ page }) => {
    await page.route('**/assets/scene-capability.worker-*.js', route => route.fulfill({ contentType: 'application/javascript', body: 'self.postMessage(true);' }));
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
        if (String(args[0]).includes('webgl')) return null;
        return original.apply(this, args);
      } as typeof original;
    });
    await openLandingPage(page);
    await expect(page.locator('[data-scene-status]')).toHaveAttribute('data-scene-status', 'fallback', { timeout: SCENE_TIMEOUT });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.landing-scene canvas')).toHaveCount(0);
  });

  test('constrained devices avoid downloading the 3D scene', async ({ page }) => {
    const sceneRequests: string[] = [];
    page.on('request', request => { if (/landing-scene-|three\.module-/.test(request.url())) sceneRequests.push(request.url()); });
    await page.addInitScript(() => Object.defineProperty(navigator, 'deviceMemory', { value: 2 }));
    await openLandingPage(page);
    await expect(page.locator('[data-scene-status]')).toHaveAttribute('data-scene-status', 'fallback');
    await expect(page.locator('.landing-scene canvas')).toHaveCount(0);
    expect(sceneRequests).toEqual([]);
  });
});
