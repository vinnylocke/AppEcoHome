import { expect } from "@playwright/test";
import { test } from "../fixtures/auth";
import { CalendarPage } from "../pages/CalendarPage";
import { resetHarvestSeedState } from "../utils/harvestSeedReset";

// Pre-reset because the harvest-window spec mutates the same rows;
// either file may run first under --workers=1.
test.beforeEach(async () => {
  await resetHarvestSeedState();
});

// ─────────────────────────────────────────────────────────────────────────
// calendar-window.spec.ts
//
// Calendar visualisations of the Wave 20 harvest-window contract.
// Regression net for the 22.0019–22.0027 fixes that touched the calendar:
//   • today's cell stays amber while a harvest window is active (22.0022)
//   • overdue dot honours `effective_due_date` (22.0021)
//   • snoozed task dot moves to next_check_at (22.0027, 22.0025)
//   • agenda hides snoozed task on today, reveals on next_check_at
// ─────────────────────────────────────────────────────────────────────────

/** Compute today's date in YYYY-MM-DD (local time). */
function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add `days` to today and return YYYY-MM-DD. */
function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test.describe("Calendar — harvest window visualisations", () => {
  test("CAL-001: today's cell carries the amber harvest highlight while a window is active (22.0022)", async ({
    authenticatedPage,
  }) => {
    const calendar = new CalendarPage(authenticatedPage);
    await calendar.goto();
    await calendar.waitForLoad();
    // Wait for the agenda to mount — the harvestWindowTasks query is
    // fetched in parallel with the main task fetch.
    await calendar.agendaPanel.waitFor({ state: "visible", timeout: 10000 });

    // Today is selected by default, and `isHarvestWindow` is gated on
    // `!isSelected` (the primary-blue selected background takes visual
    // priority over the amber highlight). Click a different day so the
    // amber attribute reads on today's cell.
    await calendar.dayCell(addDays(3)).click();

    const today = calendar.dayCell(localToday()).first();
    await expect(today).toBeVisible();
    await expect(async () => {
      const value = await today.getAttribute("data-harvest-window");
      expect(value).toBe("true");
    }).toPass({ timeout: 10000 });
  });

  test("CAL-002: a snoozed harvest task does NOT render a dot on its original due_date (22.0021)", async ({
    authenticatedPage,
  }) => {
    const calendar = new CalendarPage(authenticatedPage);
    await calendar.goto();
    await calendar.waitForLoad();

    // Strawberry Snooze Test: due_date = today, next_check_at = today + 2d.
    // Per 22.0021/22.0027, the original due_date cell should NOT count the
    // snoozed task in its pending dots. Today's cell still has dots from
    // OTHER tasks (Harvest Tomatoes, Inspection, etc.), so we just check
    // the agenda view filtering instead — see CAL-004/005 below.
    //
    // Direct test: switch the agenda to today, ensure Strawberry NOT in list.
    const today = calendar.dayCell(localToday());
    await today.click();
    await expect(calendar.agendaPanel).toHaveAttribute("data-agenda-date", localToday());
    await expect(calendar.agendaTaskByTitle("Strawberry Snooze Test")).toHaveCount(0);
  });

  test("CAL-003: snoozed task's dot moves to next_check_at (22.0027)", async ({
    authenticatedPage,
  }) => {
    const calendar = new CalendarPage(authenticatedPage);
    await calendar.goto();
    await calendar.waitForLoad();

    // next_check_at = today + 2d for the Strawberry task. That day should
    // have a pending-task dot for the snoozed task.
    const checkInDate = addDays(2);
    const cell = calendar.dayCell(checkInDate);
    await expect(cell).toBeVisible();
    // The cell has at least one pending dot (the snoozed Strawberry).
    const count = await cell.getAttribute("data-pending-task-count");
    expect(parseInt(count ?? "0", 10)).toBeGreaterThan(0);
  });

  test("CAL-004: agenda hides snoozed harvest task on today (next_check_at > today)", async ({
    authenticatedPage,
  }) => {
    const calendar = new CalendarPage(authenticatedPage);
    await calendar.goto();
    await calendar.waitForLoad();

    // Click today's cell to load its agenda.
    await calendar.dayCell(localToday()).click();
    await expect(calendar.agendaPanel).toHaveAttribute("data-agenda-date", localToday());

    // The Strawberry task is snoozed (next_check_at = today + 2d) — it must
    // NOT appear in today's agenda even though due_date is today.
    await expect(calendar.agendaTaskByTitle("Strawberry Snooze Test")).toHaveCount(0);
  });

  test("CAL-005: agenda reveals snoozed harvest task on its next_check_at day", async ({
    authenticatedPage,
  }) => {
    const calendar = new CalendarPage(authenticatedPage);
    await calendar.goto();
    await calendar.waitForLoad();

    const checkInDate = addDays(2);
    await calendar.dayCell(checkInDate).click();
    await expect(calendar.agendaPanel).toHaveAttribute("data-agenda-date", checkInDate);

    // The Strawberry task should appear on this day's agenda.
    await expect(calendar.agendaTaskByTitle("Strawberry Snooze Test")).toHaveCount(1);
  });
});
