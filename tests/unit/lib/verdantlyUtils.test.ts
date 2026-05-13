import { describe, test, expect } from "vitest";
import {
  VERDANTLY_WATERING_DAYS,
  VERDANTLY_SUNLIGHT_MAP,
  getProviderLabel,
} from "../../../src/lib/verdantlyUtils";

describe("VERDANTLY_WATERING_DAYS", () => {
  test("has exactly three keys", () => {
    expect(Object.keys(VERDANTLY_WATERING_DAYS)).toHaveLength(3);
  });

  test("Low maps to min:14 max:21 label:Minimum", () => {
    expect(VERDANTLY_WATERING_DAYS["Low"]).toEqual({ min: 14, max: 21, label: "Minimum" });
  });

  test("Moderate maps to min:7 max:14 label:Average", () => {
    expect(VERDANTLY_WATERING_DAYS["Moderate"]).toEqual({ min: 7, max: 14, label: "Average" });
  });

  test("High maps to min:2 max:7 label:Frequent", () => {
    expect(VERDANTLY_WATERING_DAYS["High"]).toEqual({ min: 2, max: 7, label: "Frequent" });
  });

  test("min is always less than max for all keys", () => {
    for (const entry of Object.values(VERDANTLY_WATERING_DAYS)) {
      expect(entry.min).toBeLessThan(entry.max);
    }
  });
});

describe("VERDANTLY_SUNLIGHT_MAP", () => {
  test("Full sun maps to [full_sun]", () => {
    expect(VERDANTLY_SUNLIGHT_MAP["Full sun"]).toEqual(["full_sun"]);
  });

  test("Full Sun (capital S) maps to [full_sun]", () => {
    expect(VERDANTLY_SUNLIGHT_MAP["Full Sun"]).toEqual(["full_sun"]);
  });

  test("Partial shade maps to [part_shade]", () => {
    expect(VERDANTLY_SUNLIGHT_MAP["Partial shade"]).toEqual(["part_shade"]);
  });

  test("Full shade maps to [deep_shade]", () => {
    expect(VERDANTLY_SUNLIGHT_MAP["Full shade"]).toEqual(["deep_shade"]);
  });

  test("Full sun to partial shade maps to two entries", () => {
    expect(VERDANTLY_SUNLIGHT_MAP["Full sun to partial shade"]).toEqual(["full_sun", "part_shade"]);
  });

  test("Partial to full shade maps to two entries", () => {
    expect(VERDANTLY_SUNLIGHT_MAP["Partial to full shade"]).toEqual(["part_shade", "deep_shade"]);
  });

  test("unknown key returns undefined", () => {
    expect(VERDANTLY_SUNLIGHT_MAP["Dappled shade"]).toBeUndefined();
  });
});

describe("getProviderLabel", () => {
  test("'api' returns Perenual", () => {
    expect(getProviderLabel("api")).toBe("Perenual");
  });

  test("'perenual' returns Perenual", () => {
    expect(getProviderLabel("perenual")).toBe("Perenual");
  });

  test("'verdantly' returns Verdantly", () => {
    expect(getProviderLabel("verdantly")).toBe("Verdantly");
  });

  test("'manual' returns null", () => {
    expect(getProviderLabel("manual")).toBeNull();
  });

  test("'ai' returns null", () => {
    expect(getProviderLabel("ai")).toBeNull();
  });

  test("unknown string returns null", () => {
    expect(getProviderLabel("unknown_source")).toBeNull();
  });
});
