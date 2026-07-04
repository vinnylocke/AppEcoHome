import { describe, test, expect } from "vitest";
import { buildHarvestYieldRows } from "../../../src/lib/harvestYield";

// ---- buildHarvestYieldRows ----
// Turns the harvest yield prompt (total-split OR per-plant) into the rows we
// insert into yield_records. Drops non-positive values (the > 0 CHECK), and in
// "total" mode the parts must sum back to the entered total.

const sum = (rows: { value: number }[]) => rows.reduce((a, r) => a + r.value, 0);

describe("buildHarvestYieldRows — total (split evenly)", () => {
  test("splits a total across instances, one row each, summing to the total", () => {
    const rows = buildHarvestYieldRows({
      mode: "total", total: 10, instanceIds: ["a", "b", "c"], unit: "g",
    });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.instance_id)).toEqual(["a", "b", "c"]);
    expect(sum(rows)).toBeCloseTo(10, 9);
    expect(rows.every((r) => r.unit === "g")).toBe(true);
  });

  test("single instance gets the whole total", () => {
    const rows = buildHarvestYieldRows({ mode: "total", total: 250, instanceIds: ["a"], unit: "g" });
    expect(rows).toEqual([{ instance_id: "a", value: 250, unit: "g", notes: null }]);
  });

  test("zero / negative / no instances → no rows", () => {
    expect(buildHarvestYieldRows({ mode: "total", total: 0, instanceIds: ["a"], unit: "g" })).toEqual([]);
    expect(buildHarvestYieldRows({ mode: "total", total: -5, instanceIds: ["a"], unit: "g" })).toEqual([]);
    expect(buildHarvestYieldRows({ mode: "total", total: 10, instanceIds: [], unit: "g" })).toEqual([]);
  });
});

describe("buildHarvestYieldRows — perPlant", () => {
  test("one row per plant with a positive amount, in instance order", () => {
    const rows = buildHarvestYieldRows({
      mode: "perPlant",
      instanceIds: ["a", "b", "c"],
      perPlant: { a: 100, b: 0, c: 40 },
      unit: "g",
    });
    expect(rows).toEqual([
      { instance_id: "a", value: 100, unit: "g", notes: null },
      { instance_id: "c", value: 40, unit: "g", notes: null },
    ]);
  });

  test("all blank / zero → no rows", () => {
    expect(
      buildHarvestYieldRows({ mode: "perPlant", instanceIds: ["a", "b"], perPlant: {}, unit: "g" }),
    ).toEqual([]);
  });
});

describe("buildHarvestYieldRows — notes", () => {
  test("trims notes and null-collapses empty", () => {
    const withNotes = buildHarvestYieldRows({ mode: "total", total: 5, instanceIds: ["a"], unit: "g", notes: "  first reds  " });
    expect(withNotes[0].notes).toBe("first reds");
    const blank = buildHarvestYieldRows({ mode: "total", total: 5, instanceIds: ["a"], unit: "g", notes: "   " });
    expect(blank[0].notes).toBeNull();
  });
});
