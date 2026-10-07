import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { FORMATIONS } from '../src/features/team-management/formations';
import { eq } from '../../backend/node_modules/drizzle-orm/index.cjs';
import { BACKEND_URL, FRONTEND_URL } from './utils/auth';
import { cleanupUsers, uniqueTestIdentity, verifyUserEmail, type TestIdentity } from '../../backend/test/utils/test-db';
import { createDatabaseClient } from '../../backend/src/database/drizzle';
import { athletes, competitionFixtures, competitionTeams, events, matches, matchSessions, teamMembers, user } from '../../backend/src/database/schema';

// This suite must use scripts/run-ui-tests.mjs, which selects TEST_DATABASE_URL.
test.beforeAll(() => {
  if (!process.env.TEST_DATABASE_URL || process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL) {
    throw new Error('Two-sided browser tests require the dedicated test database.');
  }
});

async function body(request: APIRequestContext, method: 'get' | 'post' | 'put' | 'patch', path: string, data?: unknown) {
  const response = await request[method](`${BACKEND_URL}${path}`, { data });
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(true);
  return response.json();
}

const scenarios = (['friendly', 'competition'] as const).flatMap((kind) =>
  (['home', 'away'] as const).map((firstConfirmation) => ({ kind, firstConfirmation })),
);
const verifyControls = process.env.TWO_SIDED_UI_INTERACTIONS === 'true';
const verifyClockControls = process.env.TWO_SIDED_UI_CLOCK_CONTROLS === 'true';

async function openReviews(page: Page) {
  await page.getByRole('button', { name: 'Match settings', exact: true }).click();
  await page.getByRole('button', { name: 'Review duplicates', exact: true }).click();
  return page.getByRole('dialog', { name: 'Event review', exact: true });
}
for (const { kind, firstConfirmation } of scenarios) {
  test(`two coaches see the same ${kind} session with ${firstConfirmation}-first confirmation`, async ({ browser }, testInfo) => {
    // The two real API accounts, fixture setup and exact-ID cleanup can take
    // over four minutes against the remote test database, even with passing UI assertions.
    test.setTimeout(360_000);
    test.skip(process.env.TWO_SIDED_LIVE_LOGGING_ENABLED !== 'true', 'Run with the controlled backend flag enabled.');
    const identities: TestIdentity[] = [];
    const contexts: BrowserContext[] = [];
    const sessionIds: string[] = [];
    const competitionIds: string[] = [];
    const database = createDatabaseClient();
    try {
      const coaches = [];
      for (const side of ['Home', 'Away', 'Outsider']) {
        const identity = uniqueTestIdentity(`release-browser-${kind}-${side.toLowerCase()}`);
        identities.push(identity);
        const context = await browser.newContext({ baseURL: FRONTEND_URL, serviceWorkers: 'block' });
        contexts.push(context);
        await body(context.request, 'post', '/auth/sign-up', { name: `${side} Coach`, email: identity.email, password: 'password123' });
        await verifyUserEmail(identity.email);
        const [verified] = await database.select({ emailVerified: user.emailVerified }).from(user).where(eq(user.email, identity.email));
        expect(verified, 'API registration must use the dedicated test database').toEqual({ emailVerified: true });
        await body(context.request, 'post', '/auth/sign-in', { email: identity.email, password: 'password123' });
        const { team } = await body(context.request, 'post', '/teams', { name: identity.teamName });
        const squad = await database.insert(athletes).values(Array.from({ length: 12 }, (_, i) => ({
          teamId: team.id, firstName: `${side}${i}`, lastName: 'Release Player', squadNumber: i + 1,
        }))).returning({ id: athletes.id });
        coaches.push({ context, team, squad, page: await context.newPage() });
      }
      const [home, away, outsider] = coaches;
      let homeEventId: string;
      let awayEventId: string;
      let competitionId: string | undefined;
      let fixtureId: string;
      if (kind === 'friendly') {
        const event = await body(home.context.request, 'post', '/events', {
          title: 'Release Friendly', type: 'match', scheduledAt: new Date().toISOString(),
          location: 'Release Ground', friendlyOpponentTeamId: away.team.id,
        });
        const accepted = await body(away.context.request, 'post', `/friendly-fixtures/${event.friendlyFixtureId}/accept`, {});
        homeEventId = event.id;
        awayEventId = accepted.event.id;
        fixtureId = event.friendlyFixtureId;
      } else {
        const competition = await body(home.context.request, 'post', '/competitions', {
          name: `Browser Release ${randomUUID()}`, type: 'league', format: 'league',
          configuredTeamCount: 2, startDate: '2027-01-01', allowedPlayingDays: [6],
        });
        competitionId = competition.id;
        competitionIds.push(competition.id);
        const slot = await body(home.context.request, 'post', `/competitions/${competitionId}/teams`, { displayName: away.team.name });
        await database.update(competitionTeams).set({ teamId: away.team.id }).where(eq(competitionTeams.id, slot.id));
        const [fixture] = await body(home.context.request, 'post', `/competitions/${competitionId}/fixtures/generate`, {});
        fixtureId = fixture.id;
        await database.update(competitionFixtures).set({ scheduledAt: new Date(Date.now() - 86400000) })
          .where(eq(competitionFixtures.id, fixture.id));
        await database.update(competitionFixtures).set({
          scheduleConfirmedAt: new Date(),
          homeScheduleResponse: 'external_confirmed', awayScheduleResponse: 'external_confirmed',
        }).where(eq(competitionFixtures.id, fixture.id));
        await database.update(events).set({ scheduledAt: new Date(Date.now() - 86400000) })
          .where(eq(events.competitionFixtureId, fixture.id));
        const fixtureEvents = await database.select().from(events).where(eq(events.competitionFixtureId, fixture.id));
        homeEventId = fixtureEvents.find((event) => event.teamId === home.team.id)!.id;
        awayEventId = fixtureEvents.find((event) => event.teamId === away.team.id)!.id;
      }
      for (const [coach, eventId, opponent] of [[home, homeEventId, away], [away, awayEventId, home]] as const) {
        await body(coach.context.request, 'put', `/events/${eventId}/lineup`, {
          startingAthleteIds: coach.squad.slice(0, 11).map((player) => player.id),
          benchAthleteIds: [coach.squad[11].id], formationId: '4-3-3',
          pitchAssignments: Object.fromEntries(FORMATIONS['4-3-3'].positions.map((slot, i) => [slot.id, coach.squad[i].id])),
        });
        const publicLineup = await body(opponent.context.request, 'get',
          `/events/${opponent === home ? homeEventId : awayEventId}/opponent-lineup`);
        expect(publicLineup).toMatchObject({ available: true, source: 'confirmed', formation: '4-3-3' });
        expect(publicLineup.starters).toHaveLength(11);
        expect(publicLineup.bench).toHaveLength(1);
        expect(Object.keys(publicLineup).sort()).toEqual(['available', 'bench', 'formation', 'source', 'starters']);
      }
      for (const [coach, eventId] of [[home, homeEventId], [away, awayEventId]] as const) {
        await coach.page.goto(`/events/${eventId}/confirm-squad`);
        const homeVenue = coach.page.getByRole('button', { name: 'Home', exact: true });
        const awayVenue = coach.page.getByRole('button', { name: 'Away', exact: true });
        await expect(homeVenue).toBeDisabled({ timeout: 20000 });
        await expect(awayVenue).toBeDisabled();
        await expect(homeVenue).toHaveAttribute('aria-pressed', coach === home ? 'true' : 'false');
        await expect(awayVenue).toHaveAttribute('aria-pressed', coach === away ? 'true' : 'false');
        await coach.page.goto(`/events/${eventId}/confirm-squad/opponent`);
        await expect(coach.page.getByRole('heading', { name: 'Opponent lineup', exact: true })).toBeVisible({ timeout: 20000 });
        await expect(coach.page.getByText('Confirmed lineup · read only')).toBeVisible({ timeout: 20000 });
      }
      if (verifyControls) {
        // Change the actual setup through controls, then revisit the peer view.
        await home.page.goto(`/events/${homeEventId}/confirm-squad`);
        await home.page.getByRole('button').filter({ hasText: 'Home10 Release Player' }).click();
        await home.page.getByRole('button').filter({ hasText: 'Home11 Release Player' }).click();
        await home.page.getByRole('button', { name: 'Update confirmed lineup', exact: true }).click();
        await expect(home.page.getByRole('button', { name: 'Lineup confirmed', exact: true })).toBeVisible({ timeout: 20000 });
        await away.page.reload();
        await expect(away.page.getByRole('heading', { name: 'Opponent lineup', exact: true })).toBeVisible({ timeout: 20000 });
        const starters = away.page.getByRole('heading', { name: 'Starters', exact: true }).locator('..');
        await expect(starters).toContainText('Home11 Release Player', { timeout: 20000 });
        await expect(starters).not.toContainText('Home10 Release Player');
        // Restore using the same controls so the original scenario stays comparable.
        await home.page.getByRole('button').filter({ hasText: 'Home11 Release Player' }).click();
        await home.page.getByRole('button').filter({ hasText: 'Home10 Release Player' }).click();
        await home.page.getByRole('button', { name: 'Update confirmed lineup', exact: true }).click();
        await expect(home.page.getByRole('button', { name: 'Lineup confirmed', exact: true })).toBeVisible({ timeout: 20000 });
      }
      const homeSheet = await body(home.context.request, 'post', `/events/${homeEventId}/start-match`, {
        opponentName: away.team.name, isHome: false, startingAthleteIds: home.squad.slice(0, 11).map((player) => player.id),
        benchAthleteIds: [home.squad[11].id], formationId: '4-3-3',
      });
      sessionIds.push(homeSheet.sharedMatchId);
      await home.page.goto(`/matches/${homeSheet.id}/live`);
      // The shared score is available before the opponent starts its sheet.
      await expect(home.page.locator('.live-match-scoreline')).toBeVisible({ timeout: 20000 });
      await expect(home.page.getByRole('region', { name: 'Shared session result' })).toHaveCount(0);
      const awaySheet = await body(away.context.request, 'post', `/events/${awayEventId}/start-match`, {
        opponentName: home.team.name, isHome: true, startingAthleteIds: away.squad.slice(0, 11).map((player) => player.id),
        benchAthleteIds: [away.squad[11].id], formationId: '4-3-3',
      });
      expect(homeSheet.id).not.toBe(awaySheet.id);
      expect(homeSheet.sharedMatchId).toBe(awaySheet.sharedMatchId);
      expect(homeSheet.sharedMatchId).toBeTruthy();
      const diagnostics = await Promise.all([
        body(home.context.request, 'get', `/events/${homeEventId}/link-diagnostic`),
        body(away.context.request, 'get', `/events/${awayEventId}/link-diagnostic`),
      ]);
      for (const [index, side] of ['home', 'away'].entries()) {
        expect(diagnostics[index]).toMatchObject({ fixtureId, participantSide: side,
          fixtureSharedSessionId: homeSheet.sharedMatchId, owningMatchSharedSessionId: homeSheet.sharedMatchId,
          sheetSessionMatchesFixture: true, status: 'correctly_linked' });
      }
      await testInfo.attach('fixture-identity', { body: JSON.stringify({ fixtureId, homeEventId, awayEventId,
        sheetIds: [homeSheet.id, awaySheet.id], sessionId: homeSheet.sharedMatchId, diagnostics }, null, 2), contentType: 'application/json' });
      await body(home.context.request, 'post', `/matches/${homeSheet.id}/events`, {
        clientRequestId: randomUUID(), team: 'own', eventType: 'goal', athleteId: home.squad[0].id,
        minute: 7, period: 'first_half', matchElapsedMs: 420000,
      });
      await body(away.context.request, 'post', `/matches/${awaySheet.id}/events`, {
        clientRequestId: randomUUID(), team: 'own', eventType: 'goal', athleteId: away.squad[0].id,
        minute: 17, period: 'first_half', matchElapsedMs: 1020000,
      });
      const reportUrl = `/matches/sessions/${homeSheet.sharedMatchId}/report`;
      if (verifyControls) {
        await away.page.goto(`/matches/${awaySheet.id}/live`);
        await home.page.getByRole('dialog', { name: 'Start game', exact: true }).getByRole('button', { name: 'START GAME', exact: true }).click();
        await expect(away.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 20000 });
        for (const viewport of [{ width: 1280, height: 540 }, { width: 390, height: 844 }]) {
          await home.page.setViewportSize(viewport);
          await expect(home.page.getByRole('button', { name: 'Match settings' })).toBeVisible();
          await home.page.getByRole('button', { name: '12 PLAYER', exact: true }).click();
          await expect(home.page.getByRole('button', { name: 'Substitution', exact: true })).toBeVisible();
          await home.page.getByRole('button', { name: 'Close event menu', exact: true }).click();
          const screenshotPath = testInfo.outputPath(`logger-${viewport.width}x${viewport.height}.png`);
          await home.page.screenshot({ fullPage: true, path: screenshotPath });
          await testInfo.attach(`logger-${viewport.width}x${viewport.height}`, { path: screenshotPath, contentType: 'image/png' });
          const fits = await home.page.evaluate(() => ['.live-match-score', '.live-pitch-panel', '.live-match-activity'].every((selector) => {
            const bounds = document.querySelector(selector)!.getBoundingClientRect();
            return bounds.left >= -1 && bounds.right <= window.innerWidth + 1;
          }));
          expect.soft(fits, 'Score, pitch and log fit the viewport without horizontal clipping').toBe(true);
        }
        await home.page.setViewportSize({ width: 1280, height: 720 });
        // Public opponent labels travel through the real queue/upload path.
        await Promise.all([
          away.page.getByRole('button', { name: '2 PLAYER', exact: true }).click(),
          home.page.getByRole('button', { name: '2 RELEASE PLAYER', exact: true }).click(),
        ]);
        // Submit together: candidates must be within the actual five-second
        // match-time window, regardless of slow database round trips.
        await Promise.all([home, away].map(coach => coach.page.getByRole('button', { name: 'Goal', exact: true }).click()));
        await Promise.all([home, away].map(coach => coach.page.getByRole('button', { name: 'NO ASSIST', exact: true }).click()));
        const homeReview = await openReviews(home.page);
        await expect(homeReview.getByRole('button', { name: 'Same event', exact: true })).toBeVisible({ timeout: 20000 });
        const awayReview = await openReviews(away.page);
        await expect(awayReview.getByRole('button', { name: 'Same event', exact: true })).toBeVisible({ timeout: 20000 });
        await homeReview.getByRole('button', { name: 'Same event', exact: true }).click();
        await expect(homeReview.getByText('No events need review.', { exact: true })).toBeVisible({ timeout: 20000 });
        await homeReview.getByRole('button', { name: 'Close', exact: true }).click();
        await awayReview.getByRole('button', { name: 'Close', exact: true }).click();
        const refreshedPeerReview = await openReviews(away.page);
        await expect(refreshedPeerReview).toContainText('same event', { timeout: 20000 });
        await refreshedPeerReview.getByRole('button', { name: 'Close', exact: true }).click();
        for (const coach of [home, away]) {
          await expect(coach.page.locator('.live-match-scoreline')).toHaveText(/2\s*-\s*1/, { timeout: 20000 });
        }
        await away.page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(home.page.getByRole('dialog', { name: 'Match paused', exact: true })).toBeVisible({ timeout: 20000 });
        await home.page.getByRole('dialog', { name: 'Match paused', exact: true }).getByRole('button').click();
        await expect(away.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 20000 });
        await home.page.getByRole('button', { name: 'Half Time', exact: true }).click();
        await home.page.getByRole('button', { name: 'YES, CONFIRM', exact: true }).click();
        await expect(away.page.getByRole('dialog', { name: 'Half time', exact: true })).toBeVisible({ timeout: 20000 });
        await away.page.getByRole('button', { name: 'START SECOND HALF', exact: true }).click();
        for (const coach of [home, away]) {
          await expect(coach.page.getByText('2ND HALF', { exact: true })).toBeVisible({ timeout: 20000 });
          await expect(coach.page.getByRole('dialog', { name: 'Half time', exact: true })).toHaveCount(0);
          await expect(coach.page.locator('.live-match-score .tabular-nums').last()).toHaveText(/45:[0-5]\d/);
        }
      } else {
        await body(away.context.request, 'post', `/matches/${awaySheet.id}/events`, {
          clientRequestId: randomUUID(), team: 'opponent', eventType: 'goal',
          opponentLabel: 'Home1 Release Player', minute: 27, period: 'first_half', matchElapsedMs: 1620000,
        });
      }
      const reportA = await body(home.context.request, 'get', reportUrl);
      const reportB = await body(away.context.request, 'get', reportUrl);
      expect(reportA).toEqual(reportB);
      expect(reportA.score).toEqual({ home: 2, away: 1 });
      expect(reportA.timeline).toHaveLength(3);
      expect((await outsider.context.request.get(`${BACKEND_URL}${reportUrl}`)).status()).toBe(404);
      if (!verifyControls) await body(home.context.request, 'patch', `/matches/${homeSheet.id}/clock`, {
        operationId: randomUUID(), baseRevision: 0, clientCreatedAt: new Date().toISOString(),
        period: 'first_half', running: false, elapsedMs: 420000,
      });
      await away.page.goto(`/matches/${awaySheet.id}/live`);
      await home.page.reload();
      for (const coach of [home, away]) {
        await expect(coach.page.locator('.live-match-scoreline')).toHaveText(/2\s*-\s*1/, { timeout: 20000 });
        await expect(coach.page.getByRole('region', { name: 'Shared session result' })).toHaveCount(0);
        await expect(coach.page.locator('.live-pitch-panel').getByRole('button')).toHaveCount(22);
      }
      if (!verifyControls && verifyClockControls) {
        await home.page.getByRole('dialog', { name: 'Match paused', exact: true }).getByRole('button').click();
        await expect(away.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 20000 });
        await away.page.getByRole('button', { name: 'Pause', exact: true }).click();
        await expect(home.page.getByRole('dialog', { name: 'Match paused', exact: true })).toBeVisible({ timeout: 20000 });
        await home.page.getByRole('dialog', { name: 'Match paused', exact: true }).getByRole('button').click();
        await expect(away.page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible({ timeout: 20000 });
        await home.page.getByRole('button', { name: 'Half Time', exact: true }).click();
        await home.page.getByRole('button', { name: 'YES, CONFIRM', exact: true }).click();
        await expect(away.page.getByRole('dialog', { name: 'Half time', exact: true })).toBeVisible({ timeout: 20000 });
        await away.page.getByRole('button', { name: 'START SECOND HALF', exact: true }).click();
        for (const coach of [home, away]) {
          await expect(coach.page.getByText('2ND HALF', { exact: true })).toBeVisible({ timeout: 20000 });
          await expect(coach.page.getByRole('dialog', { name: 'Half time', exact: true })).toHaveCount(0);
          await expect(coach.page.locator('.live-match-score .tabular-nums').last()).toHaveText(/45:[0-5]\d/);
        }
      } else if (!verifyControls) {
        for (const [coach, sheet, period, running, elapsedMs] of [
          [home, homeSheet, 'half_time', false, 2700000],
          [away, awaySheet, 'second_half', true, 2700000],
          [home, homeSheet, 'second_half', false, 2800000],
          [away, awaySheet, 'second_half', true, 2800000],
        ] as const) {
          const before = await body(coach.context.request, 'get', reportUrl);
          await body(coach.context.request, 'patch', `/matches/${sheet.id}/clock`, {
            operationId: randomUUID(), baseRevision: before.clock.revision,
            clientCreatedAt: new Date().toISOString(), period, running, elapsedMs,
          });
          for (const peer of [home, away]) {
            if (period === 'half_time') {
              await expect(peer.page.getByRole('dialog', { name: 'Half time', exact: true })).toBeVisible({ timeout: 20000 });
              await expect(peer.page.locator('.live-match-score .tabular-nums').last()).toHaveText('45:00');
              await expect(peer.page.getByRole('dialog', { name: 'Half time', exact: true })).toContainText('2');
            } else {
              await expect(peer.page.getByText('2ND HALF', { exact: true })).toBeVisible({ timeout: 20000 });
              await expect(peer.page.getByRole('dialog', { name: 'Half time', exact: true })).toHaveCount(0);
              await expect(peer.page.getByRole('button', { name: running ? 'Pause' : 'Resume', exact: true })).toBeVisible({ timeout: 20000 });
            }
          }
        }
      }
      expect((await body(home.context.request, 'get', reportUrl)).confirmations).toEqual({ home: null, away: null });
      const confirmationOrder = firstConfirmation === 'home' ? [home, away] : [away, home];
      for (const coach of [home, away]) {
        const sheet = coach === home ? homeSheet : awaySheet;
        await body(coach.context.request, 'post', `/matches/${sheet.id}/finish`, {});
      }
      for (const [index, coach] of confirmationOrder.entries()) {
        const sheet = coach === home ? homeSheet : awaySheet;
        const privateRead = await body(coach.context.request, 'get', `/matches/${sheet.id}`);
        await body(coach.context.request, 'post', `/matches/${sheet.id}/finalise`, {
          expectedRevision: privateRead.projection.revision,
        });
        const pending = await body(home.context.request, 'get', reportUrl);
        expect(pending.score).toEqual({ home: 2, away: 1 });
        if (index === 0) {
          expect(pending.finalStatus).toBe('awaiting_confirmation');
          expect(pending.confirmations[firstConfirmation]).toBeTruthy();
          expect(pending.confirmations[firstConfirmation === 'home' ? 'away' : 'home']).toBeNull();
          if (competitionId) expect((await body(home.context.request, 'get', `/competitions/${competitionId}`)).results).toHaveLength(0);
        }
      }
      for (const coach of [home, away]) {
        const sheet = coach === home ? homeSheet : awaySheet;
        await coach.page.goto(`/matches/${sheet.id}/report`);
        const status = coach.page.getByRole('region', { name: 'Shared session result' });
        await expect(status).toContainText('Final result', { timeout: 20000 });
        await expect(status).toContainText('Home confirmed');
        await expect(status).toContainText('Away confirmed');
        await expect(status).toContainText('Home 2');
        await expect(status).toContainText('1 Away');
        await coach.page.reload();
        await expect(status).toContainText('Final result', { timeout: 20000 });
      }
      if (competitionId) {
        const detail = await body(home.context.request, 'get', `/competitions/${competitionId}`);
        expect(detail.results).toHaveLength(1);
        expect(detail.standings.map((row: { played: number }) => row.played)).toEqual([1, 1]);
      }
      const session = await body(away.context.request, 'get', '/auth/session');
      await database.delete(teamMembers).where(eq(teamMembers.userId, session.user.id));
      expect((await away.context.request.get(`${BACKEND_URL}${reportUrl}`)).status()).toBe(403);
      await away.page.reload();
      await expect(away.page.getByRole('region', { name: 'Shared session result' })).toHaveCount(0);
    } finally {
      for (const context of contexts) await context.close().catch(() => undefined);
      // These test-owned sessions outlive cascading team-sheet cleanup.
      // Release their confirmation actor FKs before removing test accounts.
      for (const competitionId of competitionIds) {
        await database.update(competitionFixtures).set({ linkedMatchId: null })
          .where(eq(competitionFixtures.competitionId, competitionId));
      }
      for (const sessionId of sessionIds) {
        await database.update(matchSessions).set({ finalisedByUserId: null,
          homeConfirmedByUserId: null, awayConfirmedByUserId: null })
          .where(eq(matchSessions.id, sessionId));
        await database.delete(matches).where(eq(matches.sharedMatchId, sessionId));
      }
      for (const competitionId of competitionIds) {
        await database.delete(competitionFixtures).where(eq(competitionFixtures.competitionId, competitionId));
      }
      await cleanupUsers(identities, { concurrency: 1 });
      for (const sessionId of sessionIds) {
        await database.delete(matchSessions).where(eq(matchSessions.id, sessionId));
      }
    }
  });
}
