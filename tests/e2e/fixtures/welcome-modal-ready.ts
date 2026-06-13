import { test as base, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * `welcomeModalReadyPage` — signs the user in, then mocks the data
 * shape that triggers the first-run WelcomeModal in App.tsx:
 *
 *   1) profile.home_id is present (so HomeSetup doesn't render)
 *   2) onboarding_state["welcome_modal"] is absent
 *   3) locations.length === 0
 *
 * The real seed has locations and (eventually) onboarding state, so we
 * intercept the relevant REST queries instead of mutating the DB.
 *
 * The fixture also stubs the PATCH /user_profiles call that the modal
 * issues when the user finishes, so completion doesn't try to persist a
 * `persona` field that may not exist in older DB snapshots.
 */
type WelcomeFixtures = {
  welcomeModalReadyPage: Page;
};

const SEED_HOME_ID = "00000000-0000-0000-0000-000000000002";

export const test = base.extend<WelcomeFixtures>({
  welcomeModalReadyPage: async ({ page }, use) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const password = process.env.TEST_USER_PASSWORD ?? "TestPassword123!";

    const workerIndex = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10);
    const email = `test${workerIndex + 1}@rhozly.com`;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error(`Supabase sign-in failed for ${email}: ${error?.message}`);
    }

    const userId = data.session.user.id;
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;

    await page.route("**/auth/v1/user", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(data.session.user),
      });
    });

    // Profile with home_id set + empty onboarding_state so the modal trigger fires.
    await page.route(/\/rest\/v1\/user_profiles(\?|$)/, async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            uid: userId,
            home_id: SEED_HOME_ID,
            display_name: "Test User",
            first_name: "Test",
            last_name: "User",
            subscription_tier: "sprout",
            ai_enabled: false,
            enable_perenual: false,
            is_admin: false,
            // welcome_modal absent → triggers the WelcomeModal under test.
            // Mark the Shepherd-driven tour flows as dismissed so they don't
            // render an overlay that intercepts pointer events on top of our
            // modal (the tour overlay is a sibling portal, not inside the
            // modal's focus trap).
            onboarding_state: {
              global_welcome: "dismissed",
              home_setup_tips: "dismissed",
            },
            can_view_audit: false,
            is_beta: false,
          }),
        });
      }
      // Swallow the PATCH the modal fires so we don't mutate real data.
      if (req.method() === "PATCH") {
        return route.fulfill({ status: 204, contentType: "application/json", body: "" });
      }
      return route.fallback();
    });

    // Force locations to be empty so the trigger condition `locations.length === 0` holds.
    await page.route(/\/rest\/v1\/locations(\?|$)/, (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await page.addInitScript(
      ({ key, sessionJson }: { key: string; sessionJson: string }) => {
        localStorage.setItem(key, sessionJson);
      },
      { key: storageKey, sessionJson: JSON.stringify(data.session) },
    );

    await page.goto("/");
    await page.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    await use(page);
  },
});

export { expect } from "@playwright/test";
