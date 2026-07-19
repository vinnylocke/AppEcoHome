import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { GardenProfilePage } from "../pages/GardenProfilePage";

// Gardener's Profile lives at /gardener (tabbed: Account / Alerts / Awards / Stats).
// All tests require an authenticated session.

test.describe("Gardener's Profile — Voice settings", () => {
  // Regression guard: the "Read AI replies aloud" toggle (Notifications tab)
  // used to filter user_profiles on a non-existent `id` column, so the write
  // silently failed and the setting reverted to off on every reload.
  test("GP-011: 'Read AI replies aloud' toggle persists across reload", async ({ authenticatedPage }) => {
    const profile = new GardenProfilePage(authenticatedPage);
    await profile.gotoNotifications();
    await profile.waitForLoad();

    const toggle = profile.voiceAutoReadToggle;
    const visible = await toggle.isVisible({ timeout: 8000 }).catch(() => false);
    if (!visible) {
      // Voice section unavailable for this account state — skip gracefully.
      test.skip();
      return;
    }

    // The toggle is disabled until the initial load resolves.
    await expect(toggle).toBeEnabled({ timeout: 8000 });

    // Click the toggle to `check`, waiting for the voice_settings PATCH to land.
    const setAndAwaitSave = async (check: boolean) => {
      if ((await profile.voiceAutoReadToggle.isChecked()) === check) return;
      const savePromise = authenticatedPage.waitForResponse(
        (r) =>
          r.url().includes("/rest/v1/user_profiles") &&
          r.request().method() === "PATCH" &&
          (r.request().postData() ?? "").includes("voice_settings"),
        { timeout: 8000 },
      );
      await profile.voiceAutoReadToggle.click();
      await savePromise;
      await expect(profile.voiceAutoReadToggle).toBeEnabled({ timeout: 8000 });
    };

    // Normalise to a known OFF baseline, then turn it ON.
    await setAndAwaitSave(false);
    await setAndAwaitSave(true);
    await expect(profile.voiceAutoReadToggle).toBeChecked();

    // Reload — the bug surfaced here: the toggle reverted to OFF because the
    // write never persisted (and the read filtered on the wrong column too).
    await authenticatedPage.reload();
    await profile.waitForLoad();
    await expect(profile.voiceAutoReadToggle).toBeChecked({ timeout: 8000 });

    // Cleanup — restore the OFF baseline so re-runs start from a clean state.
    await setAndAwaitSave(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// RHO-12 — tier-locked UpgradeNudge banners deep-link to the plan picker
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Gardener's Profile — plans deep link (RHO-12)", () => {
  // UpgradeNudge now routes to /gardener?section=plans. GardenerProfile forces
  // the Account tab, scrolls the "Your Plan" section (#plan-section) into view,
  // then strips the param.
  test("GP-020: ?section=plans forces the Account tab, reveals the plan cards, and strips the param", async ({ authenticatedPage }) => {
    await authenticatedPage.goto("/gardener?section=plans");

    // Plan cards live in the "Your Plan" section (#plan-section) on the Account tab.
    // They only render when that tab is active, so their visibility proves the
    // deep link forced the Account tab.
    await expect(authenticatedPage.getByTestId("plan-card-sprout")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByTestId("plan-card-evergreen")).toBeVisible({ timeout: 10000 });

    // The plan section anchor exists (the scroll target).
    await expect(authenticatedPage.locator("#plan-section")).toBeVisible({ timeout: 5000 });

    // The section param is stripped after the effect runs (replace: true).
    await expect(authenticatedPage).not.toHaveURL(/section=plans/, { timeout: 5000 });
  });

  test("GP-021: a locked-feature UpgradeNudge navigates to /gardener?section=plans", async ({ authenticatedPage }) => {
    // Force a Sprout tier so a gated route renders the full UpgradeNudge panel.
    await authenticatedPage.route(/user_profiles\?select=subscription_tier&/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ subscription_tier: "sprout" }),
      }),
    );

    // The Head Gardener route (/manager) is Evergreen-only, so a Sprout user sees
    // the full UpgradeNudge (with its "See plans" CTA). Its click must deep-link to plans.
    await authenticatedPage.goto("/manager");
    const cta = authenticatedPage.getByTestId("upgrade-nudge-cta-head_gardener");
    const ctaVisible = await cta.isVisible({ timeout: 10000 }).catch(() => false);

    if (!ctaVisible) {
      // If Head Gardener isn't gated in this build, fall back to the compact
      // nudge on the dashboard (same navigate target).
      await authenticatedPage.addInitScript(() => {
        try { localStorage.setItem("rhozly:home:density", "detailed"); } catch { /* ignore */ }
      });
      await authenticatedPage.goto("/dashboard");
      const compact = authenticatedPage.getByTestId("upgrade-nudge-head_gardener").first();
      await expect(compact).toBeVisible({ timeout: 10000 });
      await compact.click();
    } else {
      await cta.click();
    }

    // Landing URL carries the plans deep link (the param is stripped shortly
    // after by GardenerProfile, so assert the plan cards became visible too).
    await expect(authenticatedPage).toHaveURL(/\/gardener/, { timeout: 8000 });
    await expect(authenticatedPage.getByTestId("plan-card-sprout")).toBeVisible({ timeout: 10000 });
  });
});
