import { test as base, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Extend Playwright's base test with an `authenticatedPage` fixture.
// The fixture signs in via the Supabase API (no UI interaction) and injects
// the session into the browser's localStorage so tests start already logged in.
//
// Required environment variables (add to a local .env.test file or set in CI):
//   TEST_USER_PASSWORD — shared password for all worker accounts
//   VITE_SUPABASE_URL
//   VITE_SUPABASE_PUBLISHABLE_KEY
//
// The email is derived automatically from PLAYWRIGHT_WORKER_INDEX (0-based):
//   worker 0 → test1@rhozly.com, worker 1 → test2@rhozly.com, etc.
// Each worker account has its own isolated seed dataset — see scripts/seed-test-db.mjs.

type AuthFixtures = {
  authenticatedPage: Page;
};

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";

    // Derive per-worker email from Playwright's 0-based worker index.
    const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10);
    const email = `test${workerIndex + 1}@rhozly.com`;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error(
        "Missing required env vars for E2E auth: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY",
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      throw new Error(`Supabase sign-in failed: ${error?.message}`);
    }

    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;

    // The app's Supabase client (autoRefreshToken: true) fires GET /auth/v1/user
    // to validate the restored session on every page load. Under 4-worker parallel
    // load the local auth server can't keep up — requests time out and the SDK
    // drops to unauthenticated. Intercept that call and return the already-known
    // user so no auth validation hits the network at all.
    await page.route("**/auth/v1/user", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data.session.user),
      });
    });

    // Use addInitScript so the session is written to localStorage BEFORE React
    // (and the Supabase client) initialises on every navigation — eliminates the
    // race between localStorage write and the SDK's auth restoration step.
    await page.addInitScript(
      ({ key, sessionJson }: { key: string; sessionJson: string }) => {
        localStorage.setItem(key, sessionJson);
      },
      { key: storageKey, sessionJson: JSON.stringify(data.session) },
    );

    await page.goto("/dashboard");

    await page
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    await page
      .getByRole("button", { name: /sign out/i })
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => {});

    await page
      .waitForFunction(() => !document.body.innerText.includes("Select Home"), { timeout: 10000 })
      .catch(() => {});

    // Fail loudly if the session wasn't recognised so test errors are obvious.
    const stillOnAuth = await page
      .getByPlaceholder("hello@rhozly.com")
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    if (stillOnAuth) {
      throw new Error(
        "Auth fixture: session injection failed — app still shows the login form. " +
          "Check that local Supabase is running (`supabase start`) and that " +
          `${email} exists in the local auth.users table.`,
      );
    }

    await use(page);

    // No server-side signOut call — it POSTs to /auth/v1/logout under load and
    // contributes to the concurrent auth pressure that causes flakiness in the
    // next test's fixture setup. Each test calls signInWithPassword for a fresh
    // token, so cleanup is unnecessary for correctness.
  },
});

export { expect } from "@playwright/test";
