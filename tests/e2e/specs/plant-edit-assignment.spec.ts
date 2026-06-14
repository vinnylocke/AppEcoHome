import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";
import { PlantEditPage } from "../pages/PlantEditPage";
import { PlantAssignmentPage } from "../pages/PlantAssignmentPage";
import { BulkAssignPage } from "../pages/BulkAssignPage";

// ─────────────────────────────────────────────────────────────────────────
// plant-edit-assignment.spec.ts
//
// Catalogue PR 2, section 03.2 — PlantEditModal save-validation, the
// PlantAssignmentModal quantity stepper, the "Add to garden" no-area
// path, and BulkAssignModal multi-plant assignment.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Plant Edit Modal — validation", () => {
  test("PE-001: clearing the plant name and saving surfaces a Mandatory Field error", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    const edit = new PlantEditPage(authenticatedPage);

    await shed.goto();
    await shed.waitForLoad();
    await shed.plantCard("Tomato").click();

    // Modal opens on the Care tab by default — name input is present.
    await expect(edit.nameInput).toBeVisible();
    await edit.nameInput.fill("");
    await edit.saveButton.click();

    // The form rejects the empty name and marks the field invalid.
    await expect(authenticatedPage.getByText(/Mandatory Field/i)).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Plant Assignment Modal — quantity stepper + no-area path", () => {
  test("PA-001: decrement at quantity 1 keeps the value at 1 (min clamp)", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    const assign = new PlantAssignmentPage(authenticatedPage);

    await shed.goto();
    await shed.waitForLoad();

    // Basil is Unplanted in the seed → the Assign action button is rendered.
    await shed.assignButtonFor("Basil").click();

    await expect(assign.quantityValue).toHaveText("1");
    await assign.quantityDecrement.click();
    await expect(assign.quantityValue).toHaveText("1");
  });

  test("PA-002: increment ticks the quantity up by 1 each press (no upper bound enforced in UI)", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    const assign = new PlantAssignmentPage(authenticatedPage);

    await shed.goto();
    await shed.waitForLoad();
    await shed.assignButtonFor("Basil").click();

    await expect(assign.quantityValue).toHaveText("1");
    await assign.quantityIncrement.click();
    await assign.quantityIncrement.click();
    await assign.quantityIncrement.click();
    await expect(assign.quantityValue).toHaveText("4");
  });

  test("PA-003: 'Add to garden, area unknown' CTA advances past the area picker", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    const assign = new PlantAssignmentPage(authenticatedPage);

    await shed.goto();
    await shed.waitForLoad();
    await shed.assignButtonFor("Basil").click();

    await expect(assign.addToGardenButton).toBeVisible();
    await assign.addToGardenButton.click();

    // We're now on Step 2 — the Confirm button is the canonical marker.
    await expect(assign.confirmButton).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Bulk Assign Modal", () => {
  test("BA-001: select 2 plants, open Bulk Assign, the modal lists per-plant quantity inputs", async ({
    authenticatedPage,
  }) => {
    const shed = new ShedPage(authenticatedPage);
    const bulk = new BulkAssignPage(authenticatedPage);

    await shed.goto();
    await shed.waitForLoad();

    await shed.selectModeBtn.click();
    // In selectMode the plant card's aria-label flips to "Select <name>" —
    // clicking by accessible name avoids landing on a child action button.
    await authenticatedPage.getByRole("button", { name: "Select Tomato" }).click();
    await authenticatedPage.getByRole("button", { name: "Select Basil" }).click();
    await expect(shed.bulkActionBar).toBeVisible();
    await shed.bulkAssignBtn.click();

    await expect(bulk.root).toBeVisible();
    // The modal lists per-plant quantity inputs. Match the prefix only —
    // the actual plant id depends on which worker the test is running as.
    await expect(
      authenticatedPage.locator('[data-testid^="bulk-assign-qty-"]'),
    ).toHaveCount(2);
    await expect(bulk.confirmButton).toBeVisible();
  });
});
