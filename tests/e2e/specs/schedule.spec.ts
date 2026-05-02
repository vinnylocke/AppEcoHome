import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { SchedulePage } from "../pages/SchedulePage";

// All tests require an authenticated session.
// Seeded blueprints (03_tasks_blueprints.sql):
//   Weekly Garden Watering (7 days), Basil Watering (7 days), Rose Pruning (90 days),
//   Fern Inspection (14 days), Tomato Harvest (7 days), Monthly Fertilizing (30 days),
//   Pest Control (14 days), General Maintenance (30 days)

test.describe("Schedule — basic render", () => {
  test("SCH-003: Seeded blueprint cards render on the page", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    // At least one seeded blueprint should be visible
    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });
  });

  test("SCH-004: Blueprint card shows a frequency badge", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    // Weekly Garden Watering is seeded with frequency_days = 7
    await expect(schedule.frequencyBadge(7)).toBeVisible({ timeout: 10000 });
  });

  test("SCH-005: Blueprint card shows the task title", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    // Each seeded blueprint title should appear
    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });
    await expect(schedule.blueprintCard("Monthly Fertilizing")).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Schedule — New Automation modal", () => {
  test("SCH-007: Clicking New Automation opens the modal", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.newAutomationButton.click();

    await expect(schedule.modalHeading).toBeVisible({ timeout: 10000 });
    await expect(schedule.titleInput).toBeVisible({ timeout: 5000 });
  });

  test("SCH-008: Create automation — happy path with cleanup", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const title = `E2E Automation ${Date.now()}`;

    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });

    await schedule.titleInput.fill(title);
    const today = new Date().toISOString().split("T")[0];
    await authenticatedPage.locator('input[type="date"]').first().fill(today);
    await schedule.saveButton.click();

    // Modal closes on success
    await schedule.modalHeading
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // New blueprint card should appear
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });

    // --- Cleanup: delete the automation ---
    await schedule.deleteButtonFor(title).click();
    const deleteConfirm = authenticatedPage.getByRole("button", {
      name: /Delete Automation/i,
    });
    if (await deleteConfirm.isVisible({ timeout: 3000 }).catch(() => false)) {
      await deleteConfirm.click();
    }
    await expect(schedule.blueprintCard(title)).not.toBeVisible({ timeout: 10000 });
  });

  test("SCH-009: Submit with blank title shows validation error", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });

    // Clear any pre-filled value and submit
    await schedule.titleInput.fill("");
    await schedule.saveButton.click();

    await expect(schedule.titleError).toBeVisible({ timeout: 5000 });
    // Modal should stay open
    await expect(schedule.modalHeading).toBeVisible();
  });

  test("SCH-010: Task type dropdown contains all expected types", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });

    // The task type selector has exactly the 4 types from TASK_CATEGORIES
    const taskTypeSelect = authenticatedPage.getByRole("combobox").first();
    const options = await taskTypeSelect.locator("option").allTextContents();
    const expectedTypes = ["Planting", "Watering", "Harvesting", "Maintenance"];
    for (const type of expectedTypes) {
      expect(options.some((o) => o.includes(type))).toBe(true);
    }
  });

  test("SCH-014: Cancel / Escape closes the modal without saving", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const before = await authenticatedPage.locator("h3").count();

    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });
    await schedule.titleInput.fill("Should not save");

    await authenticatedPage.keyboard.press("Escape");

    // Escape triggers unsaved-changes confirm — dismiss it if it appears
    authenticatedPage.on("dialog", (d) => d.accept());

    await schedule.modalHeading
      .waitFor({ state: "hidden", timeout: 8000 })
      .catch(() => {});

    // The automation should not have been saved
    await expect(schedule.blueprintCard("Should not save")).not.toBeVisible();
  });
});

test.describe("Schedule — Edit blueprint", () => {
  test("SCH-015: Clicking a blueprint card opens the edit modal pre-filled", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.blueprintCard("Weekly Garden Watering").click();

    await expect(
      authenticatedPage.getByRole("heading", { name: /Edit Automation/i }),
    ).toBeVisible({ timeout: 10000 });

    // The title input should be pre-filled
    await expect(schedule.titleInput).toHaveValue("Weekly Garden Watering", { timeout: 5000 });
  });
});

test.describe("Schedule — Delete blueprint", () => {
  test("SCH-019: Delete automation — confirm removes it", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    const title = `E2E Delete BP ${Date.now()}`;

    // Create one to delete
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });
    await schedule.titleInput.fill(title);
    const today2 = new Date().toISOString().split("T")[0];
    await authenticatedPage.locator('input[type="date"]').first().fill(today2);
    await schedule.saveButton.click();
    await schedule.modalHeading
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });

    // Delete it
    await schedule.deleteButtonFor(title).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    await expect(schedule.blueprintCard(title)).not.toBeVisible({ timeout: 10000 });
  });

  test("SCH-020: Cancel on delete dialog leaves blueprint in list", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    // Use the first seeded blueprint for a cancel test — safe, no data changes
    await schedule.deleteButtonFor("Weekly Garden Watering").click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });

    await authenticatedPage.getByRole("button", { name: /Cancel/i }).click();

    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Schedule — Search and filters", () => {
  test("SCH-022: Search for 'Watering' shows only matching blueprints", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.searchInput.fill("Watering");
    await authenticatedPage.waitForTimeout(400);

    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });
    await expect(schedule.blueprintCard("Monthly Fertilizing")).not.toBeVisible();
  });

  test("SCH-023: Search with no match shows no-match state", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.searchInput.fill("xyzqwerty");
    await authenticatedPage.waitForTimeout(400);

    await expect(schedule.noMatchState).toBeVisible({ timeout: 10000 });
  });

  test("SCH-024: Clicking Filters opens the filter drawer", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.filtersButton.click();

    await expect(schedule.filterDrawerHeading).toBeVisible({ timeout: 5000 });
  });

  test("SCH-025: Filter by Task Type — Watering shows only Watering blueprints", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.filtersButton.click();
    await expect(schedule.filterDrawerHeading).toBeVisible({ timeout: 5000 });

    // Task Type is the first filter select in the drawer
    const taskTypeSelect = authenticatedPage.locator("select").first();
    await taskTypeSelect.selectOption("Watering");
    await authenticatedPage.waitForTimeout(400);

    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });
    await expect(schedule.blueprintCard("Monthly Fertilizing")).not.toBeVisible();
  });

  test("SCH-028: Clear All resets filters and shows all blueprints", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    // Apply a filter first
    await schedule.filtersButton.click();
    await expect(schedule.filterDrawerHeading).toBeVisible({ timeout: 5000 });
    const taskTypeSelect = authenticatedPage.locator("select").first();
    await taskTypeSelect.selectOption("Harvesting");
    await authenticatedPage.waitForTimeout(400);

    // Clear All should now be visible
    await expect(schedule.clearAllFiltersButton).toBeVisible({ timeout: 5000 });
    await schedule.clearAllFiltersButton.click();
    await authenticatedPage.waitForTimeout(400);

    // All blueprints should be visible again
    await expect(schedule.blueprintCard("Weekly Garden Watering")).toBeVisible({ timeout: 10000 });
    await expect(schedule.blueprintCard("Monthly Fertilizing")).toBeVisible({ timeout: 10000 });
  });

  test("SCH-026: Filter by Harvesting — only Harvesting blueprints shown", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.filtersButton.click();
    await expect(schedule.filterDrawerHeading).toBeVisible({ timeout: 5000 });

    const taskTypeSelect = authenticatedPage.locator("select").first();
    await taskTypeSelect.selectOption("Harvesting");
    await authenticatedPage.waitForTimeout(400);

    // Seeded Harvesting blueprint should appear; Watering blueprint should not
    await expect(schedule.blueprintCard("Tomato Harvest")).toBeVisible({ timeout: 10000 });
    await expect(schedule.blueprintCard("Weekly Garden Watering")).not.toBeVisible();

    // Cleanup: clear filter
    await schedule.clearAllFiltersButton.click();
  });

  test("SCH-027: Filter by Maintenance — Maintenance blueprint shown", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await schedule.filtersButton.click();
    await expect(schedule.filterDrawerHeading).toBeVisible({ timeout: 5000 });

    const taskTypeSelect = authenticatedPage.locator("select").first();
    await taskTypeSelect.selectOption("Maintenance");
    await authenticatedPage.waitForTimeout(400);

    // "General Garden Maintenance" is the seeded Maintenance blueprint
    await expect(schedule.blueprintCard("General Garden Maintenance")).toBeVisible({ timeout: 10000 });
    await expect(schedule.blueprintCard("Monthly Fertilizing")).not.toBeVisible();

    // Cleanup: clear filter
    await schedule.clearAllFiltersButton.click();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Section 06 — Schedule: empty state, metadata, edit, cascade (extended)
// ─────────────────────────────────────────────────────────────────────────────

test.describe("Schedule — empty state (Section 06)", () => {
  test("SCH-006: Empty state renders when no blueprints exist", async ({ authenticatedPage }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? "";

    // Mock the task_blueprints REST endpoint to return an empty array
    await authenticatedPage.route(
      `${supabaseUrl}/rest/v1/task_blueprints*`,
      route => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );

    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    await expect(schedule.emptyState).toBeVisible({ timeout: 10000 });
    await expect(schedule.createFirstButton).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Schedule — create with metadata (Section 06)", () => {
  test("SCH-011: Create blueprint with inventory item link — Basil badge appears on card", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const title = `E2E Inventory Link ${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];

    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });

    await schedule.titleInput.fill(title);
    await authenticatedPage.locator('input[type="date"]').first().fill(today);

    // Wait for locations to load then link to Basil in Raised Bed A
    await authenticatedPage.waitForTimeout(800);
    await authenticatedPage.locator("select").nth(1).selectOption({ label: "Outside Garden" });
    await authenticatedPage.waitForTimeout(400);
    await authenticatedPage.locator("select").nth(2).selectOption({ label: "Raised Bed A" });
    await authenticatedPage.waitForTimeout(400);
    await authenticatedPage.locator("select").nth(3).selectOption({ label: "Basil" });
    await authenticatedPage.waitForTimeout(400);

    // Select all instances (the "Select All" button appears once a species is chosen)
    const selectAllBtn = authenticatedPage.getByRole("button", { name: /Select All/i }).first();
    if (await selectAllBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await selectAllBtn.click();
    }

    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    // Blueprint card should show "Basil" in its plant context badge
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Basil").first()).toBeVisible({ timeout: 5000 });

    // Cleanup
    await schedule.deleteButtonFor(title).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
  });

  test("SCH-012: Create blueprint with location — location badge appears on card", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const title = `E2E Location Link ${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];

    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });

    await schedule.titleInput.fill(title);
    await authenticatedPage.locator('input[type="date"]').first().fill(today);

    // Wait for locations to load then select Outside Garden
    await authenticatedPage.waitForTimeout(800);
    await authenticatedPage.locator("select").nth(1).selectOption({ label: "Outside Garden" });

    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    // Card should show "Outside Garden" in the location badge
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Outside Garden").first()).toBeVisible({ timeout: 5000 });

    // Cleanup
    await schedule.deleteButtonFor(title).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
  });

  test("SCH-013: Create blueprint with seasonal start/end dates — blueprint saves successfully", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const title = `E2E Seasonal ${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];
    const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1))
      .toISOString()
      .split("T")[0];

    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });

    await schedule.titleInput.fill(title);

    // Set start date
    await authenticatedPage.locator('input[type="date"]').first().fill(today);

    // End date input is present when isRecurring=true (default for New Automation)
    const endDateInput = authenticatedPage.locator('input[type="date"]').nth(1);
    const endDateVisible = await endDateInput.isVisible({ timeout: 3000 }).catch(() => false);
    if (endDateVisible) {
      await endDateInput.fill(nextYear);
    }

    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    // Blueprint card should appear confirming the save succeeded
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });

    // Cleanup
    await schedule.deleteButtonFor(title).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
  });
});

test.describe("Schedule — edit blueprint (extended, Section 06)", () => {
  test("SCH-016: Edit blueprint title — updated title shows on card", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const ts = Date.now();
    const originalTitle = `E2E Edit Title ${ts}`;
    const updatedTitle = `E2E Renamed ${ts}`;
    const today = new Date().toISOString().split("T")[0];

    // Create a temp blueprint to edit
    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });
    await schedule.titleInput.fill(originalTitle);
    await authenticatedPage.locator('input[type="date"]').first().fill(today);
    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await expect(schedule.blueprintCard(originalTitle)).toBeVisible({ timeout: 10000 });

    // Open edit modal
    await schedule.blueprintCard(originalTitle).click();
    await expect(schedule.modalHeading).toBeVisible({ timeout: 10000 });

    // Change the title
    await schedule.titleInput.clear();
    await schedule.titleInput.fill(updatedTitle);
    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    // New title should appear on the card
    await expect(schedule.blueprintCard(updatedTitle)).toBeVisible({ timeout: 10000 });
    await expect(schedule.blueprintCard(originalTitle)).not.toBeVisible();

    // Cleanup
    await schedule.deleteButtonFor(updatedTitle).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
  });

  test("SCH-017: Edit blueprint frequency — updated frequency badge shows on card", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const title = `E2E Freq Edit ${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];

    // Create a temp blueprint (default frequency = 7)
    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });
    await schedule.titleInput.fill(title);
    await authenticatedPage.locator('input[type="date"]').first().fill(today);
    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });

    // Open edit modal
    await schedule.blueprintCard(title).click();
    await expect(schedule.modalHeading).toBeVisible({ timeout: 10000 });

    // Change frequency from 7 to 14
    const freqInput = authenticatedPage.locator('input[type="number"]').first();
    await freqInput.clear();
    await freqInput.fill("14");
    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    // Re-open edit modal and verify frequency value was saved
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });
    await schedule.blueprintCard(title).click();
    await expect(schedule.modalHeading).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.locator('input[type="number"]').first()).toHaveValue("14", { timeout: 5000 });

    // Close and cleanup
    await authenticatedPage.keyboard.press("Escape");
    authenticatedPage.once("dialog", (d) => d.accept());
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 5000 });
    await schedule.deleteButtonFor(title).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
  });

  test("SCH-018: Edit blueprint task type — type change is saved", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const title = `E2E Type Edit ${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];

    // Create a temp blueprint (default type = Watering)
    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });
    await schedule.titleInput.fill(title);
    await authenticatedPage.locator('input[type="date"]').first().fill(today);
    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });

    // Open edit modal and change type to Maintenance (valid TASK_CATEGORIES value)
    await schedule.blueprintCard(title).click();
    await expect(schedule.modalHeading).toBeVisible({ timeout: 10000 });

    await schedule.taskTypeSelect.selectOption("Maintenance");
    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});

    // Re-open edit modal and verify type was saved
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });
    await schedule.blueprintCard(title).click();
    await expect(schedule.modalHeading).toBeVisible({ timeout: 10000 });
    await expect(schedule.taskTypeSelect).toHaveValue("Maintenance", { timeout: 5000 });

    // Close and cleanup
    await authenticatedPage.keyboard.press("Escape");
    authenticatedPage.once("dialog", (d) => d.accept());
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});

    await schedule.deleteButtonFor(title).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
  });
});

test.describe("Schedule — blueprint cascade delete (Section 06)", () => {
  test("SCH-021: Deleting a blueprint removes its ghost tasks from the calendar", async ({ authenticatedPage }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();

    const title = `E2E Cascade ${Date.now()}`;
    const today = new Date().toISOString().split("T")[0];

    // Create a temp blueprint starting today — its ghost task appears on the calendar
    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 10000 });
    await schedule.titleInput.fill(title);
    await authenticatedPage.locator('input[type="date"]').first().fill(today);
    await schedule.saveButton.click();
    await schedule.modalHeading.waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });

    // Navigate to calendar and verify the ghost task appears for today
    await authenticatedPage.goto("/dashboard?view=calendar");
    const taskList = authenticatedPage.getByRole("heading", { name: "Agenda" });
    await expect(taskList).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText(title)).toBeVisible({ timeout: 10000 });

    // Navigate back and delete the blueprint
    await authenticatedPage.goto("/schedule");
    await schedule.waitForLoad();
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });
    await schedule.deleteButtonFor(title).click();
    const confirmBtn = authenticatedPage.getByRole("button", { name: /Delete Automation/i });
    if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) await confirmBtn.click();
    await expect(schedule.blueprintCard(title)).not.toBeVisible({ timeout: 10000 });

    // Navigate back to calendar — the ghost task should no longer be there
    await authenticatedPage.goto("/dashboard?view=calendar");
    await expect(taskList).toBeVisible({ timeout: 10000 });
    await authenticatedPage.waitForTimeout(2000); // allow calendar to fetch fresh data
    await expect(authenticatedPage.getByText(title)).not.toBeVisible({ timeout: 8000 });
  });
});
