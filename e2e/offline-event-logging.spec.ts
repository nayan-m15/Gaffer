import { expect, test, type Page, type Route } from "@playwright/test";

const MATCH_ID = "71111111-1111-4111-8111-111111111111";
const EVENT_ID = "72222222-2222-4222-8222-222222222222";
const UI_WAIT = { timeout: process.env.CI ? 30_000 : 10_000 };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function athlete(number: number, firstName: string, started = true) {
  return {
    id: `80000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    firstName,
    lastName: `Player${number}`,
    squadNumber: number,
    position: number === 1 ? "GK" : "CM",
    started,
  };
}

async function mockLiveMatch(page: Page) {
  const squad = [
    athlete(1, "Keeper"),
    athlete(4, "Card"),
    athlete(5, "Dismissed"),
    athlete(6, "Injured"),
    athlete(7, "Seven"),
    athlete(8, "Eight"),
    athlete(9, "Scorer"),
    athlete(10, "Creator"),
    athlete(11, "Eleven"),
    athlete(2, "Two"),
    athlete(3, "Three"),
    athlete(12, "SubOne", false),
    athlete(13, "SubTwo", false),
  ];

  await page.route("**/auth/session", (route) =>
    json(route, {
      user: {
        id: "offline-coach",
        name: "Offline Coach",
        email: "offline@example.com",
        image: null,
        emailVerified: true,
      },
      team: {
        id: "offline-team",
        name: "Offline FC",
        role: "coach",
        primaryColor: "#00D99A",
      },
      claimedAthletes: [],
    }),
  );
  await page.route("**/api/sync/token", (route) =>
    json(route, { message: "offline test" }, 401),
  );
  await page.route(`**/api/matches/${MATCH_ID}/squad`, (route) =>
    json(route, squad),
  );
  await page.route(`**/api/matches/${MATCH_ID}/opponent-squad`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}/events`, (route) =>
    route.request().method() === "GET"
      ? json(route, [])
      : route.abort("internetdisconnected"),
  );
  await page.route(`**/api/matches/${MATCH_ID}`, (route) =>
    json(route, {
      id: MATCH_ID,
      eventId: EVENT_ID,
      competitionId: null,
      opponentName: "Rivals FC",
      isHome: true,
      teamScore: 0,
      opponentScore: 0,
      gamePlanId: null,
      gamePlanSnapshot: null,
      opponentSquadVisibility: "none",
      teamColor: "#00D99A",
      opponentColor: "#FF5B5F",
      clockPeriod: "first_half",
      clockElapsedMs: 754000,
      clockStartedAt: null,
      createdAt: "2026-09-18T10:00:00.000Z",
      updatedAt: "2026-09-18T10:00:00.000Z",
      eventTitle: "Offline test match",
      eventStatus: "scheduled",
      eventScheduledAt: "2026-09-18T10:00:00.000Z",
      eventLocation: "Main field",
      competitionName: null,
      opponentSquad: [],
    }),
  );
}

function player(page: Page, number: number) {
  return page.locator("button.live-marker-hit", {
    hasText: new RegExp(`^${number}Player${number}$`, "i"),
  });
}

async function openEventPicker(page: Page, number: number) {
  await player(page, number).click();
  await expect(
    page.getByText("Log match event", { exact: true }),
  ).toBeVisible(UI_WAIT);
}

async function expectCalloutAboveBench(page: Page, selector: string) {
  await expect
    .poll(() =>
      page.evaluate((calloutSelector) => {
        const callout = document.querySelector(calloutSelector);
        const bench = document.querySelector(".live-match-bench-area");
        if (!callout || !bench) return false;
        return (
          callout.getBoundingClientRect().bottom <=
          bench.getBoundingClientRect().top + 1
        );
      }, selector),
    )
    .toBe(true);
}

test("all live event workflows remain usable and visible offline", async ({
  page,
  context,
}) => {
  // Keep the displayed minute stable while giving queued events distinct
  // timestamps so same-minute goals retain their insertion order.
  let wallClockMs = Date.parse("2026-09-18T10:12:34.000Z");
  const advanceWallClock = async () => {
    wallClockMs += 1_000;
    await page.clock.setFixedTime(wallClockMs);
  };
  await page.clock.setFixedTime(wallClockMs);
  await mockLiveMatch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/matches/${MATCH_ID}/live`);
  await expect(page.getByText("1ST HALF", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "RESUME Match paused" }).click();

  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

  await openEventPicker(page, 9);
  await page.getByRole("button", { name: "Goal" }).click();
  await expect(page.getByText(/Goal saved on this device/i)).toBeVisible();
  await expect(page.locator('[data-callout="assist-pick"]')).toBeVisible();
  await expectCalloutAboveBench(page, '[data-callout="assist-pick"]');
  await player(page, 10).click();
  await expect(page.getByText(/Assist saved on this device/i)).toBeVisible();
  await expect(page.locator(".live-match-scoreline")).toContainText("1-0");

  await advanceWallClock();
  await openEventPicker(page, 4);
  await page.getByRole("button", { name: "Yellow" }).click();
  await expect(
    page.getByText(/Yellow card saved on this device/i),
  ).toBeVisible();
  await expect(page.getByText(/12' Yellow Card/i)).toBeVisible();

  await advanceWallClock();
  await openEventPicker(page, 5);
  await page.getByRole("button", { name: "Red" }).click();
  await expect(page.getByText(/12' Red Card/i)).toBeVisible();

  await advanceWallClock();
  await openEventPicker(page, 1);
  await page.getByRole("button", { name: "Substitution" }).click();
  await expect(page.locator('[data-callout="voluntary-sub-in"]')).toBeVisible();
  await expectCalloutAboveBench(page, '[data-callout="voluntary-sub-in"]');
  await page.getByRole("button", { name: /12.*Player12/i }).click();
  await expect(page.getByText(/12' Substitution/i)).toBeVisible();

  await advanceWallClock();
  await openEventPicker(page, 9);
  await page.getByRole("button", { name: "Penalty" }).click();
  await page.getByRole("button", { name: "MISSED" }).click();
  await expect(page.getByText(/12' Penalty Missed/i)).toBeVisible();

  await advanceWallClock();
  await openEventPicker(page, 9);
  await page.getByRole("button", { name: "Penalty" }).click();
  await page.getByRole("button", { name: "SCORED" }).click();
  await expect(
    page.getByText("12' Penalty 2-0", { exact: true }),
  ).toBeVisible();

  await advanceWallClock();
  await openEventPicker(page, 6);
  await page.getByRole("button", { name: "Injury" }).click();
  // An own-team injury first asks for a diagnosis, and is deliberately
  // skippable: the clock is running and the mandatory substitution is
  // waiting behind this sheet.
  await expect(page.getByRole("dialog", { name: /injury/i })).toBeVisible();
  await page.getByRole("button", { name: /skip details/i }).click();
  await expect(page.locator('[data-callout="mandatory-sub"]')).toBeVisible();
  await expectCalloutAboveBench(page, '[data-callout="mandatory-sub"]');
  await page.getByRole("button", { name: /13.*Player13/i }).click();
  await expect(page.getByText(/12' Injury/i)).toBeVisible();

  await expect(page.getByText("9 waiting", { exact: true })).toBeVisible();
});

test("generic opponent events do not request unavailable players", async ({
  page,
  context,
}) => {
  await mockLiveMatch(page);
  await page.goto(`/matches/${MATCH_ID}/live`);
  const resume = page.getByRole("button", { name: "RESUME Match paused" });
  await expect(resume).toBeVisible(UI_WAIT);
  await resume.click();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine), UI_WAIT).toBe(false);

  const openOpponentEvent = async () => {
    await page.getByRole("button", { name: /log opponent/i }).click();
    await expect(
      page.getByText("Log match event", { exact: true }),
    ).toBeVisible(UI_WAIT);
  };

  await openOpponentEvent();
  await page.getByRole("button", { name: "Goal" }).click();
  await expect(page.locator('[data-callout="assist-pick"]')).toHaveCount(0);

  await openOpponentEvent();
  await page.getByRole("button", { name: "Substitution" }).click();
  await expect(page.locator('[data-callout="voluntary-sub-in"]')).toHaveCount(
    0,
  );

  await openOpponentEvent();
  await page.getByRole("button", { name: "Injury" }).click();
  await expect(page.locator('[data-callout="mandatory-sub"]')).toHaveCount(0);
  await expect(page.getByText("3 waiting", { exact: true })).toBeVisible(UI_WAIT);
});

test("storage exhaustion fails visibly without claiming an event was saved", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("gaffer-simulate-storage-full", "1"),
  );
  await mockLiveMatch(page);
  await page.goto(`/matches/${MATCH_ID}/live`);
  await page.getByRole("button", { name: "RESUME Match paused" }).click();
  await context.setOffline(true);
  await openEventPicker(page, 9);
  await page.getByRole("button", { name: "Goal" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Offline storage is full.",
  );
  await expect(page.getByText(/Goal saved on this device/i)).toHaveCount(0);
});

test("expired sessions retain queued work for a later retry", async ({
  page,
}) => {
  await mockLiveMatch(page);
  await page.route("**/api/sync/upload", (route) =>
    json(route, { message: "Sign in required." }, 401),
  );
  await page.goto(`/matches/${MATCH_ID}/live`);
  await page.getByRole("button", { name: "RESUME Match paused" }).click();
  await openEventPicker(page, 9);
  await page.getByRole("button", { name: "Goal" }).click();
  await expect(page.getByText(/Goal saved on this device/i)).toBeVisible();
  await expect(page.getByText("1 waiting", { exact: true })).toBeVisible();
});

test("membership revocation quarantines work instead of deleting it", async ({
  page,
}) => {
  await mockLiveMatch(page);
  await page.route("**/api/sync/upload", async (route) => {
    const body = route.request().postDataJSON() as {
      items: Array<{ payload?: { clientRequestId?: string }; id?: string }>;
    };
    const item = body.items[0];
    await json(route, {
      receipts: [
        {
          id: item.id ?? item.payload?.clientRequestId,
          outcome: "rejected",
          safeErrorCode: "MEMBERSHIP_REVOKED_OR_FORBIDDEN",
        },
      ],
    });
  });
  await page.goto(`/matches/${MATCH_ID}/live`);
  await page.getByRole("button", { name: "RESUME Match paused" }).click();
  await openEventPicker(page, 9);
  await page.getByRole("button", { name: "Goal" }).click();
  await expect(
    page.getByText("1 access blocked", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/retained on this device/i)).toBeVisible();
});

test("two tabs observe the same durable pending queue", async ({
  page,
  context,
}) => {
  const second = await context.newPage();
  await Promise.all([mockLiveMatch(page), mockLiveMatch(second)]);
  await Promise.all([
    page.goto(`/matches/${MATCH_ID}/live`),
    second.goto(`/matches/${MATCH_ID}/live`),
  ]);
  const resume = page.getByRole("button", { name: "RESUME Match paused" });
  await expect(resume).toBeVisible(UI_WAIT);
  await expect(
    second.getByRole("button", { name: "RESUME Match paused" }),
  ).toBeVisible(UI_WAIT);
  await resume.click();
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine), UI_WAIT).toBe(false);
  await expect.poll(() => second.evaluate(() => navigator.onLine), UI_WAIT).toBe(false);
  await openEventPicker(page, 9);
  await page.getByRole("button", { name: "Goal" }).click();
  // The writer may still be attempting a sync started just before the
  // browser went offline; both labels confirm the same queued item exists.
  await expect(
    page.getByRole("status", { name: /^(?:Syncing 1|1 waiting)/ }),
  ).toBeVisible(UI_WAIT);
  await expect(
    second.getByRole("status", { name: /^1 waiting/ }),
  ).toBeVisible(UI_WAIT);
});
