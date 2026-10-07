import { expect, test, type APIResponse } from '@playwright/test';
import { cleanupUser, uniqueTestIdentity } from '../../backend/test/utils/test-db';
import { BACKEND_URL, E2E_PASSWORD, registerVerifiedUser } from './utils/auth';

const NETWORK = { timeout: process.env.CI ? 60_000 : 30_000 };

async function expectApiOk(response: APIResponse, operation: string) {
  if (!response.ok()) {
    throw new Error(
      `${operation} failed (${response.status()}): ${await response.text()}`,
    );
  }
}

/** The 4-2-3-1 slots, in the order the squad below fills them. */
const SLOTS = [
  '4231-gk',
  '4231-lb',
  '4231-cb1',
  '4231-cb2',
  '4231-rb',
  '4231-cdm1',
  '4231-cdm2',
  '4231-lam',
  '4231-cam',
  '4231-ram',
  '4231-st',
];

const SQUAD = [
  ['Gary', 'Keeper', 'GK'],
  ['Lee', 'Back', 'LB'],
  ['Carl', 'Bakker', 'CB'],
  ['Cole', 'Benson', 'CB'],
  ['Ray', 'Burns', 'RB'],
  ['Desi', 'Moyo', 'CDM'],
  ['Dane', 'Ferris', 'CDM'],
  ['Luca', 'Amato', 'LAM'],
  ['Cam', 'Archer', 'CAM'],
  ['Rafa', 'Mendes', 'RAM'],
  ['Stan', 'Tucker', 'ST'],
];

/**
 * Player instructions through the real UI.
 *
 * Covers the whole loop a coach actually performs: open the tab, see the
 * cards their position is asked about, change two of them, save, reload, and
 * find the choices still there. Also checks that the cards follow the player
 * rather than the screen — a goalkeeper and a number ten are asked completely
 * different questions — and that a contradictory pair is flagged.
 *
 * The squad and the game plan are seeded through the API: this spec is about
 * the Instructions tab, not about drag-and-drop on the squad board.
 */
test('player instructions follow the selected player and survive a reload', async ({
  page,
  request,
}) => {
  test.setTimeout(process.env.CI ? 240_000 : 180_000);
  const { email, teamName } = uniqueTestIdentity('player-instructions-e2e');
  const coach = 'Instructions Coach';

  const sidebarLink = (name: string) =>
    page.getByLabel('Main navigation').getByRole('link', { name });

  /** A card, by the accessible name of its toggle ("<Category>: <option>"). */
  const card = (label: string) =>
    page.getByRole('button', { name: new RegExp(`^${label}: `) });

  /** The card's outer box — clicked at its centre, not on its toggle. */
  const cardBox = (label: string) => card(label).locator('xpath=..');

  try {
    await test.step('register the coach, squad and a full 4-2-3-1', async () => {
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
      await page.reload();
      await expect(sidebarLink('Team')).toBeVisible(NETWORK);

      const assignments: Record<string, string> = {};
      for (const [index, [firstName, lastName, position]] of SQUAD.entries()) {
        const created = await page
          .context()
          .request.post(`${BACKEND_URL}/athletes`, {
            data: { firstName, lastName, position, squadNumber: index + 1 },
          });
        await expectApiOk(created, `creation of ${firstName} ${lastName}`);
        assignments[SLOTS[index]] = ((await created.json()) as { id: string })
          .id;
      }

      await expectApiOk(
        await page.context().request.post(`${BACKEND_URL}/game-plans`, {
          data: { name: 'Matchday', formationId: '4-2-3-1', assignments },
        }),
        'game plan creation',
      );
    });

    await test.step('the tab opens on the goalkeeper with his own cards', async () => {
      await sidebarLink('Team').click();
      await expect(
        page.getByRole('heading', { name: 'Team Management' }),
      ).toBeVisible(NETWORK);

      await page.getByRole('tab', { name: 'Instructions' }).click();
      await expect(page).toHaveURL(/section=instructions/);

      // Defaults to the first player in the lineup — the goalkeeper.
      await expect(
        page.getByRole('heading', { name: 'Gary Keeper' }),
      ).toBeVisible(NETWORK);
      await expect(card('Starting Position')).toBeVisible();
      await expect(card('Distribution')).toBeVisible();
      await expect(card('Crosses')).toBeVisible();
      await expect(page.getByText('All defaults')).toBeVisible();

      // A goalkeeper is never asked an outfield question.
      await expect(card('Chance Creation')).toHaveCount(0);
    });

    await test.step('selecting the number ten swaps in his own cards', async () => {
      await page
        .getByRole('button', { name: /Edit instructions for: Archer/ })
        .click();

      await expect(
        page.getByRole('heading', { name: 'Cam Archer' }),
      ).toBeVisible();
      await expect(page.getByText('Attacking Midfielder · natural CAM')).toBeVisible();

      for (const label of [
        'Defensive Support',
        'Attacking Movement',
        'Positioning Freedom',
        'Chance Creation',
        'Defensive Positioning',
        'Box Presence',
      ]) {
        await expect(card(label)).toBeVisible();
      }
      await expect(card('Starting Position')).toHaveCount(0);
    });

    await test.step('changing two instructions marks them custom', async () => {
      await card('Positioning Freedom').click();
      await page.getByRole('radio', { name: 'Free Roam' }).click();
      await expect(card('Positioning Freedom')).toContainText('Free Roam');
      await expect(card('Positioning Freedom')).toContainText('Custom');

      await card('Defensive Support').click();
      await page.getByRole('radio', { name: 'Stay Forward' }).click();
      await expect(card('Defensive Support')).toContainText('Stay Forward');

      await expect(page.getByText('2 custom')).toBeVisible();
      // The summary line reads back what he has been asked to do.
      await expect(page.getByText(/Stays high/i)).toBeVisible();
    });

    await test.step('another card can be opened while one is already open', async () => {
      // Every card in a row stretches to the height of the open one, so the
      // whole card has to stay clickable — not just the top of it, which is
      // all the toggle covered until its click target filled the card.
      await card('Chance Creation').click();
      await expect(
        page.getByRole('radio', { name: 'Creative Playmaker' }),
      ).toBeVisible();

      // Positioning Freedom shares a row with Chance Creation, so it is the
      // one stretched by it. Clicking its middle must still open it.
      await cardBox('Positioning Freedom').click();
      await expect(
        page.getByRole('radio', { name: 'Find Pockets' }),
      ).toBeVisible();
      await expect(
        page.getByRole('radio', { name: 'Creative Playmaker' }),
      ).toHaveCount(0);
    });

    await test.step('the choices survive a save and a full reload', async () => {
      await page.getByRole('button', { name: /^Save$/ }).click();
      await expect(page.getByRole('button', { name: /Saved/ })).toBeVisible(
        NETWORK,
      );

      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Team Management' }),
      ).toBeVisible(NETWORK);
      await page
        .getByRole('button', { name: /Edit instructions for: Archer/ })
        .click();

      await expect(card('Positioning Freedom')).toContainText('Free Roam');
      await expect(card('Positioning Freedom')).toContainText('Custom');
      await expect(card('Defensive Support')).toContainText('Stay Forward');
      await expect(page.getByText('2 custom')).toBeVisible();
    });

    await test.step('contradictory instructions are flagged on a winger', async () => {
      await page
        .getByRole('button', { name: /Edit instructions for: Amato/ })
        .click();
      await expect(page.getByRole('heading', { name: 'Luca Amato' })).toBeVisible();

      await card('Width').click();
      await page.getByRole('radio', { name: 'Hold Width' }).click();
      await card('Final-Third Movement').click();
      await page.getByRole('radio', { name: 'Cut Inside' }).click();

      await expect(page.getByText(/opposite instructions/i)).toBeVisible();
    });

    await test.step('reset puts the player back on his defaults', async () => {
      await page
        .getByRole('button', { name: /Edit instructions for: Archer/ })
        .click();
      await page.getByRole('button', { name: 'Reset to Defaults' }).click();

      await expect(page.getByText('All defaults')).toBeVisible();
      await expect(card('Positioning Freedom')).toContainText(
        'Stick to Position',
      );
      await expect(card('Defensive Support')).toContainText(
        'Basic Defensive Support',
      );
    });
  } finally {
    await cleanupUser({ email, teamName });
  }
});
