import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT } from "./index.ts";

const WIND_THRESHOLD_KPH = 40;

const highWind: WeatherRule = {
  id: "high_wind",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    // Check today and tomorrow only — wind warnings beyond 2 days are too uncertain
    const windDay = ctx.daily
      .filter((d) => d.date >= ctx.today)
      .slice(0, 2)
      .find((d) => d.maxWindKph >= WIND_THRESHOLD_KPH);

    if (!windDay) return EMPTY_RESULT;

    return {
      alerts: [{
        type: "wind",
        severity: "warning",
        message: `High winds expected (${Math.round(windDay.maxWindKph)} km/h).`,
        starts_at: `${windDay.date}T12:00:00`,
      }],
      taskAutoCompletes: [],
      notifications: [{
        type: "weather_alert",
        title: "High Winds Expected 💨",
        body: `Strong winds forecasted (${Math.round(windDay.maxWindKph)} km/h). Secure any vulnerable outdoor plants.`,
      }],
    };
  },
};

export default highWind;
