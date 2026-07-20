import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SunCalc from "suncalc";
import { ChevronRight, MessageSquare } from "lucide-react";
import { getLocalDateString } from "../../lib/taskEngine";
import { usePlantDoctor } from "../../context/PlantDoctorContext";
import type { TodaySummary } from "../../lib/todaySummary";
import {
  timeOfDayGreeting,
  composeHeroSentence,
  composeConsoleSegments,
  extractFrostMin,
  extractRainToday,
  formatSunMicroLine,
  type HeroAlert,
} from "../../lib/heroSentence";

/**
 * The home hero (redesign Stage 1 — docs/plans/home-redesign-two-postures.md).
 *
 * One display-scale greeting whose SENTENCE is the status summary — replacing
 * the old greeting-plus-chip-row that restated the same numbers up to seven
 * times across the page. Two voices:
 *  - "sentence" (the Porch): huge greeting + one composed sentence + a quiet
 *    sun micro-line + at most two chips that never restate a sentence number.
 *  - "console" (the Workbench): compact greeting + a terse tabular segment
 *    line ("4/12 today · 3 overdue · 24° clear · golden hour 19:42"), each
 *    segment deep-linking.
 *
 * Un-boxed on purpose — the greeting sits directly on the page ground with
 * generous breathing room (empty space as the luxury, type scale as the
 * eye-catcher). Keeps data-testid="home-status-strip": dashboard_tour step 2
 * anchors here.
 */

function useMinuteTick(): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    let id: number | null = null;
    const start = () => {
      if (id == null) id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    };
    const stop = () => {
      if (id != null) {
        window.clearInterval(id);
        id = null;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
}

interface Props {
  firstName: string | null;
  /** Extracted current weather ({ temp, description, Icon }) or null. */
  weather: any;
  /** Raw Open-Meteo snapshot — frost-tonight + rain-today reads. */
  rawWeather: any;
  /** RHO-20 — today's task breakdown. */
  todaySummary: TodaySummary;
  overdueCount: number;
  /** Active weather alerts — the hero may LEAD with a severe one (the global
   *  banner remains the alert's canonical, dismissible owner). */
  alerts?: HeroAlert[];
  /** Home coordinates for the sun micro-line; line hides without them. */
  homeLat?: number | null;
  homeLng?: number | null;
  /** Hero voice — "sentence" (Porch) or "console" (Workbench). */
  variant?: "sentence" | "console";
  /** Gates the migrated ask-AI chip (RHO-11 — hidden for non-AI tiers). */
  aiEnabled?: boolean;
  /** Passed through to the ask-AI page context. */
  hardinessZone?: number | null;
}

export default function HomeStatusStrip({
  firstName,
  weather,
  rawWeather,
  todaySummary,
  overdueCount,
  alerts = [],
  homeLat = null,
  homeLng = null,
  variant = "sentence",
  aiEnabled = false,
  hardinessZone = null,
}: Props) {
  const navigate = useNavigate();
  const { setIsOpen: setChatOpen, setPageContext } = usePlantDoctor();
  useMinuteTick(); // re-render each minute so the sun line stays honest
  const now = new Date();
  // Open-Meteo's daily.time entries are local-to-LOCATION dates — derive
  // "today" in the home's timezone when the snapshot carries one, so a
  // traveling user near midnight doesn't silently lose the frost/rain
  // clauses (device-local date is the fallback).
  const todayStr = (() => {
    const tz = rawWeather?.timezone;
    if (tz) {
      try {
        return new Date().toLocaleDateString("en-CA", { timeZone: tz });
      } catch {
        /* unknown tz string — fall through */
      }
    }
    return getLocalDateString(now);
  })();

  const frostMinC = extractFrostMin(rawWeather, todayStr);
  const rainTodayMm = extractRainToday(rawWeather, todayStr);

  const sun = useMemo(() => {
    if (homeLat == null || homeLng == null) return null;
    try {
      const t = SunCalc.getTimes(new Date(), homeLat, homeLng);
      // Validate BOTH times — at extreme latitudes SunCalc can return a valid
      // golden hour with an Invalid Date sunset, which would otherwise render
      // "sunset NaN:NaN" (review finding).
      const valid = (d: unknown): d is Date => d instanceof Date && !isNaN(d.getTime());
      if (!valid(t.goldenHour) || !valid(t.sunset)) return null;
      return { goldenPM: t.goldenHour, sunset: t.sunset };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeLat, homeLng, todayStr]);

  const heroInputs = {
    todaySummary,
    overdueCount,
    frostMinC,
    rainTodayMm,
    alerts,
  };

  const dateEyebrow = now
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase();

  // ── Console voice (the Workbench) ─────────────────────────────────────────
  if (variant === "console") {
    const segments = composeConsoleSegments({
      ...heroInputs,
      weatherNow: weather ? { tempC: weather.temp, description: weather.description ?? "" } : null,
      sun,
      now,
    });
    return (
      <div data-testid="home-status-strip" className="px-1 py-2">
        <p className="text-3xs font-bold uppercase tracking-widest text-rhozly-on-surface/35 select-none">
          {dateEyebrow}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mt-0.5">
          <h1 className="text-xl sm:text-2xl font-display font-black tracking-tight text-rhozly-on-surface leading-tight">
            {timeOfDayGreeting(now, firstName)}
          </h1>
          <p
            data-testid="hero-console-line"
            className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-bold tabular-nums"
          >
            {segments.map((seg, i) => (
              <React.Fragment key={seg.id}>
                {i > 0 && <span aria-hidden className="text-rhozly-on-surface/25">·</span>}
                {seg.to ? (
                  <button
                    data-testid={`hero-seg-${seg.id}`}
                    onClick={() => navigate(seg.to!)}
                    className={`can-hover:hover:underline underline-offset-2 transition-colors ${
                      seg.tone === "danger"
                        ? "text-status-danger-ink"
                        : "text-rhozly-on-surface/65 can-hover:hover:text-rhozly-primary"
                    }`}
                  >
                    {seg.label}
                  </button>
                ) : (
                  <span data-testid={`hero-seg-${seg.id}`} className="text-rhozly-on-surface/45">
                    {seg.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </p>
          {/* Migrated from the retired DailyBriefCard (redesign Stage 2):
              the ask-AI entry keeps its testid + tier gate (RHO-11). */}
          {aiEnabled && (
            <button
              data-testid="daily-brief-ask-ai"
              onClick={() => {
                setPageContext({
                  action: "Asking from the dashboard hero",
                  context: {
                    today_task_count: todaySummary.total,
                    overdue_count: overdueCount,
                    weather_summary: weather?.description ?? null,
                    weather_temp_c: weather?.temp ?? null,
                    hardiness_zone: hardinessZone ?? null,
                  },
                });
                setChatOpen(true);
              }}
              aria-label="Ask Rhozly AI a question"
              title="Ask Rhozly AI"
              className="inline-flex items-center gap-1 text-2xs font-black uppercase tracking-widest text-rhozly-primary/80 can-hover:hover:text-rhozly-primary transition-colors"
            >
              <MessageSquare size={11} aria-hidden />
              Ask AI
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Sentence voice (the Porch) ────────────────────────────────────────────
  const sentence = composeHeroSentence(heroInputs);
  const sunLine = formatSunMicroLine(sun, now);

  return (
    <div data-testid="home-status-strip" className="px-1 pt-4 pb-2 sm:pt-6">
      <p className="text-3xs font-bold uppercase tracking-widest text-rhozly-on-surface/35 select-none">
        {dateEyebrow}
      </p>
      <h1 className="mt-1 text-3xl sm:text-4xl font-display font-black tracking-tight text-rhozly-on-surface leading-[1.05]">
        {timeOfDayGreeting(now, firstName)}
      </h1>
      <p
        data-testid="hero-sentence"
        className="mt-2 text-sm sm:text-base font-bold text-rhozly-on-surface-variant leading-snug max-w-xl"
      >
        {sentence}
      </p>
      {sunLine && (
        <p className="mt-1.5 text-2xs font-bold text-rhozly-on-surface/70 tabular-nums select-none">
          {sunLine}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          data-testid="hero-plan-day"
          onClick={() => navigate("/dashboard?view=calendar")}
          className="inline-flex items-center gap-1 text-xs font-black text-white bg-rhozly-primary px-3.5 py-2 min-h-[36px] rounded-full active:scale-[0.97] transition-transform duration-100 ease-spring"
        >
          Plan my day <ChevronRight size={13} aria-hidden />
        </button>
        {weather && (
          <button
            data-testid="hero-weather-chip"
            onClick={() => navigate("/dashboard?view=weather")}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-rhozly-on-surface/60 bg-rhozly-primary/5 px-3 py-2 min-h-[36px] rounded-full can-hover:hover:bg-rhozly-primary/10 active:scale-[0.97] transition-all duration-100"
          >
            {weather.Icon ? <weather.Icon size={14} aria-hidden /> : null}
            {Math.round(weather.temp)}° {weather.description}
          </button>
        )}
      </div>
    </div>
  );
}
