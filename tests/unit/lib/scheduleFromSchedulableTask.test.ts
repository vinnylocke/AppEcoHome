import { describe, test, expect } from "vitest";
import {
  scheduleFromSchedulableTask,
  scheduleFromSchedulableTasks,
  type SchedulableTask,
} from "../../../src/lib/scheduleFromSchedulableTask";

function mk(over: Partial<SchedulableTask> = {}): SchedulableTask {
  return {
    title: "Water Roma",
    description: "Deep water every 3 days during the growing season.",
    task_type: "Watering",
    is_recurring: true,
    frequency_days: 3,
    active_months: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
    duration_days: null,
    priority: "Medium",
    depends_on_index: null,
    ...over,
  };
}

describe("scheduleFromSchedulableTask", () => {
  // ── date math ────────────────────────────────────────────────────────
  test("active window in the future this year: due_in_days = days to first month start", () => {
    // Today: 2026-01-15. Window: Apr–Sep.
    const today = new Date(2026, 0, 15);
    const out = scheduleFromSchedulableTask(mk(), { today });
    // Apr 1, 2026 is 76 days from Jan 15, 2026
    expect(out.due_in_days).toBe(76);
    // End of Sep = Sep 30, 2026 = 152 days after Apr 1
    expect(out.end_offset_days).toBe(182);
  });

  test("active window already in progress: due_in_days = 0", () => {
    // Today: 2026-05-21 — May is inside Apr–Sep.
    const today = new Date(2026, 4, 21);
    const out = scheduleFromSchedulableTask(mk(), { today });
    expect(out.due_in_days).toBe(0);
    // From May 21 to Sep 30 = 132 days
    expect(out.end_offset_days).toBe(132);
  });

  test("active window already passed: wraps to next year", () => {
    // Today: 2026-12-15. Window: Mar–May.
    const today = new Date(2026, 11, 15);
    const out = scheduleFromSchedulableTask(
      mk({ active_months: ["Mar", "Apr", "May"] }),
      { today },
    );
    // Mar 1, 2027 is 76 days from Dec 15, 2026
    expect(out.due_in_days).toBe(76);
    // From Mar 1 to May 31 = 91 days
    expect(out.end_offset_days).toBe(91);
  });

  // ── recurrence + one-off ─────────────────────────────────────────────
  test("recurring task copies frequency_days through", () => {
    const out = scheduleFromSchedulableTask(mk({ frequency_days: 5 }), {
      today: new Date(2026, 4, 21),
    });
    expect(out.is_recurring).toBe(true);
    expect(out.frequency_days).toBe(5);
  });

  test("recurring task defaults frequency_days to 7 when AI omits it", () => {
    const out = scheduleFromSchedulableTask(mk({ frequency_days: null }), {
      today: new Date(2026, 4, 21),
    });
    expect(out.frequency_days).toBe(7);
  });

  test("one-off task sets frequency + end_offset to null", () => {
    const out = scheduleFromSchedulableTask(
      mk({
        is_recurring: false,
        frequency_days: null,
        active_months: ["Mar"],
        title: "Sow Roma seeds",
      }),
      { today: new Date(2026, 0, 15) },
    );
    expect(out.is_recurring).toBe(false);
    expect(out.frequency_days).toBeNull();
    expect(out.end_offset_days).toBeNull();
    // Mar 1 from Jan 15 = 45 days
    expect(out.due_in_days).toBe(45);
  });

  // ── year-round ───────────────────────────────────────────────────────
  test("null active_months => year-round; due in 0 days, default 365 end window for recurring", () => {
    const out = scheduleFromSchedulableTask(
      mk({ active_months: null, frequency_days: 14 }),
      { today: new Date(2026, 4, 21) },
    );
    expect(out.due_in_days).toBe(0);
    expect(out.end_offset_days).toBe(365);
  });

  test("12-month active_months is treated as year-round", () => {
    const allYear = [
      "Jan","Feb","Mar","Apr","May","Jun",
      "Jul","Aug","Sep","Oct","Nov","Dec",
    ];
    const out = scheduleFromSchedulableTask(
      mk({ active_months: allYear, duration_days: 120 }),
      { today: new Date(2026, 4, 21) },
    );
    expect(out.due_in_days).toBe(0);
    expect(out.end_offset_days).toBe(120);
  });

  test("duration_days overrides month-derived span when supplied", () => {
    const out = scheduleFromSchedulableTask(
      mk({
        active_months: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"],
        duration_days: 60,
      }),
      { today: new Date(2026, 4, 21) },
    );
    expect(out.end_offset_days).toBe(60);
  });

  // ── task type validation ─────────────────────────────────────────────
  test("known task types pass through verbatim", () => {
    for (const t of [
      "Watering","Pruning","Harvesting","Planting",
      "Maintenance","Fertilizing","Inspection",
    ]) {
      const out = scheduleFromSchedulableTask(mk({ task_type: t }), {
        today: new Date(2026, 4, 21),
      });
      expect(out.task_type).toBe(t);
    }
  });

  test("unknown task type falls back to Maintenance", () => {
    const out = scheduleFromSchedulableTask(mk({ task_type: "Sowing" as any }), {
      today: new Date(2026, 4, 21),
    });
    expect(out.task_type).toBe("Maintenance");
  });

  // ── depends_on_index ─────────────────────────────────────────────────
  test("depends_on_index only carried through on one-off tasks", () => {
    const one = scheduleFromSchedulableTask(
      mk({ is_recurring: false, depends_on_index: 2 }),
      { today: new Date(2026, 4, 21) },
    );
    expect(one.depends_on_index).toBe(2);

    const rec = scheduleFromSchedulableTask(
      mk({ is_recurring: true, depends_on_index: 2 }),
      { today: new Date(2026, 4, 21) },
    );
    expect(rec.depends_on_index).toBeNull();
  });

  // ── pass-throughs ────────────────────────────────────────────────────
  test("title + description copied", () => {
    const out = scheduleFromSchedulableTask(
      mk({ title: "Pinch side shoots", description: "Weekly during summer." }),
      { today: new Date(2026, 4, 21) },
    );
    expect(out.title).toBe("Pinch side shoots");
    expect(out.description).toBe("Weekly during summer.");
  });

  // ── bulk helper ──────────────────────────────────────────────────────
  test("scheduleFromSchedulableTasks preserves order", () => {
    const out = scheduleFromSchedulableTasks(
      [
        mk({ title: "A" }),
        mk({ title: "B" }),
        mk({ title: "C" }),
      ],
      { today: new Date(2026, 4, 21) },
    );
    expect(out.map((t) => t.title)).toEqual(["A", "B", "C"]);
  });

  // ── malformed input ──────────────────────────────────────────────────
  test("ignores invalid month abbreviations", () => {
    const out = scheduleFromSchedulableTask(
      mk({ active_months: ["Mar", "NotAMonth", "May"] as any }),
      { today: new Date(2026, 0, 15) },
    );
    // Only Mar + May remain; window Mar→May; start Mar 1
    // Jan 15 → Mar 1 = 45 days
    expect(out.due_in_days).toBe(45);
  });
});
