import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const season = { id: "season-1", name: "2026/27", startDate: "2026-08-01", endDate: "2027-05-31", isCurrent: true };
const overview = {
  matchesPlayed: 2, wins: 1, draws: 1, losses: 0, winRate: 0.5,
  goalsFor: 3, goalsAgainst: 1, goalDifference: 2, cleanSheets: 1,
  points: 4, avgGoalsFor: 1.5, avgGoalsAgainst: 0.5, season, rollingWindow: 5,
  trends: [
    { matchId: "m1", eventId: "e1", date: "2026-09-01", opponent: "Rivals FC", isHome: true, goalsFor: 3, goalsAgainst: 1, points: 3, result: "W" },
    { matchId: "m2", eventId: "e2", date: "2026-09-02", opponent: "City FC", isHome: false, goalsFor: 0, goalsAgainst: 0, points: 1, result: "D" },
  ],
  players: [{ athleteId: "p1", name: "Alex Keeper", position: "GK", appearances: 2, goals: 0, assists: 1, yellowCards: 1, redCards: 0, saves: 7 }],
  form: {
    rolling: [
      { matchId: "m1", date: "2026-09-01", index: 1, windowSize: 1, goalsForAvg: 3, goalsAgainstAvg: 1, pointsPerGame: 3 },
      { matchId: "m2", date: "2026-09-02", index: 2, windowSize: 2, goalsForAvg: 1.5, goalsAgainstAvg: 0.5, pointsPerGame: 2 },
    ],
    cumulative: [
      { matchId: "m1", date: "2026-09-01", index: 1, points: 3, cumulativePoints: 3, cumulativeGoalDifference: 2 },
      { matchId: "m2", date: "2026-09-02", index: 2, points: 1, cumulativePoints: 4, cumulativeGoalDifference: 2 },
    ],
  },
  periods: { mode: "halves", splits: [
    { key: "first", label: "First half", pointsPerGame: 3, matchesPlayed: 1 },
    { key: "second", label: "Second half", pointsPerGame: 1, matchesPlayed: 1 },
  ], deltas: [] },
  recentInsights: [],
};

async function setup(page: Page) {
  await page.route("**/auth/session", route => route.fulfill({ json: {
    user: { id: "coach", name: "Coach", email: "coach@example.com", emailVerified: true },
    team: { id: "team-1", name: "Test FC", role: "coach", primaryColor: "#00D99A" }, claimedAthletes: [],
  } }));
  await page.route("**/api/**", route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/statistics")) return route.fulfill({ json: {
      ...overview, season: url.searchParams.has("seasonId") ? season : null,
    } });
    if (url.pathname.endsWith("/seasons")) return route.fulfill({ json: [{ ...season, teamId: "team-1", matchCount: 2 }] });
    if (url.pathname.endsWith("/competitions")) return route.fulfill({ json: [
      { id: "cup-1", name: "Test Cup", type: "cup", seasonId: season.id, standings: [], isAdmin: false },
    ] });
    if (url.pathname.endsWith("/season-insight")) return route.fulfill({ json: { status: "unavailable", narrativeText: null } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/statistics?season=season-1&competition=cup-1");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeVisible();
}

async function openPreview(page: Page, mode: "Print" | "Share" = "Print") {
  await page.getByRole("button", { name: mode, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".stats-chart .recharts-wrapper > svg.recharts-surface")).toHaveCount(3);
  return dialog;
}

async function mockPrint(page: Page, behavior: "complete" | "pending" | "fail" = "complete") {
  await page.addInitScript((behavior) => {
    const state = window as unknown as { reportPrint: Record<string, unknown>; printWindow: Window };
    state.reportPrint = { calls: 0, listeners: 0 };
    new MutationObserver(() => {
      const frame = document.querySelector<HTMLIFrameElement>("iframe[data-gaffer-report-print]");
      const target = frame?.contentWindow;
      if (!target || (target as unknown as { mocked: boolean }).mocked) return;
      (target as unknown as { mocked: boolean }).mocked = true;
      state.printWindow = target;
      const add = target.addEventListener.bind(target);
      const remove = target.removeEventListener.bind(target);
      target.addEventListener = ((type: string, listener: EventListener, options?: AddEventListenerOptions) => {
        if (type === "afterprint") state.reportPrint.listeners = Number(state.reportPrint.listeners) + 1;
        add(type, listener, options);
      }) as typeof target.addEventListener;
      target.removeEventListener = ((type: string, listener: EventListener, options?: EventListenerOptions) => {
        if (type === "afterprint") state.reportPrint.listeners = Number(state.reportPrint.listeners) - 1;
        remove(type, listener, options);
      }) as typeof target.removeEventListener;
      target.print = () => {
        const doc = frame!.contentDocument!;
        state.reportPrint.calls = Number(state.reportPrint.calls) + 1;
        state.reportPrint.text = doc.body.innerText;
        state.reportPrint.charts = doc.querySelectorAll(".stats-chart .recharts-wrapper > svg.recharts-surface").length;
        state.reportPrint.color = target.getComputedStyle(doc.querySelector("h2")!).color;
        if (behavior === "fail") throw new Error("Print failed");
        if (behavior === "complete") queueMicrotask(() => target.dispatchEvent(new Event("afterprint")));
      };
    }).observe(document, { childList: true, subtree: true });
  }, behavior);
}

test("normal page, refresh and filter changes never mount the report", async ({ page }) => {
  await setup(page);
  await expect(page.locator(".team-performance-report")).toHaveCount(0);
  await expect(page.locator("iframe[data-gaffer-report-print]")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeVisible();
  await expect(page.locator(".team-performance-report")).toHaveCount(0);
  await page.getByRole("combobox").first().selectOption("");
  await expect(page.locator(".team-performance-report")).toHaveCount(0);
});

test("preview contains scoped data, closes with Escape and restores focus", async ({ page }) => {
  await setup(page);
  const dialog = await openPreview(page);
  await expect(dialog).toContainText("Test Cup");
  await expect(dialog).toContainText("2026/27");
  await expect(dialog).toContainText("Player performance");
  await expect(dialog).toContainText("Alex Keeper");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeFocused();
  await openPreview(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".team-performance-report")).toHaveCount(0);
});

test("print targets report data and charts only and cleans up afterprint", async ({ page }) => {
  await mockPrint(page);
  await setup(page);
  for (let repeat = 0; repeat < 2; repeat++) {
    await openPreview(page);
    await page.getByRole("button", { name: "Print report", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("iframe[data-gaffer-report-print]")).toHaveCount(0);
    const output = await page.evaluate(() => (window as unknown as { reportPrint: Record<string, unknown> }).reportPrint);
    expect(output.calls).toBe(repeat + 1);
    expect(output.charts).toBe(3);
    expect(output.listeners).toBe(0);
    expect(output.text).toContain("Alex Keeper");
    expect(String(output.text).toLowerCase()).toContain("match results");
    expect(String(output.text).toLowerCase()).toContain("team summary");
    expect(output.text).not.toContain("AI Assistant");
    expect(output.text).not.toContain("Share report");
  }
});

test("print event fallback stays recoverable and removes resources on close", async ({ page }) => {
  await mockPrint(page, "pending");
  await setup(page);
  await openPreview(page);
  await page.getByRole("button", { name: "Print report", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { reportPrint: { calls: number } }).reportPrint.calls)).toBe(1);
  await expect(page.getByRole("button", { name: "Print report", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Close preview", exact: true }).click();
  await expect(page.locator("iframe[data-gaffer-report-print]")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { reportPrint: { listeners: number } }).reportPrint.listeners)).toBe(0);
});

test("print failure clears the target and permits retry", async ({ page }) => {
  await mockPrint(page, "fail");
  await setup(page);
  await openPreview(page);
  await page.getByRole("button", { name: "Print report", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be printed");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("iframe[data-gaffer-report-print]")).toHaveCount(0);
  await openPreview(page);
});

for (const outcome of ["success", "cancel", "failure"] as const) {
  test("native CSV share " + outcome + " settles and closes preview", async ({ page }) => {
    await page.addInitScript((outcome) => {
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", { configurable: true, value: async (payload: ShareData) => {
        (window as unknown as { shared: unknown }).shared = { title: payload.title, text: payload.text, csv: await payload.files![0].text() };
        if (outcome === "cancel") throw new DOMException("Cancelled", "AbortError");
        if (outcome === "failure") throw new Error("Unavailable");
      } });
    }, outcome);
    await setup(page);
    await openPreview(page, "Share");
    await page.getByRole("button", { name: "Share report", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".team-performance-report")).toHaveCount(0);
    const shared = await page.evaluate(() => (window as unknown as { shared: { csv: string; text: string } }).shared);
    expect(shared.csv).toContain("Test Cup");
    expect(shared.csv).toContain("Alex Keeper");
    expect(shared.text).toContain("2026/27");
    if (outcome === "success") await expect(page.getByRole("status").filter({ hasText: "Report shared." })).toContainText("Report shared.");
    if (outcome === "failure") await expect(page.getByRole("alert")).toContainText("could not be shared");
    if (outcome === "cancel") await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Share", exact: true })).toBeEnabled();
  });
}

test("clipboard fallback retains selected scope", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (text: string) => { (window as unknown as { copied: string }).copied = text; } } });
  });
  await setup(page);
  await openPreview(page, "Share");
  await page.getByRole("button", { name: "Share report", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "copied" })).toContainText("copied");
  expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toContain("Test Cup");
});

test("pending native sharing prevents duplicate actions", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { shareCalls: number; finishShare: () => void };
    state.shareCalls = 0;
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", { value: () => { state.shareCalls++; return new Promise<void>(resolve => { state.finishShare = resolve; }); } });
  });
  await setup(page);
  await openPreview(page, "Share");
  await page.getByRole("button", { name: "Share report", exact: true }).click();
  await expect(page.getByRole("button", { name: "Share report", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Close preview", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => (window as unknown as { shareCalls: number }).shareCalls)).toBe(1);
  await page.evaluate(() => (window as unknown as { finishShare: () => void }).finishShare());
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

for (const format of ["CSV", "PDF"] as const) {
  test(format + " downloads directly with expected data and no preview", async ({ page }) => {
    await setup(page);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export " + format, exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(new RegExp("^Gaffer_Team_Performance_" + (format === "PDF" ? "Report_" : "") + "Test_FC_\\d{4}-\\d{2}-\\d{2}\\." + format.toLowerCase() + "$"));
    const content = await readFile((await download.path())!);
    if (format === "CSV") {
      expect(content.toString()).toContain("Alex Keeper");
      expect(content.toString()).toContain("Test Cup");
    } else {
      expect(content.subarray(0, 5).toString()).toBe("%PDF-");
      expect(content.toString("latin1")).toContain("Points progression");
      expect(content.toString("latin1")).toContain("Alex Keeper");
    }
    await expect(page.locator(".team-performance-report")).toHaveCount(0);
    await expect(page.locator("iframe[data-gaffer-report-print]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
  });
}

test("CSV failure always removes download links and revokes object URLs", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { created: number; revoked: number };
    state.created = 0; state.revoked = 0;
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { state.created++; return create(blob); };
    URL.revokeObjectURL = (url) => { state.revoked++; revoke(url); };
    const click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download.endsWith(".csv")) throw new Error("Download unavailable");
      click.call(this);
    };
  });
  await setup(page);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("CSV could not");
  await expect(page.locator("a[download]")).toHaveCount(0);
  const state = await page.evaluate(() => ({ created: (window as unknown as { created: number }).created, revoked: (window as unknown as { revoked: number }).revoked }));
  expect(state.created).toBe(state.revoked);
  await expect(page.getByRole("button", { name: "Export", exact: true })).toBeEnabled();
});

for (const { dark, width } of [{ dark: false, width: 390 }, { dark: true, width: 390 }, { dark: false, width: 768 }, { dark: true, width: 1280 }]) {
  test((dark ? "dark" : "light") + " preview is readable and contained at " + width + "px", async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page);
    await page.evaluate((dark) => document.documentElement.classList.toggle("dark", dark), dark);
    const dialog = await openPreview(page);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
    expect(box!.height).toBeLessThanOrEqual(844);
    const colors = await dialog.locator("#team-report-title").evaluate(el => ({ color: getComputedStyle(el).color, background: getComputedStyle(el.closest(".report-cover")!).backgroundColor }));
    expect(colors.color).not.toBe(colors.background);
    await dialog.screenshot({ path: testInfo.outputPath("report-preview.png") });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}

test("cancelling share review never calls native sharing", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", { value: async () => { throw new Error("Share must not run"); } });
  });
  await setup(page);
  await openPreview(page, "Share");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("PDF generation failure releases the operation guard", async ({ page }) => {
  await setup(page);
  await page.route("**/*jspdf*.js", route => route.abort("failed"));
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("PDF could not");
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeEnabled();
  await expect(page.locator(".team-performance-report")).toHaveCount(0);
});

test("route unmount disposes pending print target and listeners", async ({ page }) => {
  await mockPrint(page, "pending");
  await setup(page);
  await openPreview(page);
  await page.getByRole("button", { name: "Print report", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { reportPrint: { calls: number } }).reportPrint.calls)).toBe(1);
  // Exercise React Router unmount without unloading the document.
  await page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>('a[href="/dashboard"]')!;
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.locator("iframe[data-gaffer-report-print]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { reportPrint: { listeners: number } }).reportPrint.listeners)).toBe(0);
});

test("late share settlement after route unmount does not reopen report UI", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { value: () => true });
    Object.defineProperty(navigator, "share", { value: () => new Promise<void>(resolve => {
      (window as unknown as { finishShare: () => void }).finishShare = resolve;
    }) });
  });
  await setup(page);
  await openPreview(page, "Share");
  await page.getByRole("button", { name: "Share report", exact: true }).click();
  await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>('a[href="/dashboard"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect(page).toHaveURL(/dashboard/);
  await page.evaluate(() => (window as unknown as { finishShare: () => void }).finishShare());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Report shared.", { exact: true })).toHaveCount(0);
});

test("print-media exit closes a pending print session", async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { mediaListener: (event: { matches: boolean }) => void; removedMediaListeners: number };
    state.removedMediaListeners = 0;
    new MutationObserver(() => {
      const target = document.querySelector<HTMLIFrameElement>("iframe[data-gaffer-report-print]")?.contentWindow;
      if (!target || (target as unknown as { mocked: boolean }).mocked) return;
      (target as unknown as { mocked: boolean }).mocked = true;
      target.print = () => {
        state.mediaListener({ matches: true });
        queueMicrotask(() => state.mediaListener({ matches: false }));
      };
      target.matchMedia = (() => ({
        matches: false,
        addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => { state.mediaListener = listener; },
        removeEventListener: () => { state.removedMediaListeners++; },
      })) as unknown as typeof target.matchMedia;
    }).observe(document, { childList: true, subtree: true });
  });
  await setup(page);
  await openPreview(page);
  await page.getByRole("button", { name: "Print report", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("iframe[data-gaffer-report-print]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { removedMediaListeners: number }).removedMediaListeners)).toBe(1);
});

test("printing from dark mode uses a light document palette", async ({ page }) => {
  await mockPrint(page);
  await setup(page);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await openPreview(page);
  await page.getByRole("button", { name: "Print report", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const output = await page.evaluate(() => (window as unknown as { reportPrint: { color: string; charts: number } }).reportPrint);
  expect(output.color).toBe("rgb(23, 23, 23)");
  expect(output.charts).toBe(3);
});
