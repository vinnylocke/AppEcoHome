import { describe, it, expect } from "vitest";
import { heatThresholdForClimate } from "../../../src/lib/heatThreshold";

// Mirrors the server helper in supabase/functions/_shared/climateZones.ts.
describe("heatThresholdForClimate (client mirror)", () => {
  it("UK homes use the Met Office 25°C baseline regardless of zone", () => {
    expect(heatThresholdForClimate("cool_temperate", "GB")).toBe(25);
    expect(heatThresholdForClimate("continental", "United Kingdom")).toBe(25);
    expect(heatThresholdForClimate(null, "Scotland")).toBe(25);
    expect(heatThresholdForClimate("COOL_TEMPERATE", "gb")).toBe(25); // case-insensitive
  });

  it("non-UK uses the climate-zone map", () => {
    expect(heatThresholdForClimate("tropical", "BR")).toBe(36);
    expect(heatThresholdForClimate("mediterranean", "ES")).toBe(32);
    expect(heatThresholdForClimate("cool_temperate", "US")).toBe(28);
  });

  it("defaults to 28 for unknown zone / no country", () => {
    expect(heatThresholdForClimate(null, null)).toBe(28);
    expect(heatThresholdForClimate("made_up_zone", undefined)).toBe(28);
  });
});
