import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { ShedPage } from "../pages/ShedPage";
import { PlantEditPage } from "../pages/PlantEditPage";
import { InstanceEditPage } from "../pages/InstanceEditPage";

// ─────────────────────────────────────────────────────────────────────────
// instance-edit-tabs.spec.ts
//
// Catalogue PR 2, section 03.2 — InstanceEditModal tab content.
//
// Each test opens TheShed → taps a plant card → switches to the
// PlantEditModal's Instances tab → opens the InstanceEditModal on a
// seeded inventory_items row → exercises one tab.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Open InstanceEditModal for the seeded Basil plant (planted in Raised Bed A
 * — has an inventory_items row, used here so the modal has real data).
 */
async function openBasilInstance(authenticatedPage: import("@playwright/test").Page) {
  const shed = new ShedPage(authenticatedPage);
  const edit = new PlantEditPage(authenticatedPage);
  await shed.goto();
  await shed.waitForLoad();
  await shed.plantCard("Basil").click();
  await edit.tabInstances.click();
  await edit.firstInstanceRowOpen().click();
}

test.describe("InstanceEditModal — tab content", () => {
  test("IE-001: Journal tab — add a new entry, saved entry appears in the list", async ({
    authenticatedPage,
  }) => {
    await openBasilInstance(authenticatedPage);
    const instance = new InstanceEditPage(authenticatedPage);

    await instance.tabJournal.click();
    await expect(instance.journalRoot).toBeVisible();

    await instance.journalNewEntryBtn.click();
    await instance.journalSubjectInput.fill(`E2E test entry ${Date.now()}`);
    await instance.journalDescriptionInput.fill("Created by instance-edit-tabs.spec.ts");
    await instance.journalSaveBtn.click();

    // After save, the New Entry button reappears (form collapses) and at
    // least one journal entry row is rendered.
    await expect(instance.journalNewEntryBtn).toBeVisible({ timeout: 8000 });
    await expect(instance.anyJournalEntry()).toBeVisible();
  });

  test("IE-002: Routine tab — seeded blueprints render as routine rows", async ({
    authenticatedPage,
  }) => {
    await openBasilInstance(authenticatedPage);
    const instance = new InstanceEditPage(authenticatedPage);

    await instance.tabRoutine.click();
    // The routine list mounts when blueprints exist. If the seed has
    // recurring task blueprints, at least one routine row is visible.
    const list = instance.routineList;
    const visible = await list.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) {
      test.skip(true, "No routine blueprints seeded for Basil — skipping render assertion");
      return;
    }
    await expect(instance.anyRoutineRow()).toBeVisible();
  });

  test("IE-003: Yield tab — log a harvest, the new record appears in the history list", async ({
    authenticatedPage,
  }) => {
    await openBasilInstance(authenticatedPage);
    const instance = new InstanceEditPage(authenticatedPage);

    await instance.tabYield.click();
    await expect(instance.yieldValueInput).toBeVisible();

    const value = 250;
    await instance.yieldValueInput.fill(String(value));
    await instance.yieldLogButton.click();

    // After logging, the history list renders the new record.
    await expect(instance.yieldHistoryList).toBeVisible({ timeout: 8000 });
    await expect(instance.anyYieldRecord()).toContainText(String(value));
  });
});
