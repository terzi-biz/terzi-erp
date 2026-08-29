import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env["E2E_BASE_URL"] ?? "http://localhost:8080";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env["E2E_BASE_URL"]
    ? undefined
    : { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 },
});
