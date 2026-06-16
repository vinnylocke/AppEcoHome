import { describe, test, expect } from "vitest";
import {
  computeAreaMetricSummary,
  type LinkedSensor,
} from "../../../src/services/areaSensorsService";

// 2026-06-16 — Area ↔ Sensor linkage Phase 1.
//
// computeAreaMetricSummary is the pure aggregation step. Everything
// else in areaSensorsService talks to Supabase and gets covered by
// E2E tests instead.

function sensor(
  name: string,
  latest: { temp: number; moisture: number; ec: number; ec_source?: "calibrated_us_cm" | "raw_adc" } | null,
): LinkedSensor {
  return {
    device_id: `dev-${name}`,
    name,
    provider: "ecowitt",
    display_temp_unit: "celsius",
    latest: latest
      ? {
          recorded_at: "2026-06-16T12:00:00Z",
          soil_temp: latest.temp,
          soil_moisture: latest.moisture,
          soil_ec: latest.ec,
          ec_source: latest.ec_source ?? "calibrated_us_cm",
        }
      : null,
  };
}

describe("computeAreaMetricSummary", () => {
  test("empty list — all averages are NaN", () => {
    const s = computeAreaMetricSummary([]);
    expect(s.sensors_with_data).toBe(0);
    expect(s.total_sensors).toBe(0);
    expect(Number.isNaN(s.avg_soil_temp)).toBe(true);
    expect(Number.isNaN(s.avg_soil_moisture)).toBe(true);
    expect(Number.isNaN(s.avg_soil_ec)).toBe(true);
    expect(s.ec_source).toBe("raw_adc");
  });

  test("single sensor — averages equal that sensor's values", () => {
    const s = computeAreaMetricSummary([sensor("A", { temp: 18.4, moisture: 42, ec: 1200 })]);
    expect(s.sensors_with_data).toBe(1);
    expect(s.total_sensors).toBe(1);
    expect(s.avg_soil_temp).toBe(18.4);
    expect(s.avg_soil_moisture).toBe(42);
    expect(s.avg_soil_ec).toBe(1200);
    expect(s.ec_source).toBe("calibrated_us_cm");
  });

  test("two sensors — averages computed cleanly", () => {
    const s = computeAreaMetricSummary([
      sensor("A", { temp: 18, moisture: 40, ec: 1000 }),
      sensor("B", { temp: 22, moisture: 60, ec: 1400 }),
    ]);
    expect(s.sensors_with_data).toBe(2);
    expect(s.avg_soil_temp).toBe(20);
    expect(s.avg_soil_moisture).toBe(50);
    expect(s.avg_soil_ec).toBe(1200);
  });

  test("sensors with no reading are excluded from the average", () => {
    const s = computeAreaMetricSummary([
      sensor("A", { temp: 20, moisture: 50, ec: 1000 }),
      sensor("B", null),
      sensor("C", null),
    ]);
    // Only A counts.
    expect(s.sensors_with_data).toBe(1);
    expect(s.total_sensors).toBe(3);
    expect(s.avg_soil_temp).toBe(20);
    expect(s.avg_soil_moisture).toBe(50);
  });

  test("ec_source = calibrated_us_cm only when every contributing sensor is calibrated", () => {
    // Mixed: one calibrated WH52 + one raw WH51 → fall back to raw_adc.
    const s = computeAreaMetricSummary([
      sensor("WH52", { temp: 20, moisture: 50, ec: 1200, ec_source: "calibrated_us_cm" }),
      sensor("WH51", { temp: 19, moisture: 48, ec: 850, ec_source: "raw_adc" }),
    ]);
    expect(s.ec_source).toBe("raw_adc");
  });

  test("ec_source promotes to calibrated when all sensors are calibrated", () => {
    const s = computeAreaMetricSummary([
      sensor("A", { temp: 20, moisture: 50, ec: 1200, ec_source: "calibrated_us_cm" }),
      sensor("B", { temp: 21, moisture: 52, ec: 1300, ec_source: "calibrated_us_cm" }),
    ]);
    expect(s.ec_source).toBe("calibrated_us_cm");
  });

  test("sensors with null readings don't poison ec_source", () => {
    // The B (null) sensor doesn't count toward the calibration check.
    const s = computeAreaMetricSummary([
      sensor("A", { temp: 20, moisture: 50, ec: 1200, ec_source: "calibrated_us_cm" }),
      sensor("B", null),
    ]);
    expect(s.sensors_with_data).toBe(1);
    expect(s.ec_source).toBe("calibrated_us_cm");
  });
});
