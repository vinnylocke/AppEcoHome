import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT } from "./index.ts";

// Advises the user to water more when extreme heat is forecast in the next 2 days.
// Uses the 'heat' alert type to record the alert, plus a notification.
const HEAT_THRESHOLD_C = 32;

const heatwave: WeatherRule = {
  id: "heatwave",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    const hotDay = ctx.daily
      .filter((d) => d.date >= ctx.today)
      .slice(0, 2)
      .find((d) => d.maxTempC >= HEAT_THRESHOLD_C);

    if (!hotDay) return EMPTY_RESULT;

    return {
      alerts: [{
        type: "heat",
        severity: "warning",
        message: `High temperatures expected (${Math.round(hotDay.maxTempC)}°C). Plants may need extra water.`,
        starts_at: `${hotDay.date}T12:00:00`,
      }],
      taskAutoCompletes: [],
      notifications: [{
        type: "weather_alert",
        title: "Heat Alert 🌡️",
        body: `Temperatures up to ${Math.round(hotDay.maxTempC)}°C expected. Your outdoor plants may need extra watering today.`,
      }],
    };
  },
};

export default heatwave;
