import { describe, test, expect, beforeEach } from "vitest";
import {
  writePlannerPrefill,
  readPlannerPrefill,
  clearPlannerPrefill,
} from "../../../src/lib/plannerPrefill";

const PREFILL_KEY = "rhozly:plannerPrefill";

describe("plannerPrefill", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  test("empty storage returns null", () => {
    expect(readPlannerPrefill()).toBeNull();
  });

  test("round trip preserves name + description", () => {
    writePlannerPrefill({
      name: "Sunny Veg Patch 2026",
      description: "Tomato, pepper, strawberry — full-sun bed against the south wall.",
    });
    expect(readPlannerPrefill()).toEqual({
      name: "Sunny Veg Patch 2026",
      description: "Tomato, pepper, strawberry — full-sun bed against the south wall.",
    });
  });

  test("clear removes the entry", () => {
    writePlannerPrefill({ name: "x", description: "y" });
    clearPlannerPrefill();
    expect(readPlannerPrefill()).toBeNull();
  });

  test("malformed JSON returns null without throwing", () => {
    window.sessionStorage.setItem(PREFILL_KEY, "not-json{");
    expect(() => readPlannerPrefill()).not.toThrow();
    expect(readPlannerPrefill()).toBeNull();
  });

  test("wrong-shape payload returns null", () => {
    window.sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({ name: 123, description: null }),
    );
    expect(readPlannerPrefill()).toBeNull();
  });

  test("missing description rejected", () => {
    window.sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({ name: "ok" }),
    );
    expect(readPlannerPrefill()).toBeNull();
  });

  test("overwriting a prior entry replaces it", () => {
    writePlannerPrefill({ name: "first", description: "one" });
    writePlannerPrefill({ name: "second", description: "two" });
    expect(readPlannerPrefill()).toEqual({ name: "second", description: "two" });
  });
});
