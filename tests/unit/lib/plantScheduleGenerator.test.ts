import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildBlueprintFromSchedule } from "../../../src/lib/plantScheduleGenerator";

const TODAY_FIXED = "2026-05-15";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY_FIXED}T12:00:00Z`));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildBlueprintFromSchedule — simple trigger-relative schedules", () => {
  it("starts on the trigger date when no offset and no seasonal reference", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 0,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 7,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Perennial",
      targetYear: 2026,
    });
    expect(result.start_date).toBe(TODAY_FIXED);
    expect(result.end_date).toBeNull();
  });

  it("applies start_offset_days to the trigger date", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 14,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 7,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Perennial",
      targetYear: 2026,
    });
    expect(result.start_date).toBe("2026-05-29");
  });
});

describe("buildBlueprintFromSchedule — past trigger date floors to today", () => {
  it("rolls forward past trigger dates to the first future occurrence", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 0,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 7,
      },
      triggerDateStr: "2026-05-01", // 14 days ago
      plantCycle: "Perennial",
      targetYear: 2026,
    });
    // Floor is today (2026-05-15). 14 days past trigger → ceil(14/7)=2 periods.
    // 2026-05-01 + 2 * 7 = 2026-05-15 — exactly today.
    expect(result.start_date).toBe(TODAY_FIXED);
  });
});

describe("buildBlueprintFromSchedule — seasonal references", () => {
  it("starts on the seasonal date when start_reference is Seasonal", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Seasonal:06-21:Summer Harvest Start",
        start_offset_days: 0,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 7,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Perennial",
      targetYear: 2026,
    });
    expect(result.start_date).toBe("2026-06-21");
  });

  it("rolls end-of-window into next year when end is before start (same year)", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Seasonal:09-01:Autumn Harvest Start",
        start_offset_days: 0,
        end_reference: "Seasonal:02-15:Spring Harvest End",
        end_offset_days: 0,
        frequency_days: 14,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Perennial",
      targetYear: 2026,
    });
    expect(result.start_date).toBe("2026-09-01");
    // End is 2026-02-15 + 365 days → 2027-02-15.
    expect(result.end_date).toBe("2027-02-15");
  });
});

describe("buildBlueprintFromSchedule — lifecycle caps", () => {
  it("caps end_date at +365 days for annuals", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 0,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 7,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Annual",
      targetYear: 2026,
    });
    expect(result.start_date).toBe(TODAY_FIXED);
    expect(result.end_date).toBe("2027-05-15");
  });

  it("caps end_date at two calendar years for biennials (leap-day safe)", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 0,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 14,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Biennial",
      targetYear: 2026,
    });
    expect(result.end_date).toBe("2028-05-15");
  });

  it("does not cap perennials", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 0,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 7,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Perennial",
      targetYear: 2026,
    });
    expect(result.end_date).toBeNull();
  });

  it("returns nulls when start is past the lifecycle cap", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 400, // past the 365-day annual cap
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 7,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: "Annual",
      targetYear: 2026,
    });
    expect(result.start_date).toBeNull();
    expect(result.end_date).toBeNull();
  });
});

describe("buildBlueprintFromSchedule — lifecycle → recurrence_kind (Track B)", () => {
  const base = {
    schedule: {
      start_reference: "Seasonal:06-01:Summer Harvest Start",
      start_offset_days: 0,
      end_reference: "Seasonal:08-31:Summer Harvest End",
      end_offset_days: 0,
      frequency_days: 1,
    },
    triggerDateStr: TODAY_FIXED,
    targetYear: 2026,
  };

  it("perennial → recurs every year ('annual', no cap)", () => {
    const r = buildBlueprintFromSchedule({ ...base, plantCycle: "Perennial" });
    expect(r.recurrence_kind).toBe("annual");
    expect(r.recurs_until).toBeNull();
  });

  it("annual → single cycle ('once')", () => {
    const r = buildBlueprintFromSchedule({ ...base, plantCycle: "Annual" });
    expect(r.recurrence_kind).toBe("once");
    expect(r.recurs_until).toBeNull();
  });

  it("biennial → 'lifecycle_capped' with recurs_until = first window + 1 year (exactly 2 windows)", () => {
    // Summer window starts 2026-06-01; 2 windows (2026, 2027) → cap 2027-06-01.
    const r = buildBlueprintFromSchedule({ ...base, plantCycle: "Biennial" });
    expect(r.recurrence_kind).toBe("lifecycle_capped");
    expect(r.recurs_until).toBe("2027-06-01");
  });

  it("null / unknown cycle → 'once' (safe default)", () => {
    expect(buildBlueprintFromSchedule({ ...base, plantCycle: null }).recurrence_kind).toBe("once");
    expect(buildBlueprintFromSchedule({ ...base, plantCycle: "Herbaceous" }).recurrence_kind).toBe("once");
  });

  it("matches lifecycle case-insensitively and by substring (e.g. 'Perennial herb')", () => {
    expect(buildBlueprintFromSchedule({ ...base, plantCycle: "perennial" }).recurrence_kind).toBe("annual");
    expect(buildBlueprintFromSchedule({ ...base, plantCycle: "Perennial herb" }).recurrence_kind).toBe("annual");
  });
});

describe("buildBlueprintFromSchedule — frequency / null handling", () => {
  it("handles null offsets as zero", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: null,
        end_reference: "Ongoing",
        end_offset_days: null,
        frequency_days: 7,
      },
      triggerDateStr: TODAY_FIXED,
      plantCycle: null,
      targetYear: 2026,
    });
    expect(result.start_date).toBe(TODAY_FIXED);
    expect(result.end_date).toBeNull();
  });

  it("handles zero or negative frequency by clamping to 1 day", () => {
    const result = buildBlueprintFromSchedule({
      schedule: {
        start_reference: "Trigger Date",
        start_offset_days: 0,
        end_reference: "Ongoing",
        end_offset_days: 0,
        frequency_days: 0,
      },
      triggerDateStr: "2026-05-10", // 5 days ago
      plantCycle: "Perennial",
      targetYear: 2026,
    });
    // freq clamped to 1 → 5 periods → 2026-05-10 + 5 days = 2026-05-15.
    expect(result.start_date).toBe(TODAY_FIXED);
  });
});
