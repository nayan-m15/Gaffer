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

const POSITIONS = [
  'GK',
  'LB',
  'CB',
  'CB',
  'RB',
  'CDM',
  'CDM',
  'LAM',
  'CAM',
  'RAM',
  'ST',
];

/**
 * Saving a change to an existing game plan from the Tactics tab.
 *
 * `injuredStarter` puts an injured player in the starting XI, which is the
 * state a real squad drifts into and which the squad board blocks saving in.
 */
async function setUp(
  page: import('@playwright/test').Page,
  request: import('@playwright/test').APIRequestContext,
  { injuredStarter }: { injuredStarter: boolean },
) {
  const identity = uniqueTestIdentity('tactics-save-e2e');
  await registerVerifiedUser(request, identity.email, 'Save Coach', E2E_PASSWORD);
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
  await page.reload();

  const assignments: Record<string, string> = {};
  for (const [index, position] of POSITIONS.entries()) {
    const created = await page.context().request.post(`${BACKEND_URL}/athletes`, {
      data: {
        firstName: `P${index}`,
        lastName: `Player${index}`,
        position,
        squadNumber: index + 1,
      },
    });
    await expectApiOk(created, `athlete ${index}`);
    assignments[SLOTS[index]] = ((await created.json()) as { id: string }).id;
  }

  await expectApiOk(
    await page.context().request.post(`${BACKEND_URL}/game-plans`, {
      data: { name: '4231', formationId: '4-2-3-1', assignments },
    }),
    'game plan creation',
  );

  if (injuredStarter) {
    // Injure a player who is already in the saved starting XI.
    await expectApiOk(
      await page.context().request.patch(
        `${BACKEND_URL}/athletes/${assignments['4231-st']}`,
        { data: { status: 'injured' } },
      ),
      'injuring the striker',
    );
  }

  return identity;
}

test('a tactics change saves to the existing game plan', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const identity = await setUp(page, request, { injuredStarter: false });

  try {
    await page.goto('/team?section=tactics');
    await expect(
      page.getByRole('heading', { name: 'Team Management' }),
    ).toBeVisible(NETWORK);

    await page.getByRole('combobox', { name: 'Defensive style' }).click();
    await page
      .getByRole('option', { name: 'Press after possession loss' })
      .click();

    const patched = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/game-plans\//.test(r.url()),
    );
    await page.getByRole('button', { name: /^Save$/ }).click();
    const response = await patched;
    expect(
      response.status(),
      `PATCH failed: ${await response.text()}`,
    ).toBe(200);

    await page.reload();
    await expect(
      page.getByRole('combobox', { name: 'Defensive style' }),
    ).toContainText(
      'Press after possession loss',
      NETWORK,
    );
  } finally {
    await cleanupUser(identity);
  }
});

test('an injured starter does not silently block saving tactics', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const identity = await setUp(page, request, { injuredStarter: true });

  try {
    await page.goto('/team?section=tactics');
    await expect(
      page.getByRole('heading', { name: 'Team Management' }),
    ).toBeVisible(NETWORK);

    await page.getByRole('combobox', { name: 'Defensive style' }).click();
    await page
      .getByRole('option', { name: 'Press after possession loss' })
      .click();

    await page.getByRole('button', { name: /^Save$/ }).click();

    // Either it saves or it says why it will not. Doing nothing at all is the
    // bug: the coach is left clicking a dead button with no feedback.
    await expect(page.getByRole('alert')).toContainText(/injured/i, NETWORK);
  } finally {
    await cleanupUser(identity);
  }
});
