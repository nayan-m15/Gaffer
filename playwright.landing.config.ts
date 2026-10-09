import { defineConfig, devices } from '@playwright/test';

// Tests use route mocks, so no backend or database is needed.
export default defineConfig({
  testDir: './frontend/e2e',
  testMatch: ['landing-scene.spec.ts', 'landing-theme.spec.ts', 'stadium-scene.spec.ts', 'regression-ui.spec.ts', 'public-dashboard-carousel.spec.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4187',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [{ name: 'chromium', use: devices['Desktop Chrome'] }],
  webServer: {
    command: `${process.platform === 'win32' ? 'npm.cmd' : 'npm'} --prefix frontend run preview -- --host 127.0.0.1 --port 4187 --strictPort`,
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: !process.env.CI,
  },
});
