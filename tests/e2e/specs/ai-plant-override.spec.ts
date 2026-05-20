import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";

// AI Plant Overhaul Wave 6 — fork-on-edit + reset flow.
//
// Seeded data (supabase/seeds/13_ai_freshness.sql):
//   - "Cherry Tomato" (shallow fork, catalogue-tracking) → detach E2E target
//   - "Lavender" (custom fork, overridden_fields = ["watering_min_days"]) → reset E2E target

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

    const card = shed.plantCard("Lavender");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    await expect(
      authenticatedPage.locator("[data-testid='ai-source-chip-custom']"),
    ).toBeVisible({ timeout: 5000 });
    await expect(
      authenticatedPage.locator("[data-testid='ai-care-reset']"),
    ).toBeVisible();
    // Refresh now is NOT available on a custom fork.
    await expect(
      authenticatedPage.locator("[data-testid='ai-care-refresh-now']"),
    ).not.toBeVisible();
  });

  test("AI-OVERRIDE-003: Reset opens confirm modal and cancel keeps the fork custom", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    await shed.plantCard("Lavender").click();
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
});
