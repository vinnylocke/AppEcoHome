import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Sunset, CheckCircle2, CloudRain, Thermometer, Sparkles, ChevronRight, Leaf, MessageSquare, Wind } from "lucide-react";
import SunCalc from "suncalc";
import { usePlantDoctor } from "../context/PlantDoctorContext";

interface Props {
  firstName: string | null;
  weather: any;                                    // Already-extracted current weather
  rawWeather: any;                                  // Raw snapshot for tomorrow's data
  locations: Array<{ lat?: number; lng?: number }>; // For sunrise / sunset / golden hour
  alerts: Array<{ severity?: string; title?: string }>;
  todayTaskCount: number;
  overdueCount: number;
  homeLat?: number | null;
  homeLng?: number | null;
  hardinessZone?: number | null;
}

function timeOfDayGreeting(d: Date): string {
  const h = d.getHours();
  if (h < 5)  return "Good evening";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function DailyBriefCard({
  firstName,
  weather,
  rawWeather,
  alerts,
  todayTaskCount,
  overdueCount,
  homeLat,
  homeLng,
  hardinessZone,
}: Props) {
  const navigate = useNavigate();
  const { setIsOpen, setPageContext } = usePlantDoctor();
  const now = new Date();

  // Sun events for today
  const sun = useMemo(() => {
    if (homeLat == null || homeLng == null) return null;
    try {
      const times = SunCalc.getTimes(now, homeLat, homeLng);
      return {
        sunrise:    times.sunrise,
        sunset:     times.sunset,
        goldenPM:   times.goldenHour,
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homeLat, homeLng, now.toDateString()]);

  // Tomorrow's min temp for frost mention
  const frostHint = useMemo((): { tempMin: number; risk: "mild" | "moderate" | "severe" } | null => {
    if (!rawWeather?.daily?.time) return null;
    const times: string[] = rawWeather.daily.time;
    const mins: number[] = rawWeather.daily.temperature_2m_min ?? [];
    const todayKey = now.toISOString().split("T")[0];
    const todayIdx = times.findIndex(t => t === todayKey);
    if (todayIdx === -1) return null;
    const tonightMin = mins[todayIdx];
    if (!isFinite(tonightMin) || tonightMin > 3) return null;
    const risk = tonightMin <= -3 ? "severe" : tonightMin <= 0 ? "moderate" : "mild";
    return { tempMin: tonightMin, risk };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawWeather]);

  const isCurrentlyInGoldenHour = sun
    ? (now >= sun.goldenPM && now <= sun.sunset)
    : false;
  const goldenHourComingUp = sun
    ? (now < sun.goldenPM && now < sun.sunset)
    : false;

  const greeting = timeOfDayGreeting(now);
  const headlineParts: string[] = [];
  if (overdueCount > 0) {
    headlineParts.push(`${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}`);
  } else if (todayTaskCount > 0) {
    headlineParts.push(`${todayTaskCount} task${todayTaskCount !== 1 ? "s" : ""} today`);
  } else {
    headlineParts.push("no tasks today");
  }
  if (weather?.description) {
    headlineParts.push(weather.description.toLowerCase());
  }
  if (alerts.length > 0) {
    headlineParts.push(`${alerts.length} weather alert${alerts.length !== 1 ? "s" : ""}`);
  }

  const headline = headlineParts.join(" · ");

  return (
    <div
      data-testid="daily-brief-card"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rhozly-primary via-rhozly-primary-container to-emerald-700 text-white p-5 sm:p-6 shadow-lg"
    >
      {/* Decorative leaf glow */}
      <div className="absolute -top-12 -right-8 w-48 h-48 bg-white/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-12 w-56 h-56 bg-emerald-400/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative">
        {/* Greeting */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/65">
              {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <h2 className="font-display font-black text-2xl sm:text-3xl leading-tight mt-0.5">
              {greeting}{firstName ? `, ${firstName}` : ""}
            </h2>
          </div>
          {weather?.Icon && (
            <div className="bg-white/15 backdrop-blur-sm p-2.5 rounded-2xl border border-white/15 shrink-0">
              <weather.Icon className="w-6 h-6" />
            </div>
          )}
        </div>

        {/* Headline summary */}
        <p className="text-sm font-bold text-white/85 leading-snug mb-4">
          Today: {headline}
        </p>

        {/* Quick stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Tasks today */}
          <button
            onClick={() => navigate("/dashboard?view=calendar")}
            className={`flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl backdrop-blur-sm border transition-colors text-left ${
              overdueCount > 0
                ? "bg-amber-500/30 border-amber-300/30 hover:bg-amber-500/40"
                : "bg-white/10 border-white/15 hover:bg-white/20"
            }`}
            aria-label={overdueCount > 0 ? `${overdueCount} overdue tasks` : `${todayTaskCount} tasks today`}
          >
            <CheckCircle2 size={16} className="shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70 leading-none">
                {overdueCount > 0 ? "Overdue" : "Today"}
              </p>
              <p className="text-sm font-black leading-tight">
                {overdueCount > 0 ? `${overdueCount} task${overdueCount !== 1 ? "s" : ""}` : `${todayTaskCount} task${todayTaskCount !== 1 ? "s" : ""}`}
              </p>
            </div>
          </button>

          {/* Weather */}
          {weather && (
            <button
              onClick={() => navigate("/dashboard?view=weather")}
              className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/20 transition-colors text-left"
              aria-label={`${Math.round(weather.temp)}°C`}
            >
              <Thermometer size={16} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 leading-none">
                  Now
                </p>
                <p className="text-sm font-black leading-tight">
                  {Math.round(weather.temp)}°C
                </p>
              </div>
            </button>
          )}

          {/* Golden hour */}
          {sun && (isCurrentlyInGoldenHour || goldenHourComingUp) && (
            <button
              onClick={() => navigate("/sun-trajectory?mode=ar")}
              className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl bg-amber-500/30 backdrop-blur-sm border border-amber-300/30 hover:bg-amber-500/40 transition-colors text-left"
              aria-label="Golden hour"
            >
              <Sparkles size={16} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 leading-none">
                  {isCurrentlyInGoldenHour ? "Golden hour" : "Golden hour"}
                </p>
                <p className="text-sm font-black leading-tight">
                  {isCurrentlyInGoldenHour ? "Now" : formatTime(sun.goldenPM)}
                </p>
              </div>
            </button>
          )}

          {/* Sunset (only shown if golden hour chip not shown) */}
          {sun && !isCurrentlyInGoldenHour && !goldenHourComingUp && (
            <button
              onClick={() => navigate("/sun-trajectory")}
              className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/20 transition-colors text-left"
              aria-label="Sunset"
            >
              <Sunset size={16} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 leading-none">
                  Sunset
                </p>
                <p className="text-sm font-black leading-tight">
                  {formatTime(sun.sunset)}
                </p>
              </div>
            </button>
          )}

          {/* Frost chip — only when relevant */}
          {frostHint && (
            <button
              onClick={() => navigate("/dashboard?view=weather")}
              className="flex items-center gap-2 px-3 py-2 min-h-[44px] rounded-xl bg-sky-500/40 backdrop-blur-sm border border-sky-300/40 hover:bg-sky-500/50 transition-colors text-left"
              aria-label={`Frost risk: ${frostHint.risk}`}
            >
              <CloudRain size={16} className="shrink-0" />
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70 leading-none">
                  Tonight
                </p>
                <p className="text-sm font-black leading-tight">
                  ❄ {frostHint.tempMin.toFixed(0)}°C
                </p>
              </div>
            </button>
          )}
        </div>

        {/* Footer — climate strip + plan-day CTA */}
        <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {hardinessZone != null && (
              <button
                onClick={() => navigate("/home-management")}
                data-testid="daily-brief-zone-chip"
                className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/15 transition-colors"
                title="USDA hardiness zone — drives plant suitability"
                aria-label={`USDA zone ${hardinessZone}`}
              >
                <Leaf size={11} />
                Zone {hardinessZone}
              </button>
            )}
            <button
              onClick={() => navigate("/garden-layout")}
              data-testid="daily-brief-microclimate-chip"
              className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/15 transition-colors"
              title="Open a layout to see your garden's sun, wind, and frost outlook by area"
              aria-label="Open garden layouts"
            >
              <Wind size={11} />
              Microclimate
            </button>
            <p className="text-[11px] font-bold text-white/65 leading-snug min-w-0">
              {alerts.length > 0
                ? <>⚠ <span className="text-white/85 font-black">{alerts[0].title}</span></>
                : <>{sun ? <>Sunrise was {formatTime(sun.sunrise)} · day length {sun ? formatHoursMinutes((sun.sunset.getTime() - sun.sunrise.getTime()) / 3_600_000) : "—"}</> : "Plan your day below"}</>
              }
            </p>
            <button
              onClick={() => {
                setPageContext({
                  action: "Asking from the dashboard Daily Brief",
                  context: {
                    today_task_count: todayTaskCount,
                    overdue_count: overdueCount,
                    weather_summary: weather?.summary ?? null,
                    weather_temp_c: weather?.temp ?? null,
                    hardiness_zone: hardinessZone ?? null,
                  },
                });
                setIsOpen(true);
              }}
              data-testid="daily-brief-ask-ai"
              className="inline-flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border border-white/15 transition-colors"
              aria-label="Ask Rhozly AI a question"
              title="Ask Rhozly AI"
            >
              <MessageSquare size={11} />
              Got a plant question?
            </button>
          </div>
          <button
            onClick={() => navigate("/dashboard?view=calendar")}
            className="shrink-0 flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-white/85 hover:text-white transition-colors"
            aria-label="Open today's calendar"
          >
            Plan day <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function formatHoursMinutes(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}
