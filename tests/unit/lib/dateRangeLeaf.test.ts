import { describe, it, expect } from "vitest";
import {
  mmddOf, formatMmDd, mmddToInput, inputToMmdd, seasonPreset, hemisphereForHome,
  splitMmDd, makeMmDd, daysInMonth,
} from "../../../src/lib/dateRangeLeaf";

describe("dateRangeLeaf", () => {
  it("mmddOf zero-pads month/day", () => {
    expect(mmddOf(new Date(2026, 0, 9))).toBe("01-09"); // 9 Jan
    expect(mmddOf(new Date(2026, 11, 25))).toBe("12-25");
  });

  it("formatMmDd → human label", () => {
    expect(formatMmDd("01-09")).toBe("9 Jan");
    expect(formatMmDd("12-01")).toBe("1 Dec");
    expect(formatMmDd("bad")).toBe("");
    expect(formatMmDd("13-01")).toBe("");
  });

  it("round-trips through the date input", () => {
    expect(mmddToInput("01-09")).toBe("2024-01-09");
    expect(inputToMmdd("2024-01-09")).toBe("01-09");
    expect(inputToMmdd("")).toBe("");
  });

  it("seasonPreset is hemisphere-aware", () => {
    expect(seasonPreset("summer", "northern")).toEqual({ from: "06-01", to: "08-31" });
    expect(seasonPreset("summer", "southern")).toEqual({ from: "12-01", to: "02-28" });
    expect(seasonPreset("winter", "northern")).toEqual({ from: "12-01", to: "02-28" });
  });

  it("splitMmDd / makeMmDd round-trip + clamp", () => {
    expect(splitMmDd("06-15")).toEqual({ month: 6, day: 15 });
    expect(splitMmDd("bad")).toEqual({ month: 1, day: 1 });
    expect(makeMmDd(6, 15)).toBe("06-15");
    expect(makeMmDd(2, 31)).toBe("02-29"); // clamp Feb to 29 (leap ref year)
    expect(makeMmDd(4, 31)).toBe("04-30"); // clamp April to 30
    expect(makeMmDd(13, 5)).toBe("12-05"); // clamp month
  });

  it("daysInMonth", () => {
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4)).toBe(30);
    expect(daysInMonth(1)).toBe(31);
  });

  it("hemisphereForHome uses latitude sign, falls back to timezone", () => {
    expect(hemisphereForHome({ lat: -33.8 })).toBe("southern");
    expect(hemisphereForHome({ lat: 51.5 })).toBe("northern");
    expect(hemisphereForHome({ lat: null, timezone: "Australia/Sydney" })).toBe("southern");
    expect(hemisphereForHome(null)).toBe("northern");
  });
});
