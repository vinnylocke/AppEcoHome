import { assertEquals } from "@std/assert";
import { ANNUAL_PROJECTION_MAX_YEARS, projectAnnualWindows } from "@shared/annualWindows.ts";

// Deno mirror of tests/unit/lib/windowTasks.test.ts — the two projection copies
// (browser + Deno) must agree. Keep these cases aligned.

Deno.test("AW-001: projects the same MM-DD every year across a multi-year band", () => {
  const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2026-01-01", "2028-12-31", "2026-07-01");
  assertEquals(ws.map((w) => [w.start, w.end]), [
    ["2026-06-01", "2026-08-31"],
    ["2027-06-01", "2027-08-31"],
    ["2028-06-01", "2028-08-31"],
  ]);
});

Deno.test("AW-002: never projects before the template's own first year", () => {
  const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2024-01-01", "2026-12-31", "2026-07-01");
  assertEquals(ws.map((w) => w.start), ["2026-06-01"]);
});

Deno.test("AW-003: caps at todayYear + ANNUAL_PROJECTION_MAX_YEARS", () => {
  const ws = projectAnnualWindows("2026-06-01", "2026-08-31", "2026-01-01", "2050-12-31", "2026-07-01");
  assertEquals(ws.map((w) => w.year), [2026, 2027, 2028, 2029, 2030, 2031]);
  assertEquals(ANNUAL_PROJECTION_MAX_YEARS, 5);
});

Deno.test("AW-004: honours the lifecycle cap (recursUntil)", () => {
  const ws = projectAnnualWindows(
    "2026-06-01", "2026-08-31", "2026-01-01", "2035-12-31", "2026-07-01",
    { recursUntil: "2027-08-31" },
  );
  assertEquals(ws.map((w) => w.year), [2026, 2027]);
});

Deno.test("AW-005: keeps a year-wrapping window contiguous (end in year+1)", () => {
  const ws = projectAnnualWindows("2026-11-01", "2027-02-28", "2026-10-01", "2028-03-31", "2026-09-01");
  assertEquals(ws.map((w) => [w.start, w.end]), [
    ["2026-11-01", "2027-02-28"],
    ["2027-11-01", "2028-02-28"],
  ]);
});

Deno.test("AW-006: finds a wrapping window from the prior year when the band opens mid-window", () => {
  const ws = projectAnnualWindows("2026-11-01", "2027-02-28", "2027-01-01", "2027-02-15", "2026-12-01");
  assertEquals(ws.map((w) => [w.start, w.end]), [["2026-11-01", "2027-02-28"]]);
});

Deno.test("AW-007: only returns occurrences intersecting the band", () => {
  assertEquals(projectAnnualWindows("2026-06-01", "2026-08-31", "2028-03-01", "2028-05-31", "2026-07-01"), []);
});

Deno.test("AW-008: clamps 02-29 to 02-28 in a non-leap projection year", () => {
  const ws = projectAnnualWindows("2024-02-29", "2024-03-10", "2027-01-01", "2027-12-31", "2027-01-01");
  assertEquals(ws.map((w) => w.start), ["2027-02-28"]);
});

Deno.test("AW-009: malformed template → []", () => {
  assertEquals(projectAnnualWindows("", "2026-08-31", "2026-01-01", "2028-12-31", "2026-07-01"), []);
});

Deno.test("AW-010: owner's Summer Harvest + Jul Pruning roll to next year", () => {
  assertEquals(
    projectAnnualWindows("2026-06-01", "2026-08-31", "2027-08-01", "2027-08-31", "2026-07-23"),
    [{ start: "2027-06-01", end: "2027-08-31", year: 2027 }],
  );
  assertEquals(
    projectAnnualWindows("2026-07-01", "2026-07-31", "2027-07-01", "2027-07-31", "2026-07-23"),
    [{ start: "2027-07-01", end: "2027-07-31", year: 2027 }],
  );
});
