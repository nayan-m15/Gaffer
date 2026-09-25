import { defineConfig, devices } from '@playwright/test';

const backendURL = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
const frontendURL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
const frontendPort = new URL(frontendURL).port || '5173';
const production = !!process.env.CI || process.env.UI_TEST_PRODUCTION === 'true';

/**
 * Browser tests use the built application in CI to avoid per-page Vite
 * transforms on shared runners. Locally they default to development servers;
 * build first and set UI_TEST_PRODUCTION=true to reproduce CI serving locally.
 * Full-stack flows use the real Nest API; regression flows mock their APIs.
 * Start dedicated test servers
 * so an existing development server cannot redirect tests to development data.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: 'pwa-production.spec.ts',
  // Full-stack flows perform several real database round trips. Shared CI
  // runners can take well over 90 seconds even when every assertion passes.
  timeout: process.env.CI ? 180_000 : 90_000,
  // Bound the suite independently so CI still has time to run PWA checks and
  // upload diagnostics before the enclosing job deadline (.gitea/workflows/
  // test.yml). The suite has grown past what a single worker clears in 25
  // minutes even with every test passing, so this raises the budget instead.
  // Two workers were tried to cut wall-clock time, but several specs render a
  // real WebGL scene with software rendering (swiftshader) and drive a real
  // backend/DB — running two Chromium instances concurrently on a shared
  // runner starved both, turning normally-fast assertions (a plain reload)
  // into timeouts. One worker is slower but reliable.
  globalTimeout: process.env.CI ? 42 * 60_000 : undefined,
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
    // Route mocks must not be bypassed by the production service worker.
    // The separate PWA suite explicitly enables and tests that worker.
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: {
      args: [
        '--enable-webgl',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: production
        ? 'npm --prefix backend run start:prod'
        : 'npm --prefix backend run start:dev',
      url: `${backendURL}/health/database`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: production
        ? `npm --prefix frontend run preview -- --host localhost --port ${frontendPort} --strictPort`
        : `npm --prefix frontend run dev -- --port ${frontendPort} --strictPort`,
      url: frontendURL,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
