import { expect, test, type Page } from "@playwright/test";

async function openLandingPage(page: Page) {
  await page.route("**/auth/session", (route) => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/");
  await expect(page.locator(".loading-overlay")).toBeHidden({ timeout: 10_000 });
}

test.describe("landing-page tactical background", () => {
  test("enhances the hero without intercepting its controls", async ({ page }) => {
    await openLandingPage(page);

    const scene = page.locator(".landing-scene");
    await expect(scene).toHaveAttribute("data-ready", "true", { timeout: 10_000 });
    await expect(scene.locator("canvas")).toHaveCount(1);
    await expect(scene).toHaveCSS("pointer-events", "none");

    const pause = page.getByRole("button", { name: "Pause background" });
    await expect(pause).toBeVisible();
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
    await page.setViewportSize({ width: 390, height: 844 });
    await openLandingPage(page);

    const canvas = page.locator(".landing-scene canvas");
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /background/ })).toBeHidden();

    const bufferSize = await canvas.evaluate((element: HTMLCanvasElement) => ({
      width: element.width,
      height: element.height,
    }));
    expect(bufferSize.width * bufferSize.height).toBeLessThanOrEqual(800_000);
  });
});
