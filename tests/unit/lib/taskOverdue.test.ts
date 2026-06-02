import { describe, test, expect } from "vitest";
import {
  isTaskOverdue,
  isInsideHarvestWindow,
  daysLeftInWindow,
  collectHarvestWindowDates,
} from "../../../src/lib/taskEngine";

// ──────────────────────────────────────────────────────────────────────────
// isTaskOverdue — non-window vs window semantics
// ──────────────────────────────────────────────────────────────────────────

describe("isTaskOverdue — non-window task", () => {
  test("pending task with past due_date is overdue", () => {
    expect(
      isTaskOverdue({ status: "Pending", due_date: "2026-05-01" }, "2026-06-02"),
    ).toBe(true);
  });

  test("pending task with today's due_date is NOT overdue", () => {
    expect(
      isTaskOverdue({ status: "Pending", due_date: "2026-06-02" }, "2026-06-02"),
    ).toBe(false);
  });

  test("pending task with future due_date is NOT overdue", () => {
    expect(
      isTaskOverdue({ status: "Pending", due_date: "2026-06-10" }, "2026-06-02"),
    ).toBe(false);
  });

  test("completed task is never overdue", () => {
    expect(
      isTaskOverdue({ status: "Completed", due_date: "2026-01-01" }, "2026-06-02"),
    ).toBe(false);
  });

  test("skipped task is never overdue", () => {
    expect(
      isTaskOverdue({ status: "Skipped", due_date: "2026-01-01" }, "2026-06-02"),
    ).toBe(false);
  });

  test("task with no due_date is not overdue", () => {
    expect(isTaskOverdue({ status: "Pending", due_date: null }, "2026-06-02")).toBe(false);
  });
});

describe("isTaskOverdue — window task (Harvesting)", () => {
  const inWindow = {
    status: "Pending",
    due_date: "2026-06-01",
    window_end_date: "2026-09-30",
  };
  const closedWindow = {
    status: "Pending",
    due_date: "2026-06-01",
    window_end_date: "2026-06-30",
  };

  test("inside window — not overdue even though due_date is in the past", () => {
    expect(isTaskOverdue(inWindow, "2026-07-15")).toBe(false);
  });

  test("on the last day of the window — not overdue", () => {
    expect(isTaskOverdue(inWindow, "2026-09-30")).toBe(false);
  });

  test("day after window close — overdue", () => {
    expect(isTaskOverdue(closedWindow, "2026-07-01")).toBe(true);
  });

  test("far past window close — overdue", () => {
    expect(isTaskOverdue(closedWindow, "2026-12-25")).toBe(true);
  });

  test("completed window task — not overdue", () => {
    expect(
      isTaskOverdue({ ...closedWindow, status: "Completed" }, "2026-12-25"),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// isInsideHarvestWindow
// ──────────────────────────────────────────────────────────────────────────

describe("isInsideHarvestWindow", () => {
  const task = { due_date: "2026-06-01", window_end_date: "2026-09-30" };

  test("today equals window start", () => {
    expect(isInsideHarvestWindow(task, "2026-06-01")).toBe(true);
  });

  test("today equals window end", () => {
    expect(isInsideHarvestWindow(task, "2026-09-30")).toBe(true);
  });

  test("today mid-window", () => {
    expect(isInsideHarvestWindow(task, "2026-07-15")).toBe(true);
  });

  test("today before window start", () => {
    expect(isInsideHarvestWindow(task, "2026-05-31")).toBe(false);
  });

  test("today past window end", () => {
    expect(isInsideHarvestWindow(task, "2026-10-01")).toBe(false);
  });

  test("non-window task always false", () => {
    expect(
      isInsideHarvestWindow({ due_date: "2026-06-01", window_end_date: null }, "2026-06-15"),
    ).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// daysLeftInWindow
// ──────────────────────────────────────────────────────────────────────────

describe("daysLeftInWindow", () => {
  const task = { window_end_date: "2026-06-10" };

  test("returns 0 on the last day", () => {
    expect(daysLeftInWindow(task, "2026-06-10")).toBe(0);
  });

  test("returns positive days before end", () => {
    expect(daysLeftInWindow(task, "2026-06-05")).toBe(5);
  });

  test("returns negative when past end", () => {
    expect(daysLeftInWindow(task, "2026-06-15")).toBe(-5);
  });

  test("returns null for non-window tasks", () => {
    expect(daysLeftInWindow({ window_end_date: null }, "2026-06-05")).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// collectHarvestWindowDates — the set used by the calendar to tint cells
// ──────────────────────────────────────────────────────────────────────────

describe("collectHarvestWindowDates", () => {
  test("empty list → empty set", () => {
    expect(collectHarvestWindowDates([]).size).toBe(0);
  });

  test("single 3-day window emits every day inclusive", () => {
    const set = collectHarvestWindowDates([
      { status: "Pending", due_date: "2026-06-01", window_end_date: "2026-06-03" },
    ]);
    expect(set.size).toBe(3);
    expect(set.has("2026-06-01")).toBe(true);
    expect(set.has("2026-06-02")).toBe(true);
    expect(set.has("2026-06-03")).toBe(true);
  });

  test("two overlapping windows deduplicate dates", () => {
    const set = collectHarvestWindowDates([
      { status: "Pending", due_date: "2026-06-01", window_end_date: "2026-06-05" }, // 5 days
      { status: "Pending", due_date: "2026-06-04", window_end_date: "2026-06-08" }, // 5 days, overlaps 2
    ]);
    // Union should be 2026-06-01 through 2026-06-08 = 8 days.
    expect(set.size).toBe(8);
  });

  test("ignores tasks without window_end_date", () => {
    const set = collectHarvestWindowDates([
      { status: "Pending", due_date: "2026-06-01", window_end_date: null },
      { status: "Pending", due_date: "2026-06-10", window_end_date: undefined as any },
    ]);
    expect(set.size).toBe(0);
  });

  test("ignores completed / skipped tasks", () => {
    const set = collectHarvestWindowDates([
      { status: "Completed", due_date: "2026-06-01", window_end_date: "2026-06-05" },
      { status: "Skipped", due_date: "2026-07-01", window_end_date: "2026-07-05" },
    ]);
    expect(set.size).toBe(0);
  });

  test("end before start is skipped (bad data)", () => {
    const set = collectHarvestWindowDates([
      { status: "Pending", due_date: "2026-09-30", window_end_date: "2026-06-01" },
    ]);
    expect(set.size).toBe(0);
  });

  test("bounded at 400 days per window (data safety)", () => {
    const set = collectHarvestWindowDates([
      { status: "Pending", due_date: "2026-01-01", window_end_date: "2099-01-01" },
    ]);
    expect(set.size).toBeLessThanOrEqual(400);
  });
});
