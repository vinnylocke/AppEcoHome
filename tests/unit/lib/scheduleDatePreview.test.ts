import { describe, test, expect } from "vitest";
import { getNextOccurrences, formatPreviewLine } from "../../../src/lib/scheduleDatePreview";

describe("getNextOccurrences", () => {
  test("returns the start date as the first occurrence", () => {
    const r = getNextOccurrences({ startDate: "2026-06-15", frequencyDays: 7 });
    expect(r.dates[0]).toBe("2026-06-15");
  });

  test("advances by frequencyDays for each subsequent occurrence", () => {
    const r = getNextOccurrences({
      startDate: "2026-06-15",
      frequencyDays: 4,
      count: 3,
    });
    expect(r.dates).toEqual(["2026-06-15", "2026-06-19", "2026-06-23"]);
    expect(r.truncatedByEndDate).toBe(false);
  });

  test("defaults to 3 occurrences", () => {
    const r = getNextOccurrences({ startDate: "2026-06-15", frequencyDays: 1 });
    expect(r.dates).toHaveLength(3);
  });

  test("respects a custom count", () => {
    const r = getNextOccurrences({
      startDate: "2026-06-15",
      frequencyDays: 7,
      count: 5,
    });
    expect(r.dates).toHaveLength(5);
  });

  test("clamps frequency to at least 1 day", () => {
    const zero = getNextOccurrences({
      startDate: "2026-06-15",
      frequencyDays: 0,
      count: 3,
    });
    expect(zero.dates).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"]);

    const neg = getNextOccurrences({
      startDate: "2026-06-15",
      frequencyDays: -5,
      count: 3,
    });
    expect(neg.dates).toEqual(["2026-06-15", "2026-06-16", "2026-06-17"]);
  });

  test("returns empty when startDate is malformed", () => {
    expect(getNextOccurrences({ startDate: "not-a-date", frequencyDays: 7 }).dates).toEqual([]);
    expect(getNextOccurrences({ startDate: "", frequencyDays: 7 }).dates).toEqual([]);
  });

  test("truncates at the end date", () => {
    const r = getNextOccurrences({
      startDate: "2026-06-15",
      frequencyDays: 7,
      count: 5,
      endDate: "2026-07-01",
    });
    // 2026-06-15, 2026-06-22, 2026-06-29 → next would be 2026-07-06 which is past end_date
    expect(r.dates).toEqual(["2026-06-15", "2026-06-22", "2026-06-29"]);
    expect(r.truncatedByEndDate).toBe(true);
  });

  test("does not crash on month boundary", () => {
    const r = getNextOccurrences({
      startDate: "2026-01-30",
      frequencyDays: 3,
      count: 3,
    });
    expect(r.dates).toEqual(["2026-01-30", "2026-02-02", "2026-02-05"]);
  });

  test("crosses a year boundary cleanly", () => {
    const r = getNextOccurrences({
      startDate: "2026-12-30",
      frequencyDays: 5,
      count: 3,
    });
    expect(r.dates).toEqual(["2026-12-30", "2027-01-04", "2027-01-09"]);
  });
});

describe("formatPreviewLine", () => {
  test("joins formatted dates with bullet separator", () => {
    const out = formatPreviewLine(["2026-06-15", "2026-06-22"]);
    expect(out).toContain("·");
    expect(out.split("·")).toHaveLength(2);
  });

  test("handles empty input", () => {
    expect(formatPreviewLine([])).toBe("");
  });
});
