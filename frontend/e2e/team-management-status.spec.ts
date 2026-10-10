import { expect, test, type APIResponse } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../../backend/test/utils/test-db';
import {
  BACKEND_URL,
  E2E_PASSWORD,
  registerVerifiedUser,
} from './utils/auth';

const NETWORK = { timeout: process.env.CI ? 60_000 : 30_000 };

async function expectApiOk(response: APIResponse, operation: string) {
  if (!response.ok()) {
    throw new Error(
      `${operation} failed (${response.status()}): ${await response.text()}`,
    );
  }
}

/**
 * Athlete-status integration with Team Management, through the real UI.
 *
 * Sign-up requires email verification, so the verification token is minted
 * the same way Better Auth does — an HS256 JWT over { email } signed with
 * the auth secret — and redeemed through the real /auth/verify-email
 * endpoint before signing in.
 *
 * Covers: bench cards show each athlete's persisted status (Available /
 * Injured / Suspended, reusing the roster's StatusBadge), the status-bar
 * availability chips, auto-fill keeping unavailable players on the bench,
 * and a Roster status edit being reflected in Team Management through the
 * shared athletes query cache (plus persistence across a full reload).
 */
test('team management reflects athlete status badges and roster edits', async ({
  page,
  request,
}) => {
  test.setTimeout(process.env.CI ? 240_000 : 180_000);
  const { email, teamName } = uniqueTestIdentity('tm-status-e2e');
  const coach = 'TM Status Coach';

  // The app shell also renders a footer nav (development change); scope
  // navigation to the sidebar so link locators stay unambiguous in strict
  // mode.
  const sidebarLink = (name: string) =>
    page.getByLabel('Main navigation').getByRole('link', { name });

  try {
    await test.step('register the coach and seed team athletes', async () => {
      // This spec focuses on status rendering and edits. Seed its base fixture
      // through the API so browser setup does not dominate shard runtime.
      await registerVerifiedUser(request, email, coach, E2E_PASSWORD);
      await page.goto('/login');
      await page.getByLabel('Email address').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
      await page.getByRole('button', { name: /sign in to dugout/i }).click();
      await expect(page).toHaveURL(/\/dashboard$/, NETWORK);

      await expectApiOk(
        await page.context().request.post(`${BACKEND_URL}/teams`, {
          data: { name: teamName },
        }),
        'team creation',
      );

      // The dashboard already fetched "no team yet" on first load, and
      // creating the team via the API (instead of through the UI's own
      // create-team dialog) doesn't invalidate that cache. Reload so the
      // sidebar picks up the new team instead of staying on its
      // "Add a team first" placeholders.
      await page.reload();
      await expect(
        page.getByLabel('Main navigation').getByRole('link', { name: 'Team' }),
      ).toBeVisible(NETWORK);

      const athletes = [
        { firstName: 'Domi', lastName: 'Available', status: 'available' },
        { firstName: 'Ines', lastName: 'Injured', status: 'injured' },
        { firstName: 'Suri', lastName: 'Suspended', status: 'suspended' },
      ];
      for (const [index, athlete] of athletes.entries()) {
        await expectApiOk(
          await page.context().request.post(`${BACKEND_URL}/athletes`, {
            data: {
              ...athlete,
              position: ['ST', 'CM', 'GK'][index],
              squadNumber: index + 9,
            },
          }),
          `creation of ${athlete.firstName} ${athlete.lastName}`,
        );
      }
    });
    await test.step('team management bench shows each status badge', async () => {
      await sidebarLink('Team').click();
      await expect(page).toHaveURL(/\/team$/);
      await expect(
        page.getByRole('heading', { name: 'Team Management' }),
      ).toBeVisible(NETWORK);

      const bench = page.getByRole('region', { name: 'Substitute players' });

      // All three start on the bench with their real status badges (the
      // badge text is the roster's display label inside the card).
      const domiCard = bench.getByRole('button', { name: /Domi Available —/ });
      const inesCard = bench.getByLabel(/Ines Injured —/);
      const suriCard = bench.getByRole('button', { name: /Suri Suspended —/ });
      await expect(domiCard).toBeVisible();
      await expect(inesCard).toBeVisible();
      await expect(suriCard).toBeVisible();
      await expect(inesCard.getByText('Injured', { exact: true })).toBeVisible();
      await expect(suriCard.getByText('Suspended', { exact: true })).toBeVisible();

      // Status bar chips surface the unavailable counts.
      await expect(page.getByText('Injured: 1')).toBeVisible();
      await expect(page.getByText('Suspended: 1')).toBeVisible();
    });

    await test.step('squad controls align on desktop and retain tablet stacking', async () => {
      const selector = page.getByRole('combobox', { name: 'Select game plan' })
        .locator('xpath=ancestor::div[contains(@class,"bg-card")][1]');
      const status = page.getByText(/^On Pitch:/).locator('..');
      const warning = page.getByText(/Need at least 11 players/).locator('..');
      const pitch = page.getByRole('group', { name: 'Pitch positions' });

      await page.setViewportSize({ width: 1280, height: 900 });
      const [desktopSelector, desktopStatus, desktopWarning, desktopPitch] =
        await Promise.all([
          selector.boundingBox(), status.boundingBox(),
          warning.boundingBox(), pitch.boundingBox(),
        ]);
      expect(desktopSelector && desktopStatus && desktopWarning && desktopPitch).toBeTruthy();
      expect(desktopStatus!.x).toBeGreaterThanOrEqual(desktopSelector!.x + desktopSelector!.width - 1);
      expect(Math.abs(desktopStatus!.y - desktopSelector!.y)).toBeLessThan(2);
      expect(desktopWarning!.y).toBeGreaterThan(desktopStatus!.y + desktopStatus!.height);
      expect(desktopPitch!.y).toBeGreaterThan(desktopWarning!.y + desktopWarning!.height);

      await page.locator('html').evaluate((element) => element.classList.remove('dark'));
      const lightCard = await status.evaluate((element) => getComputedStyle(element).backgroundColor);
      await page.locator('html').evaluate((element) => element.classList.add('dark'));
      const darkCard = await status.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(darkCard).not.toBe(lightCard);

      await page.setViewportSize({ width: 1024, height: 900 });
      const [tabletSelector, tabletStatus] = await Promise.all([
        selector.boundingBox(), status.boundingBox(),
      ]);
      expect(tabletSelector && tabletStatus).toBeTruthy();
      expect(tabletStatus!.y).toBeGreaterThan(tabletSelector!.y + tabletSelector!.height);
      await page.setViewportSize({ width: 1280, height: 900 });
    });

    await test.step('auto-fill keeps unavailable players off the pitch', async () => {
      await page.getByRole('switch', { name: /auto-fill/i }).click();

      const pitch = page.getByRole('group', { name: 'Pitch positions' });
      await expect(
        pitch.getByRole('button', { name: /Ines.*Injured/ }),
      ).toHaveCount(0);
      await expect(
        pitch.getByRole('button', { name: /Suri.*Suspended/ }),
      ).toHaveCount(0);
      // The available player is placed somewhere on the pitch (GK).
      await expect(
        pitch.getByRole('button', { name: /Domi Available/ }),
      ).toBeVisible();

      // Unavailable players stay badged on the bench.
      const bench = page.getByRole('region', { name: 'Substitute players' });
      const inesCard = bench.getByLabel(/Ines Injured —/);
      await expect(inesCard).toBeVisible();
      await expect(inesCard.getByText('Injured', { exact: true })).toBeVisible();
      await expect(
        bench.getByRole('button', { name: /Suri Suspended —/ }),
      ).toBeVisible();
    });

    await test.step('roster status edit is reflected in team management', async () => {
      // Change Ines Injured → Available in the Roster.
      await sidebarLink('Roster').click();
      await page
        .getByRole('button', { name: `Edit Ines Injured` })
        .click();
      const dialog = page.getByRole('dialog', { name: 'Edit Athlete' });
      await dialog.getByLabel('Status').selectOption('available');
      await dialog.getByRole('button', { name: 'Save Changes' }).click();
      await expect(dialog).toBeHidden();

      // Navigate to Team Management — the same shared athletes cache was
      // invalidated, so the bench badge updates without a hard reload. That
      // update rides on a background refetch against the real database
      // though, so it needs the same network-round-trip allowance as the
      // rest of this spec's data-dependent assertions, not the default
      // expect timeout.
      await sidebarLink('Team').click();
      const bench = page.getByRole('region', { name: 'Substitute players' });
      const inesCard = bench.getByRole('button', { name: /Ines Injured —/ });
      await expect(inesCard).toBeVisible(NETWORK);
      await expect(
        inesCard.getByText('Available', { exact: true }),
      ).toBeVisible(NETWORK);
      await expect(inesCard.getByText('Injured', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Injured: 1')).toHaveCount(0);
    });

    await test.step('a full reload still shows the persisted statuses', async () => {
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Team Management' }),
      ).toBeVisible(NETWORK);
      const bench = page.getByRole('region', { name: 'Substitute players' });
      const inesCard = bench.getByRole('button', { name: /Ines Injured —/ });
      await expect(inesCard).toBeVisible(NETWORK);
      await expect(
        inesCard.getByText('Available', { exact: true }),
      ).toBeVisible(NETWORK);
      await expect(
        bench.getByRole('button', { name: /Suri Suspended —/ }),
      ).toBeVisible(NETWORK);
      await expect(page.getByText('Suspended: 1')).toBeVisible(NETWORK);
    });
  } finally {
    await cleanupUser({ email, teamName });
  }
});
