import { describe, it, expect } from "vitest";
import {
  classifySowingActivity,
  sowingCalendarFromGrowGuide,
  activityLabel,
} from "../../../src/lib/sowingCalendarFromGrowGuide";
import type { SchedulableTask } from "../../../src/lib/scheduleFromSchedulableTask";

function makeTask(overrides: Partial<SchedulableTask> = {}): SchedulableTask {
  return {
    title: "",
    description: "",
    task_type: "Planting",
    is_recurring: false,
    frequency_days: null,
    active_months: null,
    duration_days: null,
    priority: "Medium",
    depends_on_index: null,
    ...overrides,
  };
}

describe("classifySowingActivity", () => {
  it("returns null when nothing sowing-related appears", () => {
    expect(
      classifySowingActivity(
        makeTask({ title: "Check trays for mould", description: "Inspect daily." }),
      ),
    ).toBeNull();
  });

  it("classifies indoor sowings via title keyword", () => {
    expect(
      classifySowingActivity(
        makeTask({ title: "Sow indoors", description: "Use module trays." }),
      ),
    ).toBe("sow_indoors");
  });

  it("classifies indoor sowings via the 'seed tray' keyword", () => {
    expect(
      classifySowingActivity(
        makeTask({ title: "Start seeds", description: "Fill a seed tray." }),
      ),
    ).toBe("sow_indoors");
  });

  it("classifies direct sowings", () => {
    expect(
      classifySowingActivity(
        makeTask({ title: "Direct sow outdoors", description: "Once frost has passed." }),
      ),
    ).toBe("sow_direct");
  });

  it("classifies 'sow in situ' as direct sow", () => {
    expect(
      classifySowingActivity(
        makeTask({ title: "Sow in situ", description: "Scatter and rake in." }),
      ),
    ).toBe("sow_direct");
  });

  it("classifies transplant out before any other match", () => {
    // Mentions 'sow' in the description but the title is clearly a plant-out.
    expect(
      classifySowingActivity(
        makeTask({
          title: "Transplant out",
          description: "Move indoor-sown seedlings into beds.",
        }),
      ),
    ).toBe("transplant_out");
  });

  it("classifies hardening off as transplant_out", () => {
    expect(
      classifySowingActivity(
        makeTask({ title: "Harden off", description: "Gradually acclimatise to outdoors." }),
      ),
    ).toBe("transplant_out");
  });

  it("falls back to indoor sowing on bare 'sow'", () => {
    expect(
      classifySowingActivity(
        makeTask({ title: "Sow seeds", description: "After last frost." }),
      ),
    ).toBe("sow_indoors");
  });
});

describe("sowingCalendarFromGrowGuide", () => {
  it("returns empty when guide is null", () => {
    expect(sowingCalendarFromGrowGuide(null)).toEqual([]);
  });

  it("returns empty when guide has no sections", () => {
    expect(sowingCalendarFromGrowGuide({})).toEqual([]);
  });

  it("ignores sections that aren't propagation or germination", () => {
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "water",
          schedulable_tasks: [
            makeTask({ title: "Sow indoors", active_months: ["Mar"] }),
          ],
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("ignores sections marked not applicable", () => {
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "propagation",
          applicable: false,
          schedulable_tasks: [
            makeTask({ title: "Sow indoors", active_months: ["Mar"] }),
          ],
        },
      ],
    });
    expect(out).toEqual([]);
  });

  it("extracts one band per classifiable schedulable task", () => {
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "propagation",
          applicable: true,
          schedulable_tasks: [
            makeTask({ title: "Sow indoors", active_months: ["Feb", "Mar"] }),
            makeTask({ title: "Direct sow", active_months: ["May", "Jun"] }),
            makeTask({ title: "Transplant out", active_months: ["Apr", "May"] }),
            makeTask({ title: "Top up vermiculite", description: "Cover seeds." }),
          ],
        },
      ],
    });
    expect(out.length).toBe(3);
    expect(out.map((b) => b.activity)).toEqual([
      "sow_indoors",
      "sow_direct",
      "transplant_out",
    ]);
  });

  it("merges propagation + germination sections", () => {
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "propagation",
          schedulable_tasks: [makeTask({ title: "Sow indoors", active_months: ["Mar"] })],
        },
        {
          category: "germination",
          schedulable_tasks: [
            makeTask({ title: "Transplant out", active_months: ["May"] }),
          ],
        },
      ],
    });
    expect(out.length).toBe(2);
    expect(out.map((b) => b.section).sort()).toEqual([
      "germination",
      "propagation",
    ]);
  });

  it("converts active_months strings to 0-indexed numbers", () => {
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "propagation",
          schedulable_tasks: [
            makeTask({ title: "Sow indoors", active_months: ["Jan", "Feb", "Mar"] }),
          ],
        },
      ],
    });
    expect(out[0].months).toEqual([0, 1, 2]);
  });

  it("sorts bands by activity then first active month", () => {
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "propagation",
          schedulable_tasks: [
            makeTask({ title: "Transplant out late", active_months: ["Jun"] }),
            makeTask({ title: "Sow indoors early", active_months: ["Jan"] }),
            makeTask({ title: "Direct sow", active_months: ["Apr"] }),
            makeTask({ title: "Sow indoors late", active_months: ["Mar"] }),
          ],
        },
      ],
    });
    // Indoor sowings sorted by first active month, then direct, then transplant.
    expect(out.map((b) => b.label)).toEqual([
      "Sow indoors",
      "Sow indoors",
      "Direct sow",
      "Transplant out",
    ]);
    expect(out[0].months[0]).toBe(0);
    expect(out[1].months[0]).toBe(2);
  });

  it("preserves the source task on every band so the UI can re-add to calendar", () => {
    const sourceTask = makeTask({
      title: "Sow indoors",
      active_months: ["Mar"],
      task_type: "Planting",
      description: "Use module trays with seed compost.",
    });
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "propagation",
          schedulable_tasks: [sourceTask],
        },
      ],
    });
    expect(out[0].sourceTask).toEqual(sourceTask);
  });

  it("handles tasks with no active_months by emitting an empty months array", () => {
    const out = sowingCalendarFromGrowGuide({
      sections: [
        {
          category: "propagation",
          schedulable_tasks: [makeTask({ title: "Sow indoors", active_months: null })],
        },
      ],
    });
    expect(out.length).toBe(1);
    expect(out[0].months).toEqual([]);
  });

  it("activityLabel returns the friendly verb", () => {
    expect(activityLabel("sow_indoors")).toBe("Sow indoors");
    expect(activityLabel("sow_direct")).toBe("Direct sow");
    expect(activityLabel("transplant_out")).toBe("Transplant out");
  });
});
