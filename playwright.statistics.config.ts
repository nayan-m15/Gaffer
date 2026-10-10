import { defineConfig } from "@playwright/test";
import regression from "./playwright.regression.config";

export default defineConfig({
  ...regression,
  testMatch: "statistics-report.spec.ts",
  webServer: {
    ...regression.webServer!,
    reuseExistingServer: process.env.REPORT_TEST_REUSE_SERVER === "1",
  },
});
