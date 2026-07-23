import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { SchedulePage } from "../pages/SchedulePage";

// ─────────────────────────────────────────────────────────────────────────
// recurrence-cap.spec.ts
//
// Track B — the "Repeat every year" checkbox + optional "Stop after N years"
// cap in the routine editor (AddTaskModal, opened from /schedule). The
// controls only appear once an end date is set (recurrence is meaningless
// without one), and the year cap only appears once "repeat" is on.
//
// The recurrence LOGIC (once / annual / lifecycle_capped ↔ recurs_until, and
// the per-year window projection) is covered by unit + Deno tests
// (recurrence.test.ts, windowTasks.test.ts, taskEngineOffline.test.ts,
// dailyBrief.test.ts, annualWindows.test.ts). This spec covers the UI wiring.
// ─────────────────────────────────────────────────────────────────────────

test.describe("Routine editor — annual recurrence + year cap (Track B)", () => {
  test("RCUR-001: recurrence controls reveal progressively (end date → checkbox → year cap)", async ({
    authenticatedPage,
  }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.newAutomationButton.click();
    await expect(schedule.titleInput).toBeVisible({ timeout: 8000 });

    // No end date yet → the "Repeat every year" checkbox is hidden.
    const repeatCheckbox = authenticatedPage.getByTestId("repeat-every-year-checkbox");
    await expect(repeatCheckbox).toBeHidden();

    // Set a start + end date (the two date inputs in the recurring form).
    const dateInputs = authenticatedPage.locator('input[type="date"]');
    await dateInputs.nth(0).fill("2099-06-01");
    await dateInputs.nth(1).fill("2099-08-31");

    // Now the checkbox appears; the year cap is still hidden until it's checked.
    await expect(repeatCheckbox).toBeVisible();
    await expect(authenticatedPage.getByTestId("repeat-years-input")).toBeHidden();

    // Check "Repeat every year" → the "Stop after N years" input reveals.
    await repeatCheckbox.check();
    const yearsInput = authenticatedPage.getByTestId("repeat-years-input");
    await expect(yearsInput).toBeVisible();
    await expect(yearsInput).toHaveAttribute("min", "1");

    // Clearing the end date hides both controls again (recurrence reset).
    await dateInputs.nth(1).fill("");
    await expect(repeatCheckbox).toBeHidden();
  });

  test("RCUR-002: authoring an annual routine with a year cap saves it", async ({
    authenticatedPage,
  }) => {
    const schedule = new SchedulePage(authenticatedPage);
    await schedule.goto();
    await schedule.waitForLoad();
    await schedule.newAutomationButton.click();

    // Unique title so re-runs never collide on a stale row.
    const title = `E2E Annual Harvest ${Date.now()}`;
    await schedule.titleInput.fill(title);
    const dateInputs = authenticatedPage.locator('input[type="date"]');
    await dateInputs.nth(0).fill("2099-06-01");
    await dateInputs.nth(1).fill("2099-08-31");
    await authenticatedPage.getByTestId("repeat-every-year-checkbox").check();
    await authenticatedPage.getByTestId("repeat-years-input").fill("3");

    await schedule.saveButton.click();

    // The new routine appears in the list.
    await expect(schedule.blueprintCard(title)).toBeVisible({ timeout: 10000 });
  });
});
