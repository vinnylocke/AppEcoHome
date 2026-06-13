import { test as base, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * `noHomeYetPage` — a Playwright fixture that signs the test user in, then
 * intercepts the `user_profiles` and `home_members` reads so the app
 * believes the account has no home yet. App.tsx then renders the
 * `<HomeSetup>` wizard, which is what the home-setup-* specs drive.
 *
 * The interception is purely a per-request route mock — the DB is not
 * mutated, so:
 *   - no clean-up between tests
 *   - safe to run in parallel across workers
 *   - the real seed data for `test{N}@rhozly.com` is untouched
 *
 * For the join-success path the spec also mocks the `home_members` INSERT
 * and the `user_profiles` UPDATE so the test asserts on UI behaviour without
 * mutating real rows in the joined home.
 */
type NoHomeFixtures = {
  noHomeYetPage: Page;
};

export const test = base.extend<NoHomeFixtures>({
  noHomeYetPage: async ({ page }, use) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";

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
      throw new Error(`Supabase sign-in failed for ${email}: ${error?.message}`);
    }

    const userId = data.session.user.id;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;

    // Short-circuit the auth re-validation so concurrent workers don't
    // saturate the local auth server.
    await page.route("**/auth/v1/user", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data.session.user),
      });
    });

    // Make every `user_profiles` read return a profile with home_id=null.
    // The other fields stay populated so persona/AI/etc. continue to work.
    await page.route(/\/rest\/v1\/user_profiles(\?|$)/, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uid: userId,
          home_id: null,
          display_name: "Test User",
          first_name: "Test",
          last_name: "User",
          subscription_tier: "sprout",
          ai_enabled: false,
          enable_perenual: false,
          is_admin: false,
          onboarding_state: { welcomed_at: new Date().toISOString() },
          can_view_audit: false,
          is_beta: false,
        }),
      });
    });

    // Make the `home_members` lookup return an empty list so the
    // membership-driven path also sees "no home yet".
    await page.route(/\/rest\/v1\/home_members(\?|$)/, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    });

    await page.addInitScript(
      ({ key, sessionJson }: { key: string; sessionJson: string }) => {
        localStorage.setItem(key, sessionJson);
      },
      { key: storageKey, sessionJson: JSON.stringify(data.session) },
    );

    await page.goto("/");

    // Wait for HomeSetup to mount.
    await page.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    await use(page);
  },
});

export { expect } from "@playwright/test";
