import type { WeatherRule, WeatherContext, WeatherRuleResult } from "./index.ts";
import { EMPTY_RESULT } from "./index.ts";

// Imminent frost from the next 48h of hourly data (drives the exact "tonight"
// time + urgency), plus any further frost nights across the daily window so the
// banner can group them ("Frost — Fri & Sat"). Threshold rises to 5°C when
// tropical plants are outdoors.
const frostRisk: WeatherRule = {
  id: "frost_risk",

  evaluate(ctx: WeatherContext): WeatherRuleResult {
    if (!ctx.outsideLocationIds.length) return EMPTY_RESULT;

    const threshold = ctx.hasTropicalOutdoor ? 5 : 2;

    // Imminent frost — exact hour within the next 48h (hourly is pre-filtered).
    const frostPoint = ctx.hourly.find((h) => h.tempC <= threshold);
    // Forward frost nights across the daily window (for grouped display).
    const frostDays = ctx.daily.filter((d) => d.date >= ctx.today && d.minTempC <= threshold).map((d) => d.date);

    if (!frostPoint && frostDays.length === 0) return EMPTY_RESULT;

    const startsAt = frostPoint ? frostPoint.time : `${frostDays[0]}T03:00:00`;
    const dates = frostDays.length > 0 ? frostDays : [startsAt.split("T")[0]];
    const endsAt = `${dates[dates.length - 1]}T06:00:00`;
    const minTemp = frostPoint
      ? Math.round(frostPoint.tempC)
      : Math.round(Math.min(...ctx.daily.filter((d) => dates.includes(d.date)).map((d) => d.minTempC)));
    const tropicalNote = ctx.hasTropicalOutdoor ? " Tropical plants are at risk." : "";

    return {
      alerts: [{
        type: "frost",
        severity: "critical",
        message: `Frost warning: down to ${minTemp}°C expected.${tropicalNote}`,
        starts_at: startsAt,
        endsAt,
        dates,
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
