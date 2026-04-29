import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT } from "./index.ts";

// Scans the next 48h of hourly data for the first sub-threshold temperature.
// Threshold is raised to 5°C when tropical plants are outdoors.
const frostRisk: WeatherRule = {
  id: "frost_risk",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    const threshold = ctx.hasTropicalOutdoor ? 5 : 2;

    // hourly is already filtered to next 48h by analyse-weather
    const frostPoint = ctx.hourly.find((h) => h.tempC <= threshold);
    if (!frostPoint) return EMPTY_RESULT;

    const tropicalNote = ctx.hasTropicalOutdoor ? " Tropical plants are at risk." : "";

    return {
      alerts: [{
        type: "frost",
        severity: "critical",
        message: `Frost warning: ${Math.round(frostPoint.tempC)}°C expected.${tropicalNote}`,
        starts_at: frostPoint.time,
      }],
      taskAutoCompletes: [],
      notifications: [{
        type: "weather_alert",
        title: "Frost Warning ❄️",
        body: `Freezing temperatures expected.${tropicalNote} Please protect your outdoor plants.`,
      }],
    };
  },
};

export default frostRisk;
