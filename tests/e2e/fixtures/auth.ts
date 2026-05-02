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

    const { access_token, refresh_token } = data.session;

    // Navigate to root first so localStorage is on the right origin
    await page.goto("/");

    // Inject session into localStorage exactly as the Supabase JS client expects it
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    await page.evaluate(
      ({ key, session }: { key: string; session: object }) => {
        localStorage.setItem(key, JSON.stringify(session));
      },
      { key: storageKey, session: data.session },
    );

    // Navigate to /dashboard so the app boots with the injected session.
    // page.goto waits for load, then we wait for the auth spinner to clear
    // before handing the page to tests.
    await page.goto("/dashboard");

    await page
      .locator(".animate-spin")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
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

    // Cleanup: local scope only — does not invalidate the server-side refresh token,
    // so other concurrently-running tests keep their sessions.
    await supabase.auth.signOut({ scope: "local" });
  },
});

export { expect } from "@playwright/test";
