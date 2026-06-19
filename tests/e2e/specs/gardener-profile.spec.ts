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
