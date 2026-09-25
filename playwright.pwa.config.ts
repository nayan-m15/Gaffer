import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pwa-production.spec.ts',
  outputDir: 'test-results/pwa',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: process.env.CI || process.env.UI_TEST_PRODUCTION === 'true'
      ? 'npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173 --strictPort'
      : 'npm --prefix frontend run build && npm --prefix frontend run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
