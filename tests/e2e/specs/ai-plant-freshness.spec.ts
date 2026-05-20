import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";

// AI Plant Overhaul Wave 5 — freshness chip + acknowledge flow.
//
// Seeded data (supabase/seeds/13_ai_freshness.sql):
//   - Global AI plant "Cherry Tomato" (id 1000010, freshness_version=2)
//   - Per-home shallow fork "Cherry Tomato" (id 1000011 → forked_from 1000010)
//   - user_plant_ack at version 1 → chip should fire on the home fork card

test.describe("AI Plant Freshness — chip + acknowledge", () => {
  test("AI-FRESH-001: Shed card shows the Updated chip on the catalogue plant", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Cherry Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });

    // The chip lives inside the card; it has data-testid="ai-updated-chip"
    // and renders "2 fields updated" given seeded updated_care_fields.
    const chip = card.locator("[data-testid='ai-updated-chip']");
    await expect(chip).toBeVisible({ timeout: 5000 });
    await expect(chip).toContainText(/fields updated/i);
  });

  test("AI-FRESH-002: Opening the plant shows the yellow callout listing changed fields", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Cherry Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    const callout = authenticatedPage.locator("[data-testid='ai-care-update-callout']");
    await expect(callout).toBeVisible({ timeout: 5000 });

    // The seeded updated_care_fields are ['sunlight','watering_min_days'] —
    // the callout renders them as humanised labels.
    await expect(callout).toContainText("Sunlight");
    await expect(callout).toContainText(/watering/i);
  });

  test("AI-FRESH-003: Mark as reviewed dismisses the callout", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    await shed.goto();
    await shed.waitForLoad();

    const card = shed.plantCard("Cherry Tomato");
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.click();

    const callout = authenticatedPage.locator("[data-testid='ai-care-update-callout']");
    await expect(callout).toBeVisible({ timeout: 5000 });

    const markReviewed = authenticatedPage.locator("[data-testid='ai-care-mark-reviewed']");
    await markReviewed.click();

    // After ack, the optimistic local clear hides the callout immediately.
    await expect(callout).not.toBeVisible({ timeout: 5000 });
  });
});
