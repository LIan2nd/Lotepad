import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/dev",
  outputDir: "artifacts/dev-tests",
  timeout: 60000,
  use: {
    channel: "chromium",
    baseURL: "http://127.0.0.1:1420",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm.cmd run dev:desktop",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
  },
  workers: 1,
});
