import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT } from "./index.ts";

const WIND_THRESHOLD_KPH = 40;

const highWind: WeatherRule = {
  id: "high_wind",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    // Scan the whole forecast window and collect every windy day, so the banner
    // can show the full run rather than just the next one.
    const windDays = ctx.daily.filter((d) => d.date >= ctx.today && d.maxWindKph >= WIND_THRESHOLD_KPH);
    if (windDays.length === 0) return EMPTY_RESULT;

    const dates = windDays.map((d) => d.date);
    const peak = Math.round(Math.max(...windDays.map((d) => d.maxWindKph)));

    return {
      alerts: [{
        type: "wind",
        severity: "warning",
        message: `High winds ${dates.length > 1 ? "expected on several days" : "expected"} — up to ${peak} km/h.`,
        starts_at: `${dates[0]}T12:00:00`,
        endsAt: `${dates[dates.length - 1]}T18:00:00`,
        dates,
      }],
      taskAutoCompletes: [],
      notifications: [{
        type: "weather_alert",
        title: "High Winds Expected 💨",
        body: `Strong winds forecast (up to ${peak} km/h). Secure any vulnerable outdoor plants.`,
      }],
    };
  },
};

export default highWind;
