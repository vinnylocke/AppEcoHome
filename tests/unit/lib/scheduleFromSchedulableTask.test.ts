import { describe, test, expect } from "vitest";
import {
  scheduleFromSchedulableTask,
  scheduleFromSchedulableTasks,
  enrichDescriptionWithSteps,
  flattenSectionsForCalendar,
  type SchedulableTask,
  type GuideStep,
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

  // ── wrap-around windows (bug-audit-2026-07-02 §4.2) ─────────────────
  test("Nov-Jan wrap window in June: due at 1 Nov, NOT active year-round", () => {
    // Today: 2026-06-15. Window Nov-Jan wraps the year boundary — plain
    // min/max used to collapse it to Jan..Dec and emit a "sow now" task
    // in midwinter.
    const today = new Date(2026, 5, 15);
    const out = scheduleFromSchedulableTask(
      mk({ active_months: ["Nov", "Dec", "Jan"] }),
      { today },
    );
    // 1 Nov 2026 is 139 days from 15 Jun 2026.
    expect(out.due_in_days).toBe(139);
    // End = 31 Jan 2027 = 91 days after 1 Nov 2026.
    expect(out.end_offset_days).toBe(91);
  });

  test("Nov-Jan wrap window in December: active now, ends 31 Jan next year", () => {
    const today = new Date(2026, 11, 10);
    const out = scheduleFromSchedulableTask(
      mk({ active_months: ["Nov", "Dec", "Jan"] }),
      { today },
    );
    expect(out.due_in_days).toBe(0);
    // 10 Dec 2026 -> 31 Jan 2027 = 52 days.
    expect(out.end_offset_days).toBe(52);
  });

  test("Nov-Jan wrap window in early January: active now, ends this month", () => {
    const today = new Date(2026, 0, 10);
    const out = scheduleFromSchedulableTask(
      mk({ active_months: ["Nov", "Dec", "Jan"] }),
      { today },
    );
    expect(out.due_in_days).toBe(0);
    // 10 Jan -> 31 Jan 2026 = 21 days.
    expect(out.end_offset_days).toBe(21);
  });

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

describe("enrichDescriptionWithSteps", () => {
  const steps: GuideStep[] = [
    { step: 1, title: "Take cutting", detail: "4–6 in below a leaf node." },
    { step: 2, title: "Strip leaves", detail: "Remove the bottom set." },
    { step: 3, title: "Plant up", detail: "Moist potting mix; cover with plastic." },
  ];

  test("no steps => task returned unchanged", () => {
    const original = mk({ description: "Existing desc." });
    expect(enrichDescriptionWithSteps(original, [])).toBe(original);
    expect(enrichDescriptionWithSteps(original, null)).toBe(original);
    expect(enrichDescriptionWithSteps(original, undefined)).toBe(original);
  });

  test("appends numbered checklist after the original description", () => {
    const out = enrichDescriptionWithSteps(mk({ description: "Take cuttings." }), steps);
    expect(out.description).toBe(
      "Take cuttings.\n\nHow to:\n" +
        "1. Take cutting — 4–6 in below a leaf node.\n" +
        "2. Strip leaves — Remove the bottom set.\n" +
        "3. Plant up — Moist potting mix; cover with plastic.",
    );
  });

  test("steps are sorted by step number before rendering", () => {
    const shuffled: GuideStep[] = [steps[2], steps[0], steps[1]];
    const out = enrichDescriptionWithSteps(mk({ description: "Do." }), shuffled);
    expect(out.description.split("\n").slice(3)).toEqual([
      "1. Take cutting — 4–6 in below a leaf node.",
      "2. Strip leaves — Remove the bottom set.",
      "3. Plant up — Moist potting mix; cover with plastic.",
    ]);
  });

  test("blank original description still emits the How-to header", () => {
    const out = enrichDescriptionWithSteps(mk({ description: "   " }), steps);
    expect(out.description.startsWith("How to:\n")).toBe(true);
  });

  test("non-description fields are preserved", () => {
    const out = enrichDescriptionWithSteps(
      mk({ title: "Take cuttings", task_type: "Maintenance" }),
      steps,
    );
    expect(out.title).toBe("Take cuttings");
    expect(out.task_type).toBe("Maintenance");
  });
});

describe("flattenSectionsForCalendar", () => {
  const stepsA: GuideStep[] = [
    { step: 1, title: "First", detail: "Do thing one." },
    { step: 2, title: "Second", detail: "Do thing two." },
  ];

  test("empty sections list => empty result", () => {
    expect(flattenSectionsForCalendar([])).toEqual([]);
  });

  test("section without schedulable_tasks is skipped", () => {
    expect(
      flattenSectionsForCalendar([{ schedulable_tasks: [], steps: stepsA }]),
    ).toEqual([]);
  });

  test("section with steps enriches first task only", () => {
    const tA = mk({ title: "Sow seeds", description: "Sow indoors." });
    const tB = mk({ title: "Transplant", description: "Move outside." });
    const out = flattenSectionsForCalendar([
      { schedulable_tasks: [tA, tB], steps: stepsA },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].description).toBe(
      "Sow indoors.\n\nHow to:\n1. First — Do thing one.\n2. Second — Do thing two.",
    );
    expect(out[1].description).toBe("Move outside.");
  });

  test("section without steps passes tasks through unchanged", () => {
    const tA = mk({ title: "Water", description: "Every 3 days." });
    const out = flattenSectionsForCalendar([
      { schedulable_tasks: [tA], steps: [] },
    ]);
    expect(out[0].description).toBe("Every 3 days.");
  });

  test("preserves section + intra-section order across multiple sections", () => {
    const sec1A = mk({ title: "1A" });
    const sec1B = mk({ title: "1B" });
    const sec2A = mk({ title: "2A" });
    const out = flattenSectionsForCalendar([
      { schedulable_tasks: [sec1A, sec1B], steps: [] },
      { schedulable_tasks: [sec2A], steps: [] },
    ]);
    expect(out.map((t) => t.title)).toEqual(["1A", "1B", "2A"]);
  });
});
