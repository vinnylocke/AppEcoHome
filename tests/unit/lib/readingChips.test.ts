import { describe, it, expect } from "vitest";
import { buildReadingChips } from "../../../src/lib/integrations/readingChips";

describe("buildReadingChips", () => {
  it("soil sensor → moisture, temp, calibrated EC chips", () => {
    const chips = buildReadingChips("soil_sensor", {
      soil_moisture: 62.4, soil_temp: 18.52, soil_ec: 1.2, ec_source: "calibrated_us_cm",
    });
    expect(chips.map((c) => c.label)).toEqual(["62%", "18.5°C", "EC 1.2 µS/cm"]);
    expect(chips.map((c) => c.tone)).toEqual(["moisture", "temp", "ec"]);
  });

  it("raw-ADC EC has no unit", () => {
    expect(buildReadingChips("soil_sensor", { soil_ec: 350, ec_source: "raw_adc" }))
      .toEqual([{ label: "EC 350", tone: "ec" }]);
  });

  it("omits missing metrics", () => {
    expect(buildReadingChips("soil_sensor", { soil_moisture: 50 }).map((c) => c.tone)).toEqual(["moisture"]);
  });

  it("valve open/closed state", () => {
    expect(buildReadingChips("water_valve", { state: "on" })).toEqual([{ label: "Open", tone: "state-on" }]);
    expect(buildReadingChips("water_valve", { state: "off" })).toEqual([{ label: "Closed", tone: "state-off" }]);
  });

  it("returns [] when there is no usable data", () => {
    expect(buildReadingChips("soil_sensor", null)).toEqual([]);
    expect(buildReadingChips("water_valve", {})).toEqual([]);
  });
});
