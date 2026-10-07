import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:4187";

export default defineConfig({
  testDir: "./frontend/e2e",
  testMatch: "regression-ui.spec.ts",
  timeout: 45_000,
  workers: 1,
  reporter: "list",
  use: { baseURL, serviceWorkers: "block", trace: "retain-on-failure" },
  projects: [{ name: "desktop-chromium", use: devices["Desktop Chrome"] }],
  webServer: {
    command: `${process.platform === "win32" ? "npm.cmd" : "npm"} --prefix frontend run preview -- --host 127.0.0.1 --port 4187 --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
