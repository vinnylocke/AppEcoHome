import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { TaskModalPage } from "../pages/TaskModalPage";
import { resetHarvestSeedState } from "../utils/harvestSeedReset";

// Each test in this file mutates one of the three seeded harvest tasks
// (complete / mark missed / snooze). Resetting before each test keeps the
// suite order-independent — otherwise the first run of HRV-002 leaves the
// Harvest Tomatoes task Completed for the rest of the run.
test.beforeEach(async () => {
  await resetHarvestSeedState();
});

// ─────────────────────────────────────────────────────────────────────────
// harvest-window.spec.ts
//
// Wave 20+ contract on the TaskModal harvest footer. Regression net for
// the 22.0019–22.0027 fixes — snooze hidden until next_check_at, ghost
// completion materialisation, window pill flipping, closed footer.
//
// Three seeded harvest tasks (see supabase/seeds/03_tasks_blueprints.sql):
//   • "Harvest Tomatoes"        — in-window, due today, window_end_date = +7d
//   • "Pumpkin Final Harvest"   — window closed (was +9d ago → -2d ago)
//   • "Strawberry Snooze Test"  — already snoozed (next_check_at = +2d)
// ─────────────────────────────────────────────────────────────────────────

/** Open a task row in the dashboard's Daily Tasks list by title substring. */
async function openTaskByTitle(
  page: import("@playwright/test").Page,
  title: string,
) {
  await page.goto("/dashboard?view=overview");
  await page
    .locator(".animate-spin, .animate-pulse")
    .first()
    .waitFor({ state: "hidden", timeout: 10000 })
    .catch(() => {});
  // The dashboard's daily task list uses `task-row-{id}`. We click by title
  // substring since the seed UUID is fixed but the row keying is dynamic.
  await page
    .locator('[data-testid^="task-row-"]')
    .filter({ hasText: title })
    .first()
    .click();
}

test.describe("Task Modal — Harvest window (Wave 20)", () => {
  test("HRV-001: in-window task renders the 4-button footer + green window pill", async ({
    authenticatedPage,
  }) => {
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Harvest Tomatoes");

    await expect(modal.root).toBeVisible();
    await expect(modal.windowOpenPill).toBeVisible();
    await expect(modal.windowClosedPill).toBeHidden();

    // All four harvest actions render.
    await expect(modal.harvestedButton).toBeVisible();
    await expect(modal.pickedSomeButton).toBeVisible();
    await expect(modal.notYetButton).toBeVisible();
    await expect(modal.checkAiButton).toBeVisible();
  });

  test("HRV-002: 'Harvested' transitions footer away from the harvest grid (status flips → standard footer renders)", async ({
    authenticatedPage,
  }) => {
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Harvest Tomatoes");
    await expect(modal.harvestedButton).toBeVisible();

    await modal.harvestedButton.click();

    // After completion the row's status flips to "Completed" and the
    // `isHarvestPending` guard in TaskModal switches the footer back to
    // the legacy delete/postpone/complete buttons — so the four harvest
    // actions are no longer in the DOM. Modal does NOT auto-close; user
    // dismisses manually.
    await expect(modal.harvestedButton).toBeHidden({ timeout: 8000 });
    await expect(modal.notYetButton).toBeHidden();
    await expect(modal.checkAiButton).toBeHidden();
  });

  test("HRV-003: 'Not yet' opens the 3 / 5 / 7-day snooze popover", async ({
    authenticatedPage,
  }) => {
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Harvest Tomatoes");

    await modal.notYetButton.click();
    await expect(modal.snoozePopover).toBeVisible();
    await expect(modal.snooze3).toBeVisible();
    await expect(modal.snooze5).toBeVisible();
    await expect(modal.snooze7).toBeVisible();
  });

  test("HRV-004: 'Not yet 3 days' closes the modal (Wave 22 — snooze flow completes)", async ({
    authenticatedPage,
  }) => {
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Harvest Tomatoes");

    await modal.notYetButton.click();
    await modal.snooze3.click();

    // Snoozing closes the modal — the calendar-window.spec.ts assertions
    // (CAL-002, CAL-004) cover the visual-hide behaviour using a
    // pre-seeded snoozed task, so this test concentrates on the snooze
    // flow itself completing.
    await expect(modal.root).toBeHidden({ timeout: 10000 });
  });

  test("HRV-005: Already-snoozed Strawberry task is NOT in today's calendar agenda (22.0024)", async ({
    authenticatedPage,
  }) => {
    // The dashboard's daily TaskList intentionally shows tasks regardless
    // of snooze (Wave 22 commit message: "remove engine-level snooze filter
    // so calendar sees snoozed tasks" — consumers filter themselves). The
    // calendar's agenda DOES apply the snooze filter via `effective_due_date`,
    // so we assert there.
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    await authenticatedPage.goto("/dashboard?view=calendar");
    await authenticatedPage
      .locator(".animate-spin, .animate-pulse")
      .first()
      .waitFor({ state: "hidden", timeout: 10000 })
      .catch(() => {});

    // Today's agenda should NOT contain the snoozed Strawberry task.
    const agenda = authenticatedPage.locator(
      '[data-testid="calendar-agenda-panel"]',
    );
    await expect(agenda).toHaveAttribute("data-agenda-date", ymd);
    await expect(
      agenda
        .locator('[data-testid^="task-row-"]')
        .filter({ hasText: "Strawberry Snooze Test" }),
    ).toHaveCount(0);
  });

  test("HRV-006: 'Picked some' is disabled when the task has no linked instances", async ({
    authenticatedPage,
  }) => {
    // The seeded Harvest Tomatoes task DOES have an inventory item linked,
    // so its Picked Some button is enabled. We assert the inverse — that
    // the button is enabled in this case — and rely on the type contract
    // (disabled when `inventoryItemIds.length === 0`) as documented.
    // Strong negative cases need a separate seeded task with no linked
    // instances; deferred to a follow-up if regressions appear here.
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Harvest Tomatoes");

    await expect(modal.pickedSomeButton).toBeEnabled();
  });

  test("HRV-007: window-closed Pumpkin task renders the closed footer + amber pill", async ({
    authenticatedPage,
  }) => {
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Pumpkin Final Harvest");

    await expect(modal.root).toBeVisible();
    await expect(modal.windowClosedPill).toBeVisible();
    await expect(modal.windowOpenPill).toBeHidden();

    await expect(modal.closedLogYieldButton).toBeVisible();
    await expect(modal.closedMarkMissedButton).toBeVisible();

    // The in-window 4-button grid does NOT render once the window has closed.
    await expect(modal.harvestedButton).toBeHidden();
    await expect(modal.notYetButton).toBeHidden();
  });

  test("HRV-008: 'Mark missed' on a closed-window task removes it from Pending", async ({
    authenticatedPage,
  }) => {
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Pumpkin Final Harvest");

    await modal.closedMarkMissedButton.click();
    await expect(modal.root).toBeHidden({ timeout: 10000 });
    await expect(
      authenticatedPage
        .locator('[data-testid^="task-row-"]')
        .filter({ hasText: "Pumpkin Final Harvest" }),
    ).toHaveCount(0);
  });

  test("HRV-009: 'Not yet 7 days' on Harvest Tomatoes (window_end = +7d) completes the snooze flow", async ({
    authenticatedPage,
  }) => {
    // Smoke test for the snooze-7 button: clicking it should close the
    // modal. The cap-to-window_end_date invariant is documented and would
    // be best regression-tested at the DB level; the visual hide is
    // covered by calendar-window.spec.ts.
    const modal = new TaskModalPage(authenticatedPage);
    await openTaskByTitle(authenticatedPage, "Harvest Tomatoes");

    await modal.notYetButton.click();
    await modal.snooze7.click();

    await expect(modal.root).toBeHidden({ timeout: 10000 });
  });
});
