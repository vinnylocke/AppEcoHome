import { describe, it, expect } from "vitest";
import {
  ANNUAL_PROJECTION_MAX_YEARS,
  isSeasonalWindowType,
  projectAnnualWindows,
} from "../../../src/lib/windowTasks";

describe("isSeasonalWindowType", () => {
  it("recognises the window types and nothing else", () => {
    expect(isSeasonalWindowType("Harvesting")).toBe(true);
    expect(isSeasonalWindowType("Harvest")).toBe(true);
    expect(isSeasonalWindowType("Pruning")).toBe(true);
    expect(isSeasonalWindowType("Watering")).toBe(false);
    expect(isSeasonalWindowType(null)).toBe(false);
    expect(isSeasonalWindowType(undefined)).toBe(false);
  });
});

describe("projectAnnualWindows", () => {
  const starts = (ws: { start: string }[]) => ws.map((w) => w.start);

  it("projects the same MM-DD every year across a multi-year band", () => {
    const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2026-01-01", "2028-12-31", "2026-07-01");
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      ["2026-06-01", "2026-08-31"],
      ["2027-06-01", "2027-08-31"],
      ["2028-06-01", "2028-08-31"],
    ]);
    expect(ws.map((w) => w.year)).toEqual([2026, 2027, 2028]);
  });

  it("never projects before the template's own first year", () => {
    // Band reaches back to 2024, but the blueprint was authored for 2026.
    const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2024-01-01", "2026-12-31", "2026-07-01");
    expect(starts(ws)).toEqual(["2026-06-01"]);
  });

  it("caps projection at todayYear + ANNUAL_PROJECTION_MAX_YEARS", () => {
    // Wide-open band; today 2026 → ceiling 2031 (current + 5 ahead = 6 occurrences).
    const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2026-01-01", "2050-12-31", "2026-07-01");
    expect(ws.map((w) => w.year)).toEqual([2026, 2027, 2028, 2029, 2030, 2031]);
    expect(ANNUAL_PROJECTION_MAX_YEARS).toBe(5);
  });

  it("advances the ceiling as today advances", () => {
    // Same wide band, but 'today' is now 2028 → ceiling 2033.
    const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2026-01-01", "2050-12-31", "2028-03-01");
    expect(ws[ws.length - 1].year).toBe(2033);
  });

  it("honours a lifecycle cap (recursUntil) — drops occurrences whose start passes it", () => {
    // Biennial: recurs through 2027 only.
    const ws = projectAnnualWindows(
      "2026-06-01", "2026-08-31", "2026-01-01", "2035-12-31", "2026-07-01",
      { recursUntil: "2027-08-31" },
    );
    expect(ws.map((w) => w.year)).toEqual([2026, 2027]);
  });

  it("drops the occurrence whose start falls after recursUntil within the cap year", () => {
    const ws = projectAnnualWindows(
      "2026-06-01", "2026-08-31", "2026-01-01", "2035-12-31", "2026-07-01",
      { recursUntil: "2027-05-01" }, // before the 06-01 start → 2027 dropped
    );
    expect(ws.map((w) => w.year)).toEqual([2026]);
  });

  it("keeps a year-wrapping window (Nov→Feb) contiguous with the end in year+1", () => {
    // Stored template already carries the end in the next year (generator wrap fix).
    const ws = projectAnnualWindows("2026-11-01", "2027-02-28", "2026-10-01", "2028-03-31", "2026-09-01");
    expect(ws.map((w) => [w.start, w.end])).toEqual([
      ["2026-11-01", "2027-02-28"],
      ["2027-11-01", "2028-02-28"],
    ]);
  });

  it("finds a wrapping window from the prior year when the band opens mid-window", () => {
    // Band is only Jan–Feb 2027; the window that STARTED in Nov 2026 must surface.
    const ws = projectAnnualWindows("2026-11-01", "2027-02-28", "2027-01-01", "2027-02-15", "2026-12-01");
    expect(ws.map((w) => [w.start, w.end])).toEqual([["2026-11-01", "2027-02-28"]]);
  });

  it("only returns occurrences intersecting the render band", () => {
    // Band is spring 2028 — no summer window intersects it.
    const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2028-03-01", "2028-05-31", "2026-07-01");
    expect(ws).toEqual([]);
  });

  it("clamps a 02-29 template to 02-28 in a non-leap projection year", () => {
    const ws = projectAnnualWindows("2024-02-29", "2024-03-10", "2027-01-01", "2027-12-31", "2027-01-01");
    expect(ws.map((w) => w.start)).toEqual(["2027-02-28"]);
  });

  it("returns [] on malformed template dates", () => {
    expect(projectAnnualWindows("", "2026-08-31", "2026-01-01", "2028-12-31", "2026-07-01")).toEqual([]);
  });

  // ── The owner's real prod blueprints rolling to next year ──────────────────
  it("rolls the Summer Harvest window (06-01..08-31) into next year", () => {
    const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2027-08-01", "2027-08-31", "2026-07-23");
    expect(ws).toEqual([{ start: "2027-06-01", end: "2027-08-31", year: 2027 }]);
  });

  it("rolls the Jul Pruning window (07-01..07-31) into next year", () => {
    const ws = projectAnnualWindows("2026-07-01", "2026-07-31", "2027-07-01", "2027-07-31", "2026-07-23");
    expect(ws).toEqual([{ start: "2027-07-01", end: "2027-07-31", year: 2027 }]);
  });
});
