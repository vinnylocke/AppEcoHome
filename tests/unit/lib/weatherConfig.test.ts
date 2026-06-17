import { describe, it, expect } from "vitest";
import { weatherConfigFromRow, DEFAULT_WEATHER_CONFIG } from "../../../src/components/integrations/WeatherHandlingSection";

describe("weatherConfigFromRow", () => {
  it("returns defaults for a null row", () => {
    expect(weatherConfigFromRow(null)).toEqual(DEFAULT_WEATHER_CONFIG);
  });

  it("back-fills legacy skip_if_rained → skip when weather_mode absent", () => {
    expect(weatherConfigFromRow({ skip_if_rained: true }).weather_mode).toBe("skip");
    expect(weatherConfigFromRow({ skip_if_rained: false }).weather_mode).toBe("off");
  });

  it("prefers explicit weather_mode over the legacy flag", () => {
    expect(weatherConfigFromRow({ weather_mode: "defer", skip_if_rained: true }).weather_mode).toBe("defer");
  });

  it("carries through the configured dials", () => {
    const cfg = weatherConfigFromRow({
      weather_mode: "defer",
      rain_threshold_mm: 8,
      weather_min_probability: 70,
      weather_defer_window_hours: 18,
      critical_threshold_value: 15,
      max_defers: 3,
      defer_skip_in_heat: false,
    });
    expect(cfg).toEqual({
      weather_mode: "defer",
      rain_threshold_mm: 8,
      weather_min_probability: 70,
      weather_defer_window_hours: 18,
      critical_threshold_value: 15,
      max_defers: 3,
      defer_skip_in_heat: false,
    });
  });

  it("fills per-field defaults when only some values are present", () => {
    const cfg = weatherConfigFromRow({ weather_mode: "skip" });
    expect(cfg.rain_threshold_mm).toBe(5);
    expect(cfg.weather_min_probability).toBe(60);
    expect(cfg.max_defers).toBe(2);
    expect(cfg.defer_skip_in_heat).toBe(true);
  });
});
