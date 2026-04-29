import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT } from "./index.ts";

// Fires when 5+ consecutive days of significant rain are forecast from today.
// No weather_alert row — this is a user advisory, not an actionable alert.
const RAIN_THRESHOLD_MM = 5;
const PRECIP_PROB_THRESHOLD = 70; // % — counts as "rainy" even if mm data is uncertain
const CONSECUTIVE_DAYS_THRESHOLD = 5;

const waterlogging: WeatherRule = {
  id: "waterlogging",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    const futureDays = ctx.daily.filter((d) => d.date >= ctx.today);
    let consecutiveRainDays = 0;

    for (const day of futureDays) {
      if (
        day.precipMm >= RAIN_THRESHOLD_MM ||
        day.precipProbability >= PRECIP_PROB_THRESHOLD
      ) {
        consecutiveRainDays++;
      } else {
        break;
      }
    }

    if (consecutiveRainDays < CONSECUTIVE_DAYS_THRESHOLD) return EMPTY_RESULT;

    return {
      alerts: [],
      taskAutoCompletes: [],
      notifications: [{
        type: "weather_alert",
        title: "Waterlogging Risk 💧",
        body: `Rain is forecast for ${consecutiveRainDays} days in a row. Check your outdoor plants — waterlogging can damage roots.`,
      }],
    };
  },
};

export default waterlogging;
