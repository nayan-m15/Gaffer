import { expect, test, type Page } from "@playwright/test";

type Rgb = [number, number, number];
const UI_WAIT = { timeout: process.env.CI ? 30_000 : 10_000 };

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function luminance([red, green, blue]: Rgb) {
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(first: Rgb, second: Rgb) {
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function parseRgb(value: string): Rgb {
  const channels = value.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) throw new Error(`Unable to parse ${value}`);
  return channels as Rgb;
}

async function openLandingPage(page: Page, theme: "light" | "dark") {
  // Contrast and navigation do not need the animated WebGL background;
  // landing-scene.spec.ts separately verifies that rendering path.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((selectedTheme) => {
    window.localStorage.setItem("sport-coaching-theme", selectedTheme);
  }, theme);
  await page.route("**/auth/session", (route) => route.fulfill({ status: 401, body: "{}" }));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(UI_WAIT);
  await expect(page.locator("#root .loading-overlay")).toBeHidden(UI_WAIT);
  await expect(page.locator("#preloader")).toHaveCount(0, UI_WAIT);
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} landing theme keeps semantic text and controls readable`, async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await openLandingPage(page, theme);
    await expect(page.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
    await expect(page.locator(".landing-scene__readability")).toHaveCount(0);
    await expect(page.locator("main").locator(".fixed.inset-0")).toHaveCount(0);

    const ratios = await page.evaluate(() => {
      const probe = document.createElement("span");
      probe.style.cssText = "position:fixed;pointer-events:none;visibility:hidden";
      document.body.append(probe);
      const resolve = (foreground: string, background: string) => {
        probe.style.color = `var(${foreground})`;
        probe.style.backgroundColor = `var(${background})`;
        const styles = getComputedStyle(probe);
        return [styles.color, styles.backgroundColor] as const;
      };
      const result = {
        primary: resolve("--foreground", "--background"),
        muted: resolve("--muted-foreground", "--background"),
        cardMuted: resolve("--muted-foreground", "--card"),
        brand: resolve("--brand", "--card"),
        primaryButton: resolve("--primary-foreground", "--primary"),
        strongBorder: resolve("--border-strong", "--card"),
      };
      probe.remove();
      return result;
    });

    for (const key of ["primary", "muted", "cardMuted", "brand", "primaryButton"] as const) {
      expect(contrast(parseRgb(ratios[key][0]), parseRgb(ratios[key][1])), key).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(parseRgb(ratios.strongBorder[0]), parseRgb(ratios.strongBorder[1]))).toBeGreaterThanOrEqual(3);

    await page.locator("#roster").scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: /Complete Digital Squad/ })).toBeVisible();
    await expect(page.locator("header")).toHaveClass(/bg-background\/95/);
    expect(consoleErrors.filter((message) => !message.includes("401 (Unauthorized)"))).toEqual([]);
  });
}

test("mobile landing navigation and content do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openLandingPage(page, "light");

  await page.getByRole("button", { name: "Open menu" }).click();
  const mobileNavigation = page.getByRole("banner");
  await expect(mobileNavigation.getByRole("link", { name: "Philosophy" })).toBeVisible();
  await expect(mobileNavigation.getByRole("link", { name: "Get Started", exact: true })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
