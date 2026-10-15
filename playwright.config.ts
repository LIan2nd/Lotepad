import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    channel: "chromium",
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 1366, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm.cmd run preview -- --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
  workers: 1,
});
