import { describe, test, expect } from "vitest";
import { formatDisplayDate, getLocalDateString } from "../../../src/lib/dateUtils";

// ---- getLocalDateString ----
// Converts a JS Date to "YYYY-MM-DD" using local calendar (not UTC).

describe("getLocalDateString", () => {
  test("formats a date correctly", () => {
    expect(getLocalDateString(new Date(2026, 4, 1))).toBe("2026-05-01"); // month is 0-indexed
  });

  test("pads single-digit month and day with zeros", () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  test("handles end-of-year date", () => {
    expect(getLocalDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

// ---- formatDisplayDate ----
// Converts "YYYY-MM-DD" to a human-readable locale string like "May 1, 2026".

describe("formatDisplayDate", () => {
  test("returns a non-empty string for a valid date", () => {
    const result = formatDisplayDate("2026-05-01");
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  test("output contains the year", () => {
    expect(formatDisplayDate("2026-05-01")).toContain("2026");
  });

  test("output contains the day number", () => {
    // Day 15 should appear somewhere in the formatted string
    expect(formatDisplayDate("2026-05-15")).toMatch(/15/);
  });

  test("returns empty string for empty input", () => {
    expect(formatDisplayDate("")).toBe("");
  });

  test("different months produce different output", () => {
    const may = formatDisplayDate("2026-05-01");
    const december = formatDisplayDate("2026-12-01");
    expect(may).not.toBe(december);
  });
});
