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
  await page.getByRole("button", { name: "Open navigation menu" }).click();
  const mobileSidebar = page.locator("aside:visible");
  await expect(
    mobileSidebar.getByRole("navigation", { name: "Main navigation" }),
  ).toBeVisible();
  await mobileSidebar.getByRole("link", { name: "Events" }).click();

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

test("dashboard live match clock advances without a page refresh", async ({
  page,
}) => {
  await page.route("**/auth/session", (route) =>
    json(route, session("Test Coach", "Test FC", "test-coach")),
  );
  await page.route("**/api/dashboard", (route) =>
    json(route, {
      activeAthletesCount: 11,
      totalEventsCount: 0,
      upcomingEvents: [],
      liveMatch: {
        id: MATCH_ID,
        eventTitle: "Shared match",
        homeTeam: "Test FC",
        awayTeam: "Rivals FC",
        homeScore: 0,
        awayScore: 0,
        clockElapsedMs: 754000,
        clockStartedAt: new Date().toISOString(),
        elapsedMinutes: 12,
      },
    }),
  );

  await page.goto("/dashboard");
  const timer = page
    .getByLabel("Live match status")
    .locator(".text-muted-foreground")
    .first();
  const initial = await timer.textContent();
  await expect
    .poll(async () => (await timer.textContent()) !== initial)
    .toBe(true);
});

test("shared logger follows peer halves and clock corrections with an unchanged sheet timestamp", async ({ page }) => {
  const sessionId = "44444444-4444-4444-8444-444444444444";
  await mockAuthenticatedMatch(page, false, { sharedSessionId: sessionId, clockRevision: 0 });
  await page.route(`**/api/events/${EVENT_ID}/opponent-lineup`, route => json(route, {
    available: false, formation: null, starters: [], bench: [],
  }));
  await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
  let report = {
    sessionId, participants: [], score: { home: 1, away: 0 },
    clock: { period: "first_half", elapsedMs: 754000, startedAt: new Date().toISOString() as string | null,
      running: true, revision: 1 },
    finalStatus: "open", finalisedAt: null, confirmations: { home: null, away: null },
    timeline: [], reviews: [],
  };
  await page.route(`**/api/matches/sessions/${sessionId}/report`, route => json(route, report));
  await page.goto(`/matches/${MATCH_ID}/live`);
  const score = page.locator(".live-match-scoreline");
  const timer = page.locator(".live-match-score .tabular-nums").last();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole("region", { name: "Shared session result" })).toHaveCount(0);
  await expect(score).toHaveCount(1);

  report = { ...report, clock: { period: "half_time", elapsedMs: 2700000, startedAt: null,
    running: false, revision: 2 } };
  await expect(page.getByRole("dialog", { name: "Half time", exact: true })).toBeVisible({ timeout: 4000 });
  await expect(timer).toHaveText("45:00");

  report = { ...report, clock: { period: "second_half", elapsedMs: 2700000,
    startedAt: new Date().toISOString(), running: true, revision: 3 } };
  await expect(page.getByText("2ND HALF", { exact: true })).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole("dialog", { name: "Half time", exact: true })).toHaveCount(0);
  await expect(timer).toHaveText(/45:0[0-9]/);

  // A running-to-running correction must also replace the interval's origin.
  report = { ...report, score: { home: 2, away: 1 }, clock: { period: "second_half", elapsedMs: 3600000,
    startedAt: new Date().toISOString(), running: true, revision: 4 } };
  await expect(score).toHaveText(/2\s*-\s*1/, { timeout: 4000 });
  await expect(timer).toHaveText(/60:0[2-9]/, { timeout: 5000 });

  report = { ...report, finalStatus: "awaiting_confirmation", clock: { period: "full_time", elapsedMs: 5400000,
    startedAt: null, running: false, revision: 5 } };
  await expect(timer).toHaveText("90:00", { timeout: 4000 });
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(timer).toHaveText("90:00");
  await expect(score).toHaveText(/2\s*-\s*1/);
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

for (const requester of [true, false]) {
  test(`friendly event map retains referrers and attribution for the ${requester ? 'creating' : 'receiving'} coach`, async ({ page }) => {
    await page.route('**/auth/session', route => json(route, session('Coach', 'Own FC', 'viewer')));
    await page.route('**/api/**', route => json(route, []));
    await page.route('**/api/events', route => json(route, [{
      id:EVENT_ID, teamId:'team-viewer', title:'Shared friendly', type:'match', status:'scheduled', scheduledAt:new Date().toISOString(),
      location:'Test ground', venueAddress:null, notes:null, competitionId:null, competitionFixtureId:null,
      weatherLatitude:-26.2, weatherLongitude:28.04, weatherTimezone:'Africa/Johannesburg', weatherLocation:'Test ground',
      friendlyFixtureId:'friendly', friendlyFixtureStatus:'accepted', friendlyRequesterTeamId:requester ? 'team-viewer' : 'peer-team',
    }]));
    const referrers: string[] = [];
    await page.route('https://tile.openstreetmap.org/**', route => {
      referrers.push(route.request().headers().referer ?? '');
      return route.fulfill({contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dde7d0"/></svg>'});
    });
    // Reproduce a host that suppresses referrers by default. Each tile opts
    // into sending the app origin without exposing paths or query strings.
    await page.route(url => url.pathname === '/events', async route => {
      const response = await route.fetch();
      return route.fulfill({response, headers:{...response.headers(), 'referrer-policy':'no-referrer'}});
    });
    await page.goto('/events');
    await page.getByRole('button', {name:/Shared friendly, .*Show event summary/}).filter({visible:true}).click();
    await page.getByRole('button', {name:'View full details', exact:true}).filter({visible:true}).click();
    await expect(page.getByRole('link', {name:'© OpenStreetMap contributors', exact:true})).toBeVisible();
    await expect.poll(() => referrers.length).toBeGreaterThan(0);
    expect(referrers.every(referrer => referrer === new URL(page.url()).origin + '/')).toBe(true);
    await expect(page.getByRole('link', {name:'Open Test ground in Google Maps', exact:true})).toBeVisible();
  });
}

for (const isHome of [true, false]) {
  test(`shared pitch badges and peer formations render for the ${isHome ? "home" : "away"} coach`, async ({ page }, testInfo) => {
    const sessionId = "44444444-4444-4444-8444-444444444444";
    const slots = ['433-gk','433-lb','433-cb1','433-cb2','433-rb','433-cm1','433-cm2','433-cm3','433-lw','433-st','433-rw'];
    const squad = Array.from({ length: 18 }, (_, i) => ({ id: `own-${i}`, firstName: 'Own', lastName: `Player${i}`, squadNumber: i+1, position: i === 0 ? 'GK' : null, started: i < 11 }));
    await mockAuthenticatedMatch(page, false, { isHome, sharedSessionId: sessionId, clockRevision: 0 });
    await page.route(`**/api/matches/${MATCH_ID}/squad`, route => json(route, squad));
    await page.route(`**/api/events/${EVENT_ID}/opponent-lineup`, route => json(route, {
      available: true, formation: '4-3-3',
      starters: slots.map((slotId, i) => ({name: `Peer Player${i}`, shirtNumber: i+1, slotId})), bench: [],
    }));
    await page.route(`**/api/matches/${MATCH_ID}/events`, route => json(route, []));
    const ownSide = isHome ? 'home' : 'away';
    const opponentSide = isHome ? 'away' : 'home';
    const timeline: Record<string, unknown>[] = [ownSide, opponentSide].flatMap(side => ['goal', 'yellow_card'].map((eventType, index) => ({
      id: `${side}-${eventType}`, side, eventType, minute: index+1,
      createdAt: '2026-10-06T10:00:00Z', player: {name: `${side === ownSide ? 'Own' : 'Peer'} Player0`, shirtNumber:1},
    })));
    let report = {
      sessionId, participants: [], score: { home: 1, away: 1 },
      clock: { period: 'first_half', elapsedMs: 180000, startedAt: new Date().toISOString(), running: true, revision:1 },
      finalStatus:'open', finalisedAt:null, confirmations:{ home:null, away:null }, timeline, reviews:[],
    };
    await page.route(`**/api/matches/sessions/${sessionId}/report`, route => json(route, report));
    await page.goto(`/matches/${MATCH_ID}/live`);
    const pitch = page.locator('.live-match-pitch-area');
    await expect(pitch.locator('.live-squad-token')).toHaveCount(22, {timeout:20000});
    await expect(pitch.locator('[data-marker-badge="goal"]')).toHaveCount(2);
    await expect(pitch.locator('[data-marker-badge="card"]')).toHaveCount(2);
    const markers = pitch.locator('.live-pitch > div:last-child > div');
    const before = await markers.evaluateAll(elements => elements.map(element => element.getAttribute('style')));
    report = { ...report, timeline: [...timeline, {
      id:'tactical', side:opponentSide, eventType:'tactical_change', minute:3, createdAt:'2026-10-06T10:03:00Z',
      player:null, tacticalChange:{ formationId:'4-4-2' },
    }] };
    await expect.poll(async () => await markers.evaluateAll(elements => elements.map(element => element.getAttribute('style')))).not.toEqual(before);
    await expect(pitch.locator('.live-squad-token')).toHaveCount(22);
    await expect(pitch.locator('[data-marker-badge="goal"]')).toHaveCount(2);
    for (const [width, height] of [[1920,900], [1440,900], [1280,560], [1100,700], [900,700], [390,844], [320,740]]) {
      await page.setViewportSize({width, height});
      const panel = page.locator('.live-pitch-panel-landscape');
      if (width <= 1024) {
        await expect.poll(async () => {
          const box = await panel.boundingBox();
          return box ? box.width / box.height : 0;
        }).toBeCloseTo(105/68, 1);
      }
      const scoreBox = await page.locator('.live-match-score').boundingBox();
      if (width > 640) {
        expect(scoreBox!.y).toBeLessThan(24);
      } else {
        const dashboardBox = await page.getByRole('button', { name: 'Dashboard', exact: true }).boundingBox();
        expect(dashboardBox!.y + dashboardBox!.height).toBeLessThanOrEqual(scoreBox!.y);
        await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Half Time', exact: true }).locator('.live-match-control-short')).toBeVisible();
        await expect(page.getByRole('button', { name: 'End Match', exact: true }).locator('.live-match-control-short')).toBeVisible();
        const overlaps = await pitch.locator('.live-squad-token').evaluateAll(tokens => {
          const boxes = tokens.map(token => token.getBoundingClientRect());
          return boxes.some((box, i) => boxes.slice(i + 1).some(other =>
            box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top));
        });
        expect(overlaps).toBe(false);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (width > 1024) {
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
        const panelBox = await panel.boundingBox();
        const benchBox = await page.locator('.live-match-bench-area').boundingBox();
        const activityBox = await page.locator('.live-match-activity').boundingBox();
        const pitchAreaBox = await pitch.boundingBox();
        const labelBox = await page.locator('.live-match-tactical-label').boundingBox();
        const clockBox = await page.locator('.live-match-clock').boundingBox();
        expect(labelBox!.y + labelBox!.height / 2).toBeCloseTo(clockBox!.y + clockBox!.height / 2, 0);
        expect(panelBox!.width).toBeCloseTo(pitchAreaBox!.width, 0);
        expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(benchBox!.y);
        expect(benchBox!.y + benchBox!.height).toBeLessThanOrEqual(height);
        expect(activityBox!.y + activityBox!.height).toBeLessThanOrEqual(height);
      }
      if (width === 1440 || width === 390) await page.screenshot({path: testInfo.outputPath(`pitch-${width}.png`), fullPage:true});
    }
    await page.setViewportSize({ width: 1280, height: 560 });
    await pitch.locator('button.live-marker-hit').first().click();
    await page.getByRole('button', { name: 'Substitution', exact: true }).click();
    const callout = page.locator('.live-match-callout');
    await expect(callout).toBeVisible();
    const panelBox = await page.locator('.live-pitch-panel-landscape').boundingBox();
    const calloutBox = await callout.boundingBox();
    const benchBox = await page.locator('.live-match-bench-area').boundingBox();
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(calloutBox!.y);
    expect(calloutBox!.y + calloutBox!.height).toBeLessThanOrEqual(benchBox!.y);
    expect(benchBox!.y + benchBox!.height).toBeLessThanOrEqual(560);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  });
}

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

  await page.goto(`/matches/${MATCH_ID}/report`);
  await expect(
    page.getByRole("heading", { name: "Match Events" }),
  ).toBeVisible({ timeout: process.env.CI ? 30_000 : 10_000 });
  await page.getByRole("button", { name: /10' Goal/i }).click();
  await page.getByLabel("Minute").fill("12");
  await page.getByLabel("Event type").selectOption("yellow_card");
  await page.getByRole("button", { name: "SAVE CHANGES" }).click();

  await expect(
    page.getByRole("button", { name: /12' Yellow Card/i }),
  ).toBeVisible();
  await expect(page.getByText("Manually adjusted")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /12' Yellow Card/i })).toBeVisible();
  await expect(page.getByText("Manually adjusted")).toBeVisible();
});
