import { defineConfig, devices } from '@playwright/test';

const backendURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const frontendPort = new URL(frontendURL).port || '5173';

/**
 * Full-stack e2e config — drives a real browser against the real Vite dev
 * server and the real Nest API (not mocked), matching how `npm run dev`
 * already runs both (see root package.json). Start dedicated test servers
 * so an existing development server cannot redirect tests to development data.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: 'pwa-production.spec.ts',
  // Full-stack flows perform several real database round trips. Shared CI
  // runners can take well over 90 seconds even when every assertion passes.
  timeout: process.env.CI ? 180_000 : 90_000,
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
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npm --prefix frontend run dev -- --port ${frontendPort}`,
      url: frontendURL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
