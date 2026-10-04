import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
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

for (const kind of ['friendly', 'competition'] as const) {
  test(`two coaches see the same ${kind} session in real browsers`, async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
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
        const squad = await database.insert(athletes).values(Array.from({ length: 11 }, (_, i) => ({
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
      const homeSheet = await body(home.context.request, 'post', `/events/${homeEventId}/start-match`, {
        opponentName: away.team.name, isHome: false, startingAthleteIds: home.squad.map((player) => player.id),
      });
      sessionIds.push(homeSheet.sharedMatchId);
      await home.page.goto(`/matches/${homeSheet.id}/live`);
      // Session status is required even before the opponent publishes a lineup.
      await expect(home.page.getByRole('region', { name: 'Shared session result' })).toBeVisible({ timeout: 20000 });
      const awaySheet = await body(away.context.request, 'post', `/events/${awayEventId}/start-match`, {
        opponentName: home.team.name, isHome: true, startingAthleteIds: away.squad.map((player) => player.id),
      });
      expect(homeSheet.id).not.toBe(awaySheet.id);
      expect(homeSheet.sharedMatchId).toBe(awaySheet.sharedMatchId);
      expect(homeSheet.sharedMatchId).toBeTruthy();
      const diagnostics = await Promise.all([
        body(home.context.request, 'get', `/events/${homeEventId}/link-diagnostic`),
        body(away.context.request, 'get', `/events/${awayEventId}/link-diagnostic`),
      ]);
      await testInfo.attach('fixture-identity', { body: JSON.stringify({ fixtureId, homeEventId, awayEventId,
        sheetIds: [homeSheet.id, awaySheet.id], sessionId: homeSheet.sharedMatchId, diagnostics }, null, 2), contentType: 'application/json' });
      await body(home.context.request, 'post', `/matches/${homeSheet.id}/events`, {
        clientRequestId: randomUUID(), team: 'own', eventType: 'goal', athleteId: home.squad[0].id,
        minute: 7, period: 'first_half', matchElapsedMs: 420000,
      });
      const reportUrl = `/matches/sessions/${homeSheet.sharedMatchId}/report`;
      const reportA = await body(home.context.request, 'get', reportUrl);
      const reportB = await body(away.context.request, 'get', reportUrl);
      expect(reportA).toEqual(reportB);
      expect(reportA.score).toEqual({ home: 1, away: 0 });
      expect((await outsider.context.request.get(`${BACKEND_URL}${reportUrl}`)).status()).toBe(404);
      await body(home.context.request, 'patch', `/matches/${homeSheet.id}/clock`, {
        operationId: randomUUID(), baseRevision: 0, clientCreatedAt: new Date().toISOString(),
        period: 'first_half', running: false, elapsedMs: 420000,
      });
      await away.page.goto(`/matches/${awaySheet.id}/live`);
      await home.page.reload();
      for (const coach of [home, away]) {
        const status = coach.page.getByRole('region', { name: 'Shared session result' });
        await expect(status).toContainText('Home 1', { timeout: 20000 });
        await expect(status).toContainText('0 Away');
        await expect(status).toContainText('unconfirmed');
      }
      for (const coach of [home, away]) {
        const sheet = coach === home ? homeSheet : awaySheet;
        await body(coach.context.request, 'post', `/matches/${sheet.id}/finish`, {});
      }
      for (const coach of [home, away]) {
        const sheet = coach === home ? homeSheet : awaySheet;
        const privateRead = await body(coach.context.request, 'get', `/matches/${sheet.id}`);
        await body(coach.context.request, 'post', `/matches/${sheet.id}/finalise`, {
          expectedRevision: privateRead.projection.revision,
        });
      }
      for (const coach of [home, away]) {
        const sheet = coach === home ? homeSheet : awaySheet;
        await coach.page.goto(`/matches/${sheet.id}/report`);
        const status = coach.page.getByRole('region', { name: 'Shared session result' });
        await expect(status).toContainText('Final result', { timeout: 20000 });
        await expect(status).toContainText('Home confirmed');
        await expect(status).toContainText('Away confirmed');
        await expect(status).toContainText('Home 1');
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
      for (const context of contexts) await context.close();
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
    }
  });
}
