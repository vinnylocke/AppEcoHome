import { describe, it, expect } from "vitest";
import {
  mmddOf, formatMmDd, mmddToInput, inputToMmdd, seasonPreset, hemisphereForHome,
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

  it("hemisphereForHome uses latitude sign, falls back to timezone", () => {
    expect(hemisphereForHome({ lat: -33.8 })).toBe("southern");
    expect(hemisphereForHome({ lat: 51.5 })).toBe("northern");
    expect(hemisphereForHome({ lat: null, timezone: "Australia/Sydney" })).toBe("southern");
    expect(hemisphereForHome(null)).toBe("northern");
  });
});
