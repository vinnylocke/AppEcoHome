import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT } from "./index.ts";

// Watering tasks are auto-completed when today's rainfall meets the threshold,
// OR when significant rain fell yesterday AND more is forecast today — cumulative
// soil saturation means watering is genuinely unnecessary.
const RAIN_THRESHOLD_MM = 5;

const rainAutoComplete: WeatherRule = {
  id: "rain_auto_complete",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    const todayData = ctx.daily.find((d) => d.date === ctx.today);
    // daily[0] is yesterday because sync-weather requests past_days=1
    const yesterdayData = ctx.daily.find((d) => d.date < ctx.today);

    const rainToday = todayData?.precipMm ?? 0;
    const rainYesterday = yesterdayData?.precipMm ?? 0;

    // Auto-complete if today's rain is sufficient on its own,
    // or if yesterday + today together exceed the threshold (soil still saturated).
    const shouldAutoComplete =
      rainToday >= RAIN_THRESHOLD_MM ||
      (rainYesterday >= RAIN_THRESHOLD_MM && rainToday > 0);

    if (!shouldAutoComplete) return EMPTY_RESULT;

    const displayMm = rainToday > 0 ? rainToday : rainYesterday;
    const reason = rainToday >= RAIN_THRESHOLD_MM
      ? `Auto-completed: ${rainToday.toFixed(1)}mm rainfall on ${ctx.today}`
      : `Auto-completed: ${rainYesterday.toFixed(1)}mm yesterday + rain continuing today`;

    return {
      alerts: [{
        type: "rain",
        severity: "info",
        message: `Rain forecasted (${displayMm.toFixed(1)}mm). Outdoor watering auto-completed.`,
        starts_at: `${ctx.today}T06:00:00`,
      }],
      taskAutoCompletes: [{
        taskType: "Watering",
        reason,
      }],
      notifications: [{
        type: "weather_alert",
        title: "Nature is watering today! 🌧️",
        body: `${displayMm.toFixed(1)}mm of rain ${rainToday >= RAIN_THRESHOLD_MM ? "forecasted" : "fell yesterday and continues today"}. Outdoor watering tasks auto-completed.`,
      }],
    };
  },
};

export default rainAutoComplete;
