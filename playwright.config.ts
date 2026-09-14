import { defineConfig, devices } from '@playwright/test';

const backendURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';

/**
 * Full-stack e2e config — drives a real browser against the real Vite dev
 * server and the real Nest API (not mocked), matching how `npm run dev`
 * already runs both (see root package.json). If both dev servers are
 * already running locally, Playwright reuses them instead of starting a
 * second copy.
 */
export default defineConfig({
  testDir: './e2e',
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
    baseURL: 'http://localhost:5173',
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
        ? 'npm --prefix backend run start'
        : 'npm --prefix backend run start:dev',
      url: `${backendURL}/health/database`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm --prefix frontend run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
