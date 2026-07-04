import { describe, test, expect } from "vitest";
import {
  formatSensorRange,
  buildSensorRequirementRows,
  hasAnySensorRange,
  hasAllSensorRanges,
} from "../../../src/lib/sensorRequirements";

describe("formatSensorRange", () => {
  test("formats a full band with the unit suffix", () => {
    expect(formatSensorRange(30, 60, "%")).toBe("30–60%");
    expect(formatSensorRange(800, 1800, " µS/cm")).toBe("800–1800 µS/cm");
    expect(formatSensorRange(12, 24, "°C")).toBe("12–24°C");
  });

  test("returns an em-dash when either end is missing or non-finite", () => {
    expect(formatSensorRange(30, null, "%")).toBe("—");
    expect(formatSensorRange(null, 60, "%")).toBe("—");
    expect(formatSensorRange(undefined, undefined, "%")).toBe("—");
    expect(formatSensorRange(NaN, 60, "%")).toBe("—");
  });
});

describe("buildSensorRequirementRows", () => {
  test("returns the three rows in order with correct units", () => {
    const rows = buildSensorRequirementRows({
      soil_moisture_min: 30, soil_moisture_max: 60,
      soil_ec_min: 800, soil_ec_max: 1800,
      soil_temp_min: 12, soil_temp_max: 24,
    });
    expect(rows.map((r) => r.key)).toEqual(["moisture", "ec", "temp"]);
    expect(rows[0].display).toBe("30–60%");
    expect(rows[1].display).toBe("800–1800 µS/cm");
    expect(rows[2].display).toBe("12–24°C");
    expect(rows.every((r) => r.hasValue)).toBe(true);
  });

  test("a partially-filled plant marks only complete rows hasValue", () => {
    const rows = buildSensorRequirementRows({ soil_moisture_min: 30, soil_moisture_max: 60 });
    expect(rows.find((r) => r.key === "moisture")!.hasValue).toBe(true);
    expect(rows.find((r) => r.key === "ec")!.hasValue).toBe(false);
    expect(rows.find((r) => r.key === "temp")!.display).toBe("—");
  });

  test("null/undefined plant yields three empty rows", () => {
    const rows = buildSensorRequirementRows(null);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => !r.hasValue && r.display === "—")).toBe(true);
  });
});

describe("hasAnySensorRange / hasAllSensorRanges", () => {
  test("hasAny is true with one complete range, false when empty", () => {
    expect(hasAnySensorRange({ soil_temp_min: 12, soil_temp_max: 24 })).toBe(true);
    expect(hasAnySensorRange({ soil_moisture_min: 30 })).toBe(false); // half a range
    expect(hasAnySensorRange(null)).toBe(false);
  });

  test("hasAll is true only when all three are complete", () => {
    expect(hasAllSensorRanges({
      soil_moisture_min: 30, soil_moisture_max: 60,
      soil_ec_min: 800, soil_ec_max: 1800,
      soil_temp_min: 12, soil_temp_max: 24,
    })).toBe(true);
    expect(hasAllSensorRanges({ soil_moisture_min: 30, soil_moisture_max: 60 })).toBe(false);
  });
});
