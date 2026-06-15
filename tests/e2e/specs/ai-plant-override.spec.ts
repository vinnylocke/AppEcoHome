import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";

// AI Plant Overhaul Wave 6 — fork-on-edit + reset flow.
//
// Seeded data (supabase/seeds/13_ai_freshness.sql + scripts/seed-test-db.mjs
// substitutions):
//   - "Cherry Tomato" (shallow fork, catalogue-tracking) → detach E2E target
//   - "Lavender" (custom fork, overridden_fields = ["watering_min_days"]) → reset E2E target
//
// Plant IDs are substituted per worker by the seed script:
//   worker 1 (test1) → Cherry Tomato 200011, Lavender 200013
//   worker 2 (test2) → 300011 / 300013, etc.
// The seeded inventory also has a *separate* "Lavender" plant (2000006 for
// worker 1) with no AI fork, so name-only selectors match BOTH cards.
// The Lavender override tests must target the fork by per-worker ID.

const workerNum = parseInt(process.env.PLAYWRIGHT_WORKER_INDEX ?? "0", 10) + 1;
const LAVENDER_FORK_ID = `${workerNum + 1}00013`;

test.describe("AI Plant Overhaul Wave 6 — override flow", () => {
  test("AI-OVERRIDE-001: catalogue-tracking plant shows 'Auto-updating' chip in modal", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Cherry Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    await expect(
      authenticatedPage.locator("[data-testid='ai-source-chip-catalogue']"),
    ).toBeVisible({ timeout: 5000 });
    // The custom chip should NOT be present for a catalogue-tracking row.
    await expect(
      authenticatedPage.locator("[data-testid='ai-source-chip-custom']"),
    ).not.toBeVisible();
  });

  test("AI-OVERRIDE-002: custom fork shows 'Custom' chip + Reset button", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    // The Shed has TWO "Lavender" plants — the seeded inventory plant and
    // the Wave 6 custom fork. Target the fork directly by per-worker ID.
    const card = authenticatedPage.getByTestId(`plant-card-${LAVENDER_FORK_ID}`);
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    await expect(
      authenticatedPage.locator("[data-testid='ai-source-chip-custom']"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      authenticatedPage.locator("[data-testid='ai-care-reset']"),
    ).toBeVisible();
    // Refresh-now is rendered (so the affordance is discoverable) but
    // disabled on a custom fork — the user has to Revert / Reset before
    // automatic care updates can flow again.
    await expect(
      authenticatedPage.locator("[data-testid='ai-care-refresh-now']"),
    ).toBeDisabled();
  });

  test("AI-OVERRIDE-003: Reset opens confirm modal and cancel keeps the fork custom", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await authenticatedPage.getByTestId(`plant-card-${LAVENDER_FORK_ID}`).click();
    await authenticatedPage.locator("[data-testid='ai-care-reset']").click();

    const confirmModal = authenticatedPage.locator("[data-testid='ai-reset-confirm-modal']");
    await expect(confirmModal).toBeVisible({ timeout: 5000 });

    // Cancel — fork should still be custom.
    await authenticatedPage.locator("[data-testid='ai-reset-cancel']").click();
    await expect(confirmModal).not.toBeVisible();
    await expect(
      authenticatedPage.locator("[data-testid='ai-source-chip-custom']"),
    ).toBeVisible();
  });

  // Wave 7 (D9) — per-field highlight inside ManualPlantCreation
  test("AI-OVERRIDE-004: custom fork's overridden field renders the 'Custom' badge", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await authenticatedPage.getByTestId(`plant-card-${LAVENDER_FORK_ID}`).click();

    // The Watering Interval field lives inside the collapsible "Care
    // Requirements" section of ManualPlantCreation, which is closed by
    // default. Expand it so the per-field badge actually renders.
    await authenticatedPage
      .getByRole("button", { name: /Care Requirements/i })
      .click();

    // The seeded Lavender fork has overridden_fields = ["watering_min_days"].
    // ManualPlantCreation's Watering Interval block shares one badge for
    // both min/max fields → form-field-overridden-watering.
    const badge = authenticatedPage.locator(
      "[data-testid='form-field-overridden-watering']",
    );
    await expect(badge).toBeVisible({ timeout: 5000 });
    await expect(badge).toContainText("Custom");
  });
});
