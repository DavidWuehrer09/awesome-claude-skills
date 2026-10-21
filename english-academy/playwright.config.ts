import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const chromium = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"].find((p) => existsSync(p));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: chromium ? { executablePath: chromium } : undefined,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    { name: "iphone", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" }, testMatch: /mobile\.spec\.ts/ },
    // Tablet layout (iPad size and touch); runs the same small-screen checks.
    { name: "ipad", use: { ...devices["iPad Pro 11"], defaultBrowserType: "chromium" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    // Requires `next build` first (npm run test:e2e does both).
    command: `rm -rf .data/e2e && next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { DATABASE_URL: "pglite:.data/e2e", AI_PROVIDER: "demo", APP_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e!", INSECURE_COOKIES: "true", SIGNUP_RATE_LIMIT: "1000" },
  },
});
