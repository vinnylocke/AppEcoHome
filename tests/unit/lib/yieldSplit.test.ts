import { describe, test, expect } from "vitest";
import { splitYieldEvenly } from "../../../src/lib/yieldSplit";

// ---- splitYieldEvenly (RHO-21) ----
// Splits an entered TOTAL harvest into N per-instance parts that sum EXACTLY
// to the total, each rounded to 3dp (numeric(10,3)), remainder on the last row.

const sum = (parts: number[]) => parts.reduce((a, b) => a + b, 0);

describe("splitYieldEvenly", () => {
  test("N=1 returns the whole total unchanged", () => {
    expect(splitYieldEvenly(3, 1)).toEqual([3]);
    expect(splitYieldEvenly(250, 1)).toEqual([250]);
  });

  test("evenly divisible total splits equally", () => {
    expect(splitYieldEvenly(3, 2)).toEqual([1.5, 1.5]);
    expect(splitYieldEvenly(6, 3)).toEqual([2, 2, 2]);
  });

  test("non-divisible total sums exactly to the total (remainder on last row)", () => {
    const parts = splitYieldEvenly(10, 3);
    expect(parts).toEqual([3.333, 3.333, 3.334]);
    expect(sum(parts)).toBeCloseTo(10, 9);
  });

  test("parts always sum back to the entered total", () => {
    for (const [total, n] of [[500, 3], [7, 4], [0.9, 2], [123.456, 7]] as const) {
      expect(sum(splitYieldEvenly(total, n))).toBeCloseTo(total, 9);
    }
  });

  test("each part is rounded to 3 decimal places", () => {
    for (const part of splitYieldEvenly(10, 3)) {
      expect(Math.round(part * 1000)).toBe(part * 1000);
    }
  });

  test("guards invalid inputs", () => {
    expect(splitYieldEvenly(3, 0)).toEqual([]);
    expect(splitYieldEvenly(3, -1)).toEqual([]);
    expect(splitYieldEvenly(3, 2.5)).toEqual([]);
    expect(splitYieldEvenly(0, 2)).toEqual([]);
    expect(splitYieldEvenly(-5, 2)).toEqual([]);
    expect(splitYieldEvenly(NaN, 2)).toEqual([]);
  });

  test("returns one part per instance", () => {
    expect(splitYieldEvenly(9, 5)).toHaveLength(5);
  });
});
