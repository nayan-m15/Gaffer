import { expect, test, type APIResponse } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../../backend/test/utils/test-db';
import { BACKEND_URL, E2E_PASSWORD, registerVerifiedUser } from './utils/auth';

const NETWORK = { timeout: process.env.CI ? 60_000 : 30_000 };

/** The phone the design mockup was drawn for. */
const PHONE = { width: 360, height: 800 };

async function expectApiOk(response: APIResponse, operation: string) {
  if (!response.ok()) {
    throw new Error(
      `${operation} failed (${response.status()}): ${await response.text()}`,
    );
  }
}

/**
 * The Team Management page on a phone.
 *
 * At 360px the wide-screen header put the title, the action buttons, a
 * four-tab strip and a bar of labelled selectors on four separate rows, which
 * left the pitch below the fold. The phone layout collapses that to a title
 * and one row — section, formation, options, Save — so this checks the row is
 * really one row, that nothing was dropped on the way, and that the pitch is
 * on screen without scrolling.
 */
test('the team page fits a phone in one row of controls', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const identity = uniqueTestIdentity('team-mobile-e2e');
  await page.setViewportSize(PHONE);

  try {
    await registerVerifiedUser(
      request,
      identity.email,
      'Mobile Coach',
      E2E_PASSWORD,
    );
    await page.goto('/login');
    await page.getByLabel('Email address').fill(identity.email);
    await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /sign in to dugout/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/, NETWORK);

    await expectApiOk(
      await page.context().request.post(`${BACKEND_URL}/teams`, {
        data: { name: identity.teamName },
      }),
      'team creation',
    );

    for (const [index, position] of [
      'GK',
      'LB',
      'CB',
      'CB',
      'RB',
      'CM',
      'CM',
      'CM',
      'LW',
      'ST',
      'RW',
    ].entries()) {
      await expectApiOk(
        await page.context().request.post(`${BACKEND_URL}/athletes`, {
          data: {
            firstName: `P${index}`,
            lastName: `Player${index}`,
            position,
            squadNumber: index + 1,
          },
        }),
        `athlete ${index}`,
      );
    }

    await page.goto('/team');
    await expect(
      page.getByRole('heading', { name: 'Team Management' }),
    ).toBeVisible(NETWORK);

    await test.step('the controls sit on one row and the tabs are gone', async () => {
      const sectionSelect = page.getByRole('combobox', { name: 'Team section' });
      const formation = page.getByRole('combobox', { name: 'Select formation' });
      const options = page.getByRole('button', { name: 'Game plan options' });
      const save = page.getByRole('button', { name: /^Save$/ });

      for (const control of [sectionSelect, formation, options, save]) {
        await expect(control).toBeVisible();
      }

      // The tab strip is a wide-screen affair; the dropdown replaces it.
      await expect(page.getByRole('tab', { name: 'Squad' })).toBeHidden();

      // One row: every control shares a vertical band.
      const boxes = await Promise.all(
        [sectionSelect, formation, options, save].map((c) => c.boundingBox()),
      );
      const tops = boxes.map((b) => b?.y ?? -1);
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(12);

      // And it stays inside the viewport.
      const right = Math.max(...boxes.map((b) => (b ? b.x + b.width : 0)));
      expect(right).toBeLessThanOrEqual(PHONE.width);

      // Nothing is clipped: each label fits the box it was given.
      for (const control of [sectionSelect, formation]) {
        const overflow = await control.evaluate((el) => {
          const value = el.querySelector('[data-slot="select-value"]');
          return value ? value.scrollWidth - value.clientWidth : 0;
        });
        expect(overflow).toBeLessThanOrEqual(1);
      }
    });

    await test.step('the pitch is on screen without scrolling', async () => {
      const pitch = page.getByRole('group', { name: 'Pitch positions' });
      const box = await pitch.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeLessThan(PHONE.height);
    });

    await test.step('the compact status strip reports the squad', async () => {
      await expect(page.getByText('0/11')).toBeVisible();
      // The figures carry a spelled-out name for screen readers.
      await expect(
        page.getByText('0 of 11 players on the pitch'),
      ).toBeAttached();
      await expect(page.getByText('11 substitutes')).toBeAttached();
    });

    await test.step('options hold everything the row had no space for', async () => {
      await page.getByRole('button', { name: 'Game plan options' }).click();
      await expect(
        page.getByRole('combobox', { name: 'Select game plan' }),
      ).toBeVisible();
      await expect(
        page.getByRole('combobox', { name: 'Select match format' }),
      ).toBeVisible();
      await expect(page.getByRole('switch', { name: 'Auto-fill' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Reset lineup' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    });

    await test.step('the dropdown switches section', async () => {
      await page.getByRole('combobox', { name: 'Team section' }).click();
      await page.getByRole('option', { name: 'Tactics' }).click();
      await expect(page).toHaveURL(/section=tactics/);
      await expect(
        page.getByRole('combobox', { name: 'Defensive style' }),
      ).toBeVisible(NETWORK);

      // The formation select belongs to the squad board only.
      await expect(
        page.getByRole('combobox', { name: 'Select formation' }),
      ).toBeHidden();

      // The longest name only has to fit once the formation select is gone.
      await page.getByRole('combobox', { name: 'Team section' }).click();
      await page.getByRole('option', { name: 'Instructions' }).click();
      await expect(page).toHaveURL(/section=instructions/);
      const clipped = await page
        .getByRole('combobox', { name: 'Team section' })
        .evaluate((el) => {
          const value = el.querySelector('[data-slot="select-value"]');
          return value ? value.scrollWidth - value.clientWidth : 0;
        });
      expect(clipped).toBeLessThanOrEqual(1);

      await page.getByRole('combobox', { name: 'Team section' }).click();
      await page.getByRole('option', { name: 'Squad' }).click();
      await expect(page).toHaveURL(/\/team$/);
    });

    await page.screenshot({
      path: process.env.TEAM_MOBILE_SHOT ?? 'team-mobile.png',
      fullPage: false,
    });
  } finally {
    await cleanupUser(identity);
  }
});
