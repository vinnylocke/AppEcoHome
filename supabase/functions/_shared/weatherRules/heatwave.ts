import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT, maxConsecutiveDays } from "./index.ts";
import { heatThresholdForClimate } from "../climateZones.ts";

// Flags hot weather across the forecast window so the user can prepare. The
// threshold is climate-aware (25°C is a heatwave in the UK but a normal day in
// the tropics) — see heatThresholdForClimate. A run of 3+ consecutive hot days
// is called a "heatwave"; isolated hot days are "hot day(s)".
const heatwave: WeatherRule = {
  id: "heatwave",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    const threshold = heatThresholdForClimate(ctx.climateZone);
    const hotDays = ctx.daily.filter((d) => d.date >= ctx.today && d.maxTempC >= threshold);
    if (hotDays.length === 0) return EMPTY_RESULT;

    const dates = hotDays.map((d) => d.date);
    const peak = Math.round(Math.max(...hotDays.map((d) => d.maxTempC)));
    const isHeatwave = maxConsecutiveDays(dates) >= 3;
    const label = isHeatwave ? "Heatwave" : dates.length > 1 ? "Hot days" : "Hot day";

    return {
      alerts: [{
        type: "heat",
        severity: "warning",
        message: `${label} ahead — up to ${peak}°C. Your outdoor plants will need extra water.`,
        starts_at: `${dates[0]}T12:00:00`,
        endsAt: `${dates[dates.length - 1]}T18:00:00`,
        dates,
      }],
      taskAutoCompletes: [],
      notifications: [{
        type: "weather_alert",
        title: isHeatwave ? "Heatwave ahead 🌡️" : "Heat Alert 🌡️",
        body: `Temperatures up to ${peak}°C expected. Keep your outdoor plants well watered.`,
      }],
    };
  },
};

export default heatwave;
