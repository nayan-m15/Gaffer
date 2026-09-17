import { defineConfig, devices } from '@playwright/test';

const backendURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const frontendPort = new URL(frontendURL).port || '5173';

/**
 * Full-stack e2e config — drives a real browser against the real Vite dev
 * server and the real Nest API (not mocked), matching how `npm run dev`
 * already runs both (see root package.json). If both dev servers are
 * already running locally, Playwright reuses them instead of starting a
 * second copy.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: process.env.CI ? 90_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never' }],
      ]
    : 'list',
  use: {
    baseURL: frontendURL,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: process.env.CI
        ? 'npm --prefix backend run start:prod'
        : 'npm --prefix backend run start:dev',
      url: `${backendURL}/health/database`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm --prefix frontend run dev -- --port ${frontendPort}`,
      url: frontendURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
