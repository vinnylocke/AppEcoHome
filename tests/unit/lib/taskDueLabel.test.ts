import { describe, test, expect } from "vitest";
import { taskDueLabel, type TaskDueLabelInput } from "../../../src/lib/taskDueLabel";

// A pending, non-overdue, non-window baseline; each test overrides what it needs.
const base: TaskDueLabelInput = {
  dueDate: "2026-07-20",
  windowEndDate: null,
  todayStr: "2026-07-20",
  isCompleted: false,
  isOverdue: false,
  isInHarvestWindow: false,
  hasOverdueChip: false,
};

describe("taskDueLabel — the relative due label (B2)", () => {
  test("completed tasks get no label", () => {
    expect(taskDueLabel({ ...base, isCompleted: true, isOverdue: true })).toBeNull();
  });

  test("'due today' is intentionally suppressed (implied on a today-scoped list)", () => {
    expect(taskDueLabel({ ...base, dueDate: "2026-07-20", todayStr: "2026-07-20" })).toBeNull();
  });

  test("overdue reads as 'Overdue · was due <date>' (fills the colour-only gap)", () => {
    expect(
      taskDueLabel({ ...base, isOverdue: true, dueDate: "2026-07-16", todayStr: "2026-07-20" }),
    ).toBe("Overdue · was due Jul 16, 2026");
  });

  test("overdue prefers the window end date when present", () => {
    expect(
      taskDueLabel({
        ...base,
        isOverdue: true,
        dueDate: "2026-07-10",
        windowEndDate: "2026-07-15",
        todayStr: "2026-07-20",
      }),
    ).toBe("Overdue · was due Jul 15, 2026");
  });

  test("overdue is suppressed when the calendar's own 'Overdue since' chip is shown", () => {
    expect(
      taskDueLabel({ ...base, isOverdue: true, hasOverdueChip: true, dueDate: "2026-07-16" }),
    ).toBeNull();
  });

  test("a harvest window in progress shows when it closes", () => {
    expect(
      taskDueLabel({ ...base, isInHarvestWindow: true, windowEndDate: "2026-07-25" }),
    ).toBe("Window open · closes Jul 25, 2026");
  });

  test("tomorrow reads as 'Due tomorrow'", () => {
    expect(taskDueLabel({ ...base, dueDate: "2026-07-21", todayStr: "2026-07-20" })).toBe(
      "Due tomorrow",
    );
  });

  test("2–6 days out reads as 'Due in N days'", () => {
    expect(taskDueLabel({ ...base, dueDate: "2026-07-23", todayStr: "2026-07-20" })).toBe(
      "Due in 3 days",
    );
  });

  test("beyond a week falls back to the formatted date", () => {
    expect(taskDueLabel({ ...base, dueDate: "2026-08-05", todayStr: "2026-07-20" })).toBe(
      "Due Aug 5, 2026",
    );
  });

  test("no due date and not today-scoped → no label", () => {
    expect(taskDueLabel({ ...base, dueDate: null })).toBeNull();
  });
});
