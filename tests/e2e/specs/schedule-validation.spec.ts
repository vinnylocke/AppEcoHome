import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { SchedulePage } from "../pages/SchedulePage";

// ─────────────────────────────────────────────────────────────────────────
// schedule-validation.spec.ts
//
// Catalogue PR 6 — schedule/blueprint manager edge cases not covered by
// the existing schedule.spec.ts (26 tests). Targets the filter location/
// area cascade and the pause-blueprint UI surface.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Schedule — validation + filter cascade + pause UI", () => {
  test("SCH-V-001: new-blueprint frequency input enforces min=1 (UI guard against 0)", async ({
    authenticatedPage,
  }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.newAutomationButton.click();

    // The frequency input has min="1" — UI prevents the user from
    // submitting a 0 frequency. Source coerces `parseInt(v) || 1` as a
    // double-check, so the min attribute is the user-visible guard.
    const frequency = authenticatedPage
      .locator('input[type="number"][min="1"]')
      .first();
    await expect(frequency).toBeVisible({ timeout: 8000 });
    await expect(frequency).toHaveAttribute("min", "1");
  });

  test("SCH-V-002: filter Location → Area cascade — Area is enabled when a real Location is chosen", async ({
    authenticatedPage,
  }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.filtersButton.click();

    const location = authenticatedPage.locator(
      '[data-testid="schedule-filter-location"]',
    );
    const area = authenticatedPage.locator(
      '[data-testid="schedule-filter-area"]',
    );
    await expect(location).toBeVisible({ timeout: 8000 });
    await expect(area).toBeVisible();

    // Pick a real location (not "all" or "none") — Area select stays enabled.
    const optionValues = await location.locator("option").evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value),
    );
    const realLoc = optionValues.find((v) => v !== "all" && v !== "none");
    if (!realLoc) {
      test.skip(true, "No real location options to test against");
      return;
    }
    await location.selectOption(realLoc);
    await expect(area).toBeEnabled();
  });

  test("SCH-V-003: filter Area select is DISABLED when Location is set to Unassigned (None)", async ({
    authenticatedPage,
  }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.filtersButton.click();

    const location = authenticatedPage.locator(
      '[data-testid="schedule-filter-location"]',
    );
    const area = authenticatedPage.locator(
      '[data-testid="schedule-filter-area"]',
    );

    await location.selectOption("none");
    await expect(area).toBeDisabled();
  });

  test("SCH-V-004: pause toggle is visible on a seeded blueprint card", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/calendar?tab=routines");
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // Match any blueprint's pause toggle without coupling to a specific
    // UUID — the seed always inserts ≥1 blueprint with a pause toggle.
    const anyPauseToggle = authenticatedPage
      .locator('[data-testid$="-pause-toggle"]')
      .first();
    await expect(anyPauseToggle).toBeVisible({ timeout: 8000 });
  });

  test("SCH-V-005: clicking the pause toggle reveals 7-day / 14-day / 30-day options", async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto("/calendar?tab=routines");
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    const pauseToggle = authenticatedPage
      .locator('[data-testid$="-pause-toggle"]')
      .first();
    await expect(pauseToggle).toBeVisible({ timeout: 8000 });
    await pauseToggle.click();

    // The pause menu offers three durations via testid suffixes.
    await expect(
      authenticatedPage.locator('[data-testid$="-pause-7d"]').first(),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      authenticatedPage.locator('[data-testid$="-pause-14d"]').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.locator('[data-testid$="-pause-30d"]').first(),
    ).toBeVisible();
  });
});
