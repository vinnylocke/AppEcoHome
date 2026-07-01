import { describe, it, expect } from "vitest";
import { isTaskVisibleOnDate, isTaskOverdueToday } from "../../../src/lib/taskFilters";

const TODAY = "2026-06-15";
const YESTERDAY = "2026-06-14";
const TOMORROW = "2026-06-16";
const IN_3_DAYS = "2026-06-18";
const WEEK_AHEAD = "2026-06-22";
const PAST_WEEK = "2026-06-08";

describe("isTaskVisibleOnDate — non-window tasks", () => {
  it("shows a task due today", () => {
    expect(isTaskVisibleOnDate({ status: "Pending", due_date: TODAY }, TODAY)).toBe(true);
  });

  it("hides a task due tomorrow when not requesting overdue carry-in", () => {
    expect(isTaskVisibleOnDate({ status: "Pending", due_date: TOMORROW }, TODAY)).toBe(false);
  });

  it("includes overdue tasks when includeOverdue=true (the today-list case)", () => {
    expect(
      isTaskVisibleOnDate({ status: "Pending", due_date: YESTERDAY }, TODAY, { includeOverdue: true }),
    ).toBe(true);
  });

  it("HIDES a task that's been snoozed forward (next_check_at > today)", () => {
    expect(
      isTaskVisibleOnDate(
        { status: "Pending", due_date: YESTERDAY, next_check_at: IN_3_DAYS },
        TODAY,
        { includeOverdue: true },
      ),
    ).toBe(false);
  });

  it("REVEALS the snoozed task once today reaches next_check_at", () => {
    expect(
      isTaskVisibleOnDate(
        { status: "Pending", due_date: YESTERDAY, next_check_at: IN_3_DAYS },
        IN_3_DAYS,
        { includeOverdue: true },
      ),
    ).toBe(true);
  });

  it("counts a snoozed-to-today task as 'due today' (effective due = next_check_at)", () => {
    // User snoozed yesterday's task forward by 1 day → it should resurface
    // on today's strict "due today" list, not just the overdue carry-in.
    expect(
      isTaskVisibleOnDate(
        { status: "Pending", due_date: YESTERDAY, next_check_at: TODAY },
        TODAY,
      ),
    ).toBe(true);
  });

  it("never shows a Skipped task", () => {
    expect(
      isTaskVisibleOnDate({ status: "Skipped", due_date: TODAY }, TODAY, { includeOverdue: true }),
    ).toBe(false);
  });
});

describe("isTaskVisibleOnDate — harvest-window tasks", () => {
  it("shows a harvest task on its due_date when window starts today", () => {
    expect(
      isTaskVisibleOnDate(
        { status: "Pending", due_date: TODAY, window_end_date: WEEK_AHEAD },
        TODAY,
      ),
    ).toBe(true);
  });

  it("shows a harvest task on every day inside its window", () => {
    expect(
      isTaskVisibleOnDate(
        { status: "Pending", due_date: YESTERDAY, window_end_date: WEEK_AHEAD },
        TOMORROW,
      ),
    ).toBe(true);
  });

  it("HIDES the original due_date and snooze window when 'Not yet → 3 days' shifts next_check_at", () => {
    // User snoozed today's harvest forward by 3 days. Today + the next 2 days
    // should hide the task; day 3 reveals it again, days 4-7 keep it visible.
    const task = {
      status: "Pending",
      due_date: TODAY,
      next_check_at: IN_3_DAYS,
      window_end_date: WEEK_AHEAD,
    };
    expect(isTaskVisibleOnDate(task, TODAY)).toBe(false);
    expect(isTaskVisibleOnDate(task, TOMORROW)).toBe(false);
    expect(isTaskVisibleOnDate(task, IN_3_DAYS)).toBe(true);
    expect(isTaskVisibleOnDate(task, WEEK_AHEAD)).toBe(true);
  });

  it("hides a harvest task once today is past window_end_date", () => {
    expect(
      isTaskVisibleOnDate(
        { status: "Pending", due_date: PAST_WEEK, window_end_date: YESTERDAY },
        TODAY,
      ),
    ).toBe(false);
  });
});

describe("isTaskOverdueToday", () => {
  it("counts a normal task with due_date in the past", () => {
    expect(isTaskOverdueToday({ status: "Pending", due_date: YESTERDAY }, TODAY)).toBe(true);
  });

  it("does NOT count a task due today", () => {
    expect(isTaskOverdueToday({ status: "Pending", due_date: TODAY }, TODAY)).toBe(false);
  });

  it("does NOT count a snoozed task whose next_check_at is in the future", () => {
    expect(
      isTaskOverdueToday(
        { status: "Pending", due_date: YESTERDAY, next_check_at: IN_3_DAYS },
        TODAY,
      ),
    ).toBe(false);
  });

  it("does NOT count a harvest still inside its window", () => {
    expect(
      isTaskOverdueToday(
        { status: "Pending", due_date: YESTERDAY, window_end_date: WEEK_AHEAD },
        TODAY,
      ),
    ).toBe(false);
  });

  it("counts a harvest whose window has closed", () => {
    expect(
      isTaskOverdueToday(
        { status: "Pending", due_date: PAST_WEEK, window_end_date: YESTERDAY },
        TODAY,
      ),
    ).toBe(true);
  });

  it("does NOT count Completed or Skipped tasks", () => {
    expect(
      isTaskOverdueToday({ status: "Completed", due_date: YESTERDAY }, TODAY),
    ).toBe(false);
    expect(
      isTaskOverdueToday({ status: "Skipped", due_date: YESTERDAY }, TODAY),
    ).toBe(false);
  });
});

// RHO-3: the Daily Brief "Overdue" chip now feeds the same rows this helper
// filters (home-scoped, not location-scoped). The helper is location-agnostic —
// it never inspects a location_id — so a home/personal-scoped task with no
// location still counts. These cases lock that contract in place so the chip
// and the ghost-aware task list agree.
describe("isTaskOverdueToday — RHO-3 chip/list parity", () => {
  it("counts an overdue home/personal-scoped task (no location fields present)", () => {
    // The row the chip query returns has no location_id at all; the helper
    // must still flag it as overdue purely on the due_date.
    expect(isTaskOverdueToday({ status: "Pending", due_date: YESTERDAY }, TODAY)).toBe(true);
  });

  it("filtering an array yields the same count the list would show", () => {
    const rows = [
      { status: "Pending", due_date: YESTERDAY },                                   // overdue
      { status: "Pending", due_date: PAST_WEEK },                                   // overdue
      { status: "Pending", due_date: TODAY },                                       // due today — not overdue
      { status: "Pending", due_date: YESTERDAY, next_check_at: IN_3_DAYS },         // snoozed forward — not overdue
      { status: "Pending", due_date: YESTERDAY, window_end_date: WEEK_AHEAD },      // still in harvest window — not overdue
      { status: "Completed", due_date: PAST_WEEK },                                 // done — not overdue
    ];
    const count = rows.filter((t) => isTaskOverdueToday(t, TODAY)).length;
    expect(count).toBe(2);
  });
});
