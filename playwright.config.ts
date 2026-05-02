import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.test so TEST_USER_EMAIL / TEST_USER_PASSWORD are available to test workers.
// Using `override: true` semantics so .env.test always wins over any shell-set vars.
try {
  const raw = readFileSync(resolve(".env.test"), "utf-8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([^#\s][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
} catch {
  // .env.test absent — caller must supply env vars another way
}

export default defineConfig({
  testDir: "tests/e2e/specs",
  fullyParallel: false,
  workers: process.env.CI ? 2 : 4,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
