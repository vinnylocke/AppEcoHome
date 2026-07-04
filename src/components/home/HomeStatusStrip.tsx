import React from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertCircle, Snowflake, SkipForward, Clock } from "lucide-react";
import { getLocalDateString } from "../../lib/taskEngine";
import type { TodaySummary } from "../../lib/todaySummary";

/**
 * Slim single-row status header for the Home dashboard (new-home-dashboard
 * plan §3.1). The full DailyBriefCard hero stays on the Overview tab; this
 * strip carries the same signals — greeting, weather now, today's task
 * load, overdue, frost tonight — in one scannable line. Chips deep-link.
 */

function timeOfDayGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

interface Props {
  firstName: string | null;
  /** Extracted current weather ({ temp, description, Icon }) or null. */
  weather: any;
  /** Raw Open-Meteo snapshot — used for the frost-tonight hint. */
  rawWeather: any;
  /** RHO-20 — today's task breakdown ("X of Y done today" + status chips). */
  todaySummary: TodaySummary;
  overdueCount: number;
}

export default function HomeStatusStrip({
  firstName,
  weather,
  rawWeather,
  todaySummary,
  overdueCount,
}: Props) {
  const navigate = useNavigate();
  const now = new Date();

  // Frost tonight — same read as DailyBriefCard: Open-Meteo daily.time
  // entries are local-to-location dates, keyed by the LOCAL date.
  let frostMin: number | null = null;
  const times: string[] = rawWeather?.daily?.time ?? [];
  const mins: number[] = rawWeather?.daily?.temperature_2m_min ?? [];
  const todayIdx = times.indexOf(getLocalDateString(now));
  if (todayIdx !== -1) {
    const tonightMin = mins[todayIdx];
    if (Number.isFinite(tonightMin) && tonightMin <= 3) frostMin = tonightMin;
  }

  const WeatherIcon = weather?.Icon;

  return (
    <div
      data-testid="home-status-strip"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-1"
    >
      <h1 className="text-lg sm:text-xl font-black text-rhozly-on-surface leading-tight mr-1">
        {timeOfDayGreeting(now)}
        {firstName ? `, ${firstName}` : ""}
      </h1>

      {weather && (
        <button
          data-testid="home-strip-weather"
          onClick={() => navigate("/dashboard?view=weather")}
          className="flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/70 bg-rhozly-primary/5 px-3 py-1.5 rounded-full hover:bg-rhozly-primary/10 transition"
        >
          {WeatherIcon ? <WeatherIcon size={14} /> : null}
          <span>
            {Math.round(weather.temp)}° {weather.description}
          </span>
        </button>
      )}

      <button
        data-testid="home-strip-tasks"
        onClick={() => navigate("/dashboard?view=calendar")}
        className="flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/70 bg-rhozly-primary/5 px-3 py-1.5 rounded-full hover:bg-rhozly-primary/10 transition"
      >
        <CheckCircle2 size={14} className="text-rhozly-primary" />
        <span data-testid="home-strip-tasks-headline">
          {todaySummary.total === 0
            ? "No tasks today"
            : `${todaySummary.done} of ${todaySummary.total} done today`}
        </span>
      </button>

      {/* RHO-20 — breakdown chips near the count so a static number makes
          sense. Zero-count chips are hidden to keep the strip calm. */}
      {todaySummary.pending > 0 && (
        <button
          data-testid="home-strip-pending"
          onClick={() => navigate("/dashboard?view=calendar")}
          className="flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/60 bg-rhozly-primary/5 px-2.5 py-1.5 rounded-full hover:bg-rhozly-primary/10 transition"
        >
          <Clock size={13} className="text-rhozly-primary/70" />
          <span>{todaySummary.pending} to do</span>
        </button>
      )}

      {todaySummary.skipped > 0 && (
        <span
          data-testid="home-strip-skipped"
          className="flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/50 bg-rhozly-surface-low px-2.5 py-1.5 rounded-full"
        >
          <SkipForward size={13} />
          <span>{todaySummary.skipped} skipped</span>
        </span>
      )}

      {todaySummary.postponed > 0 && (
        <span
          data-testid="home-strip-postponed"
          className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded-full"
        >
          <Clock size={13} />
          <span>{todaySummary.postponed} postponed</span>
        </span>
      )}

      {overdueCount > 0 && (
        <button
          data-testid="home-strip-overdue"
          onClick={() => navigate("/dashboard?view=calendar")}
          className="flex items-center gap-1.5 text-xs font-black text-red-700 bg-red-50 px-3 py-1.5 rounded-full hover:bg-red-100 transition"
        >
          <AlertCircle size={14} />
          <span>{overdueCount} overdue</span>
        </button>
      )}

      {frostMin !== null && (
        <button
          data-testid="home-strip-frost"
          onClick={() => navigate("/dashboard?view=weather")}
          className="flex items-center gap-1.5 text-xs font-black text-sky-700 bg-sky-50 px-3 py-1.5 rounded-full hover:bg-sky-100 transition"
        >
          <Snowflake size={14} />
          <span>Frost tonight {Math.round(frostMin)}°</span>
        </button>
      )}
    </div>
  );
}
