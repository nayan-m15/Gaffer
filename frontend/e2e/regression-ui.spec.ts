import { expect, test, type Page, type Route } from "@playwright/test";

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const EVENT_ID = "22222222-2222-4222-8222-222222222222";
const LOG_ID = "33333333-3333-4333-8333-333333333333";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function session(
  name: string,
  teamName: string,
  userId: string,
  role: "coach" | "assistant" = "coach",
) {
  return {
    user: {
      id: userId,
      name,
      email: `${userId}@example.com`,
      image: null,
      emailVerified: true,
    },
    team: {
      id: `team-${userId}`,
      name: teamName,
      role,
      primaryColor: "#00D99A",
    },
    claimedAthletes: [],
  };
}

async function mockAuthenticatedMatch(page: Page, completed = false, overrides: Record<string, unknown> = {}) {
  await page.route("**/auth/session", (route) =>
    json(route, session("Test Coach", "Test FC", "test-coach")),
  );
  await page.route(`**/api/matches/${MATCH_ID}/squad`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}/opponent-squad`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}`, (route) =>
    json(route, {
      id: MATCH_ID,
      eventId: EVENT_ID,
      competitionId: null,
      opponentName: "Rivals FC",
      isHome: true,
      teamScore: 1,
      opponentScore: 0,
      gamePlanId: null,
      gamePlanSnapshot: null,
      opponentSquadVisibility: "none",
      teamColor: "#00D99A",
      opponentColor: "#FF5B5F",
      clockPeriod: completed ? "full_time" : "first_half",
      clockElapsedMs: 754000,
      clockRevision: 0,
      clockStartedAt: null,
      createdAt: "2026-09-11T10:00:00.000Z",
      updatedAt: "2026-09-11T10:00:00.000Z",
      eventTitle: "Test match",
      eventStatus: completed ? "completed" : "scheduled",
      eventScheduledAt: "2026-09-11T10:00:00.000Z",
      eventLocation: "Main field",
      competitionName: null,
      opponentSquad: [],
      ...overrides,
    }),
  );
}

test("ending a match requires confirmation and cancelling makes no finish request", async ({ page }) => {
  await mockAuthenticatedMatch(page);
  await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
  await page.route(`**/api/events/${EVENT_ID}/opponent-lineup`, route => json(route, { available: false }));
  let finishes = 0;
  await page.route(`**/api/matches/${MATCH_ID}/finish`, route => {
    finishes++;
    return json(route, { message: "Temporary failure" }, 503);
  });
  await page.goto(`/matches/${MATCH_ID}/live`);
  await page.getByRole("button", { name: "End Match", exact: true }).click();
  await expect(page.getByText("END MATCH?", { exact: true })).toBeVisible();
  expect(finishes).toBe(0);
  await page.getByRole("button", { name: "NO, GO BACK", exact: true }).click();
  await expect(page.getByText("END MATCH?", { exact: true })).toHaveCount(0);
  expect(finishes).toBe(0);
  await page.getByRole("button", { name: "End Match", exact: true }).click();
  await page.getByRole("button", { name: "END MATCH & SAVE REPORT", exact: true }).click();
  await expect.poll(() => finishes).toBe(1);
  await expect(page.getByText("END MATCH?", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").filter({ hasText: "END MATCH?" }).getByRole("alert")).toHaveText("Temporary failure");
});

test("an opponent report returns to live play when the shared match resumes", async ({ page }) => {
  const sessionId = "44444444-4444-4444-8444-444444444444";
  await mockAuthenticatedMatch(page, true, { sharedSessionId: sessionId });
  await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
  await page.route(`**/api/matches/${MATCH_ID}/event-reviews`, route => json(route, []));
  let resumed = false;
  await page.route(`**/api/matches/sessions/${sessionId}/report`, route => json(route, {
    sessionId, reportRevision: resumed ? 4 : 3, participants: [], score: { home: 1, away: 0 },
    clock: { period: resumed ? "second_half" : "full_time", elapsedMs: 5400000,
      startedAt: resumed ? new Date().toISOString() : null, running: resumed, revision: resumed ? 4 : 3 },
    finalStatus: resumed ? "open" : "awaiting_confirmation", finalisedAt: null,
    confirmations: { home: null, away: null }, timeline: [], reviews: [],
  }));
  await page.goto(`/matches/${MATCH_ID}/report`);
  await expect(page.getByRole("button", { name: "Resume match", exact: true })).toBeVisible();
  resumed = true;
  await expect(page).toHaveURL(new RegExp(`/matches/${MATCH_ID}/live`), { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "End Match", exact: true })).toBeVisible();
});

test("resuming from the report requires confirmation and submits the current clock revision", async ({ page }) => {
  await mockAuthenticatedMatch(page, true, { clockRevision: 8 });
  await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
  await page.route(`**/api/matches/${MATCH_ID}/event-reviews`, route => json(route, []));
  let requests = 0;
  await page.route(`**/api/matches/${MATCH_ID}/resume`, route => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({ expectedClockRevision: 8 });
    return json(route, { message: "The match changed. Refresh and retry." }, 409);
  });
  await page.goto(`/matches/${MATCH_ID}/report`);
  await page.getByRole("button", { name: "Resume match", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Resume match?" });
  await expect(dialog).toBeVisible();
  expect(requests).toBe(0);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "Resume match", exact: true }).click();
  await dialog.getByRole("button", { name: "Resume match", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("The match changed. Refresh and retry.");
  expect(requests).toBe(1);
  await expect(page).toHaveURL(new RegExp(`/matches/${MATCH_ID}/report`));
});

test("account switching clears private dashboard cache", async ({ page }) => {
  let active = "a";
  await page.route("**/auth/session", (route) =>
    active === "signed-out" ? json(route, {}, 401) :
    json(
      route,
      active === "a"
        ? session("Coach A", "Alpha FC", "coach-a")
        : session("Coach B", "Beta FC", "coach-b"),
    ),
  );
  await page.route("**/auth/sign-out", (route) => {
    active = "signed-out";
    return json(route, { success: true });
  });
  await page.route("**/auth/sign-in", (route) => {
    active = "b";
    return json(route, { success: true });
  });
  await page.route("**/api/dashboard", (route) =>
    json(route, {
      activeAthletesCount: active === "a" ? 11 : 2,
      totalEventsCount: 0,
      upcomingEvents: [],
    }),
  );

  await page.goto("/dashboard");
  await expect(
    page.getByText("Welcome back, Coach A · Alpha FC", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /11 Active Athletes/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign Out" }).click();
  // Wait for asynchronous cache/scope cleanup and the application's redirect
  // before navigating; a full reload here used to interrupt sign-out.
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/login");
  await page.getByLabel("Email address").fill("coach-b@example.com");
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: /sign in to dugout/i }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByText("Welcome back, Coach B · Beta FC", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /2 Active Athletes/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /11 Active Athletes/ })).toHaveCount(0);
});

test("authenticated sidebar navigates on mobile and preserves history", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route("**/auth/session", (route) =>
    json(route, session("Mobile Coach", "Pocket FC", "mobile-coach")),
  );
  await page.route("**/api/dashboard", (route) =>
    json(route, {
      activeAthletesCount: 8,
      totalEventsCount: 0,
      upcomingEvents: [],
    }),
  );
  await page.route("**/api/events**", (route) => json(route, []));

  await page.goto("/dashboard");
  // Coaches navigate on phones with the bottom dock; its Menu button opens
  // the remaining destinations.
  const dock = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(dock).toBeVisible();
  await dock.getByRole("button", { name: "Menu" }).click();
  const moreMenu = page.getByRole("group", { name: "More navigation" });
  await expect(moreMenu.getByRole("link", { name: "Roster" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(moreMenu).toBeHidden();

  await dock.getByRole("link", { name: "Events" }).click();

  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("heading", { name: "Events" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("desktop sidebar collapse persists and theme toggle remains usable", async ({
  page,
}) => {
  await page.route("**/auth/session", (route) =>
    json(route, session("Desktop Coach", "Wide FC", "desktop-coach")),
  );
  await page.route("**/api/dashboard", (route) =>
    json(route, {
      activeAthletesCount: 11,
      totalEventsCount: 2,
      upcomingEvents: [],
    }),
  );

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("gaffer-sidebar-expanded")),
    )
    .toBe("false");

  await page
    .getByRole("button", { name: /Switch to (light|dark) mode/ })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("sport-coaching-theme")),
    )
    .not.toBeNull();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Expand navigation" }),
  ).toBeVisible();
});

test("live match clock resumes from the persisted value", async ({ page }) => {
  await mockAuthenticatedMatch(page);
  await page.route(`**/api/matches/${MATCH_ID}/events`, (route) =>
    json(route, []),
  );

  await page.goto(`/matches/${MATCH_ID}/live`);

  await expect(page.getByText("12:34", { exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText("1ST HALF", { exact: true })).toBeVisible();
});

test("assistant controls and remote clock changes update without a refresh", async ({
  page,
}) => {
  let match = {
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
    clockStartedAt: null as string | null,
    createdAt: "2026-09-11T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    eventTitle: "Shared match",
    eventStatus: "scheduled",
    eventScheduledAt: "2026-09-11T10:00:00.000Z",
    eventLocation: "Main field",
    competitionName: null,
    opponentSquad: [],
  };
  await page.route("**/auth/session", (route) =>
    json(
      route,
      session("Test Assistant", "Test FC", "test-assistant", "assistant"),
    ),
  );
  await page.route(`**/api/matches/${MATCH_ID}/squad`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}/opponent-squad`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}/events`, (route) =>
    json(route, []),
  );
  await page.route(`**/api/matches/${MATCH_ID}`, (route) => json(route, match));

  await page.goto(`/matches/${MATCH_ID}/live`);
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Half Time" })).toBeVisible();
  await expect(page.getByRole("button", { name: "End Match" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();

  match = {
    ...match,
    clockStartedAt: new Date().toISOString(),
    updatedAt: "2026-09-11T10:01:00.000Z",
  };
  await expect(
    page.getByRole("button", { name: "Pause", exact: true }),
  ).toBeVisible({ timeout: 4_000 });

  match = {
    ...match,
    clockPeriod: "half_time",
    clockStartedAt: null,
    updatedAt: "2026-09-11T10:02:00.000Z",
  };
  await expect(page.getByText("HALF-TIME", { exact: true })).toBeVisible({
    timeout: 4_000,
  });

  match = {
    ...match,
    clockPeriod: "first_half",
    updatedAt: "2026-09-11T10:03:00.000Z",
  };
  await expect(page.getByText("1ST HALF", { exact: true })).toBeVisible({
    timeout: 4_000,
  });
});

test("friendly search deduplicates identities and distinguishes same-name coached teams", async ({ page }) => {
  await page.route('**/auth/session', route => json(route, session('Coach', 'Own FC', 'viewer')));
  await page.route('**/api/**', route => json(route, []));
  await page.route('**/api/teams/search?**', route => json(route, [
    {id:'one', name:'Chelsea FC', primaryColor:null, coachName:'Nayan'},
    {id:'one', name:'Chelsea FC', primaryColor:null, coachName:'Nayan'},
    {id:'two', name:'Chelsea FC', primaryColor:null, coachName:'Other coach'},
  ]));
  await page.goto('/events');
  await page.getByRole('toolbar', {name:'Calendar controls'}).getByRole('button', {name:'New Event', exact:true}).click();
  await page.getByRole('radio', {name:'Match', exact:true}).click();
  await page.getByPlaceholder('Search teams or coach names').fill('Chelsea');
  await page.getByRole('button', {name:'Search', exact:true}).click();
  await expect(page.getByRole('button', {name:/Chelsea FC.*Coach: Nayan/})).toHaveCount(1);
  await expect(page.getByRole('button', {name:/Chelsea FC.*Coach: Other coach/})).toHaveCount(1);
});

for (const rejected of [false, true]) {
  test(`shared post-match deletion ${rejected ? 'shows upload rejection' : 'updates the peer report and keeps comparison labels stable'}`, async ({ page }) => {
    const sessionId = '44444444-4444-4444-8444-444444444444';
    await mockAuthenticatedMatch(page, true, { isHome: false, sharedSessionId: sessionId });
    await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
    let polls = 0;
    let timeline = [{ id: LOG_ID, side: 'home', eventType: 'goal', minute: 10,
      createdAt: '2026-10-06T10:00:00Z', player: { name: 'Peer scorer', shirtNumber: 9 } }];
    await page.route(`**/api/matches/sessions/${sessionId}/report`, route => {
      polls++;
      return json(route, { sessionId, participants: [], score: { home: timeline.length, away: 0 },
        clock: { period: 'full_time', elapsedMs: 5400000, startedAt: null, running: false, revision: 1 },
        finalStatus: 'awaiting_confirmation', finalisedAt: null, confirmations: { home: null, away: null },
        timeline, reviews: [] });
    });
    await page.route('**/api/sync/upload', route => {
      const { items } = route.request().postDataJSON();
      const operation = items.find((item: { operationType: string }) => item.operationType === 'void');
      expect(operation).toMatchObject({ matchId: MATCH_ID, canonicalEventId: LOG_ID });
      if (!rejected) timeline = [];
      return json(route, { receipts: [{ id: operation.id, outcome: rejected ? 'rejected' : 'accepted',
        canonicalEventId: LOG_ID, safeErrorCode: rejected ? 'EVENT_NOT_FOUND' : null }] });
    });
    await page.goto(`/matches/${MATCH_ID}/report`);
    await expect(page.getByRole('button', { name: /10' Goal/i })).toBeVisible({ timeout: 20000 });
    const chart = page.getByRole('heading', { name: 'Team comparison' }).locator('..').locator('..');
    await expect(chart.locator('.recharts-label-list').first()).toBeVisible();
    if (!rejected) {
      await chart.evaluate(section => {
        const state = { missing: 0 };
        const initialLabels = section.querySelectorAll('.recharts-label-list').length;
        const observer = new MutationObserver(() => {
          if (section.querySelectorAll('.recharts-label-list').length !== initialLabels) state.missing++;
        });
        observer.observe(section, { childList: true, subtree: true });
        Object.assign(window, { comparisonLabelCheck: { state, observer } });
      });
      const initialPolls = polls;
      await expect.poll(() => polls).toBeGreaterThanOrEqual(initialPolls + 3);
      expect(await page.evaluate(() => {
        const check = (window as unknown as { comparisonLabelCheck: { state: { missing: number }; observer: MutationObserver } }).comparisonLabelCheck;
        check.observer.disconnect();
        return check.state.missing;
      })).toBe(0);
    }
    await page.getByRole('button', { name: 'Delete event', exact: true }).click();
    await page.getByRole('button', { name: 'DELETE', exact: true }).click();
    if (rejected) {
      await expect(page.getByText('EVENT_NOT_FOUND', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: /10' Goal/i })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: /10' Goal/i })).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Match Events' })).toBeVisible();
      await expect(page.getByRole('button', { name: /10' Goal/i })).toHaveCount(0);
    }
  });
}

test("confirmed shared report locks events and submits an amendment against its version", async ({ page }) => {
  const sessionId = "44444444-4444-4444-8444-444444444444";
  await mockAuthenticatedMatch(page, true, { sharedSessionId: sessionId });
  await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
  await page.route(`**/api/matches/sessions/${sessionId}/report`, route => json(route, {
    sessionId, reportRevision: 7,
    participants: [{ side: "home", teamId: "team-test-coach", teamName: "Test FC" },
      { side: "away", teamId: "team-rivals", teamName: "Rivals FC" }],
    score: { home: 1, away: 0 },
    clock: { period: "full_time", elapsedMs: 5400000, startedAt: null, running: false, revision: 1 },
    finalStatus: "finalised", finalisedAt: "2026-10-06T12:00:00Z",
    confirmations: { home: "2026-10-06T11:00:00Z", away: "2026-10-06T12:00:00Z" },
    timeline: [{ id: LOG_ID, side: "home", eventType: "goal", minute: 10,
      lifecycleStatus: "confirmed", createdAt: "2026-10-06T10:00:00Z", player: { name: "Scorer", shirtNumber: 9 } }],
    reviews: [],
  }));
  let submitted: Record<string, unknown> | undefined;
  await page.route(`**/api/matches/${MATCH_ID}/amendments`, route => {
    if (route.request().method() === "POST") {
      submitted = route.request().postDataJSON();
      return json(route, { id: submitted!.id, status: "pending" });
    }
    return json(route, []);
  });
  await page.goto(`/matches/${MATCH_ID}/report`);
  await expect(page.getByRole("button", { name: /10' Goal/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete event", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Event", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Request amendment", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Report amendments" });
  await dialog.getByLabel("Minute", { exact: true }).fill("12");
  await dialog.getByLabel("Reason", { exact: true }).fill("Correct the goal time");
  await dialog.getByRole("button", { name: "Propose change" }).click();
  await expect(dialog.getByRole("status")).toContainText("official report stays unchanged");
  expect(submitted).toMatchObject({ expectedSessionRevision: 7, action: "correct",
    canonicalEventId: LOG_ID, replacement: { eventType: "goal", minute: 12 }, reason: "Correct the goal time" });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: /10' Goal/i })).toBeDisabled();
});

test("cross-team duplicate review shows both positions and explanations", async ({ page }) => {
  const sessionId = "44444444-4444-4444-8444-444444444444";
  await mockAuthenticatedMatch(page, true, { sharedSessionId: sessionId });
  await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
  const review = { id: LOG_ID, reviewVersion: 2, reason: "possible_duplicate", status: "open",
    crossTeam: true, locked: false, teamNames: { home: "Test FC", away: "Rivals FC" },
    teamDecisions: { home: "same_event", away: "separate_events" },
    teamDecisionNotes: { home: "Same scorer and time", away: "Two different attacks" },
    observations: [{ id: LOG_ID, eventType: "goal", team: "own", eventTeamName: "Test FC",
      sourceTeamName: "Rivals FC", observerName: "Rival coach", playerLabel: "#9 Scorer", matchElapsedMs: 600000 }],
  };
  await page.route(`**/api/matches/${MATCH_ID}/event-reviews`, route => json(route, [review]));
  await page.route(`**/api/matches/sessions/${sessionId}/report`, route => json(route, {
    sessionId, reportRevision: 3, participants: [], score: { home: 2, away: 0 },
    clock: { period: "full_time", elapsedMs: 5400000, startedAt: null, running: false, revision: 1 },
    finalStatus: "awaiting_confirmation", finalisedAt: null, confirmations: { home: null, away: null },
    timeline: [], reviews: [review],
  }));
  await page.goto(`/matches/${MATCH_ID}/report`);
  await expect(page.getByRole("button", { name: "Confirm report", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Review queue" }).click();
  const dialog = page.getByRole("dialog", { name: "Event review" });
  await expect(dialog.getByText("Test FC: Count as one event - Same scorer and time")).toBeVisible();
  await expect(dialog.getByText("Rivals FC: Keep as two events - Two different attacks")).toBeVisible();
  await expect(dialog.getByText(/Teams disagree/)).toBeVisible();
  await expect(dialog.getByText(/recorded by Rivals FC \(Rival coach\)/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Count as one event" })).toBeEnabled();
  let posted: Record<string, unknown> | undefined;
  await page.route(`**/api/matches/${MATCH_ID}/event-reviews/${LOG_ID}/resolve`, route => {
    posted = route.request().postDataJSON();
    review.teamDecisions.away = "same_event";
    return json(route, review);
  });
  await dialog.getByRole("button", { name: "Count as one event" }).click();
  await expect.poll(() => posted?.resolution).toBe("same_event");
  expect(posted?.operationId).toEqual(expect.any(String));
  await expect(dialog.getByText("Rivals FC: Count as one event - Two different attacks")).toBeVisible();
  await expect(dialog.getByText(/Teams disagree/)).toHaveCount(0);
});

for (const completed of [false, true]) {
  test(`duplicate review dialog opens and reports loading and failures in ${completed ? "the report" : "the live logger"}`, async ({ page }, testInfo) => {
    const sessionId = "44444444-4444-4444-8444-444444444444";
    await mockAuthenticatedMatch(page, completed, { sharedSessionId: sessionId });
    await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
    await page.route(`**/api/events/${EVENT_ID}/opponent-lineup`, route => json(route, { available: false }));
    await page.route(`**/api/matches/sessions/${sessionId}/report`, route => json(route, {
      sessionId, reportRevision: 1, participants: [], score: { home: 0, away: 0 },
      clock: { period: completed ? "full_time" : "first_half", elapsedMs: 600000, startedAt: null, running: false, revision: 1 },
      finalStatus: completed ? "awaiting_confirmation" : "open", finalisedAt: null,
      confirmations: { home: null, away: null }, timeline: [], reviews: [],
    }));
    let release!: () => void;
    const delayed = new Promise<void>(resolve => { release = resolve; });
    let failed = true;
    await page.route(`**/api/matches/${MATCH_ID}/event-reviews`, async route => {
      await delayed;
      return failed ? json(route, { message: "Review service unavailable" }, 503) : json(route, []);
    });
    await page.goto(`/matches/${MATCH_ID}/${completed ? "report" : "live"}`);
    if (completed) await page.getByRole("button", { name: "Review queue" }).click();
    else {
      await page.getByRole("button", { name: "Match settings" }).click();
      await page.getByRole("button", { name: "Review duplicates" }).click();
    }
    const dialog = page.getByRole("dialog", { name: "Event review" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("status")).toHaveText("Loading reviews…");
    await expect(dialog.getByText("No events need review.")).toHaveCount(0);
    release();
    await expect(dialog.getByRole("alert")).toContainText("Review service unavailable");
    await expect(dialog.getByText("No events need review.")).toHaveCount(0);
    failed = false;
    await dialog.getByRole("button", { name: "Refresh" }).click();
    await expect(dialog.getByText("No events need review.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("review-dialog.png") });
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

test("removed duplicate reviews stay in history and no longer block the report", async ({ page }) => {
  const sessionId = "44444444-4444-4444-8444-444444444444";
  await mockAuthenticatedMatch(page, true, { sharedSessionId: sessionId });
  await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
  const review = { id: LOG_ID, reviewVersion: 2, reason: "possible_duplicate", status: "resolved",
    resolution: "event_removed", locked: false, observations: [],
    resolvedByUserId: "resolver-private-id", resolvedByName: "Alex Coach",
    disputedByUserId: "disputer-private-id", disputedByName: "Sam Coach" };
  await page.route(`**/api/matches/${MATCH_ID}/event-reviews`, route => json(route, [review]));
  await page.route(`**/api/matches/sessions/${sessionId}/report`, route => json(route, {
    sessionId, reportRevision: 2, participants: [], score: { home: 1, away: 0 },
    clock: { period: "full_time", elapsedMs: 5400000, startedAt: null, running: false, revision: 1 },
    finalStatus: "awaiting_confirmation", finalisedAt: null, confirmations: { home: null, away: null },
    timeline: [], reviews: [review],
  }));
  await page.goto(`/matches/${MATCH_ID}/report`);
  await expect(page.getByRole("button", { name: "Confirm report", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Shared session result")).not.toContainText("possible duplicate");
  await page.getByRole("button", { name: "Review queue" }).click();
  const dialog = page.getByRole("dialog", { name: "Event review" });
  await expect(dialog.getByText(/Closed because an event was removed/)).toBeVisible();
  await expect(dialog.getByText(/resolved by Alex Coach/)).toBeVisible();
  await expect(dialog.getByText(/disputed by Sam Coach/)).toBeVisible();
  await expect(dialog).not.toContainText("resolver-");
  await expect(dialog).not.toContainText("disputer-");
  await expect(dialog.getByRole("button", { name: "Reconsider" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Flag dispute" })).toHaveCount(0);
});

test("post-match correction updates the visible timeline", async ({ page }) => {
  await mockAuthenticatedMatch(page, true);
  let event = {
    id: LOG_ID,
    matchId: MATCH_ID,
    athleteId: null,
    team: "own",
    opponentLabel: null,
    opponentPlayerId: null,
    eventType: "goal",
    minute: 10,
    detail: null,
    loggedByUserId: "test-coach",
    manuallyAdjusted: false,
    clientRequestId: null,
    createdAt: "2026-09-11T10:10:00.000Z",
    updatedAt: "2026-09-11T10:10:00.000Z",
    athlete: null,
    opponentPlayer: null,
  };
  await page.route(`**/api/matches/${MATCH_ID}/events`, (route) =>
    json(route, [event]),
  );
  await page.route(
    "**/api/sync/upload",
    async (route) => {
      const { items } = route.request().postDataJSON() as {
        items: { id: string; kind: string; operationType: string; canonicalEventId: string; replacement: Partial<typeof event> }[];
      };
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        kind: "operation",
        operationType: "correct",
        canonicalEventId: LOG_ID,
        replacement: { minute: 12, eventType: "yellow_card" },
      });
      event = {
        ...event,
        ...items[0].replacement,
        manuallyAdjusted: true,
      };
      return json(route, {
        receipts: [{ id: items[0].id, outcome: "accepted", canonicalEventId: LOG_ID }],
      });
    },
  );

  // A cold load of the report can take ~20s on a shared CI runner; allow for
  // it on the first load and again after the reload.
  const pageLoad = { timeout: process.env.CI ? 30_000 : 10_000 };
  await page.goto(`/matches/${MATCH_ID}/report`);
  await expect(
    page.getByRole("heading", { name: "Match Events" }),
  ).toBeVisible(pageLoad);
  await page.getByRole("button", { name: /10' Goal/i }).click();
  await page.getByLabel("Minute").fill("12");
  await page.getByLabel("Event type").selectOption("yellow_card");
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();

  await expect(
    page.getByRole("button", { name: /12' Yellow Card/i }),
  ).toBeVisible();
  await expect(page.getByText("Manually adjusted")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /12' Yellow Card/i })).toBeVisible(pageLoad);
  await expect(page.getByText("Manually adjusted")).toBeVisible();
});
