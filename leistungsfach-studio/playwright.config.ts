import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Requires a production build first (`npm run test:e2e` does both).
const dbDir = mkdtempSync(path.join(tmpdir(), "studio-e2e-"));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3201", trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx next start -p 3201",
    url: "http://localhost:3201/api/health",
    reuseExistingServer: false,
    timeout: 120_000,
    env: { AI_PROVIDER: "mock", PGLITE_DIR: dbDir, ALLOW_NO_PASSWORD: "true", LOG_LEVEL: "silent" },
  },
});
