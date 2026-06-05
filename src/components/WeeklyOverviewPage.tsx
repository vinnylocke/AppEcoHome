import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  CloudRain,
  Sun,
  Wind,
  Snowflake,
  Sprout,
  Wheat,
  Scissors,
  Wrench,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Sparkles,
  ChevronLeft,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../lib/supabase";
import { Logger } from "../lib/errorHandler";
import SeasonalPicksCard from "./seasonal/SeasonalPicksCard";

// ─── Weekly Overview ──────────────────────────────────────────────────────
//
// Reads the latest weekly_overviews row for the home and renders all
// sections of the jsonb payload — task counts, weather events, sowing
// suggestions, harvest / prune windows opening, maintenance roll-up,
// AI + seasonal tips, pest/disease risk lines, pollen forecast.
//
// Generated weekly by the generate-weekly-overviews cron (Sunday 06:00
// UTC). Sage+ users get a "Regenerate" button that triggers an on-demand
// rebuild for their home only.

interface WeeklyOverviewPayload {
  task_counts?: Record<string, number>;
  weather_events?: WeatherEvent[];
  sow_this_week?: { plant_name: string; why?: string }[];
  harvest_this_week?: { plant_name: string; reason?: string }[];
  prune_this_week?: { plant_name: string; reason?: string }[];
  maintenance_count?: number;
  tips?: string[];
  pest_disease_risk?: RiskLine[];
  pollen?: PollenPayload | null;
  home_name?: string | null;
  week_start?: string;
  week_end?: string;
}

interface WeatherEvent {
  kind: "frost" | "heatwave" | "heavy_rain" | "strong_wind";
  date: string;
  day: string;
  severity: "info" | "warning" | "critical";
  note: string;
}

interface RiskLine {
  plant_name: string;
  risk_kind: string;
  level: "low" | "elevated" | "high";
  note: string;
  action: string;
}

interface PollenPayload {
  grass?: PollenDay[];
  birch?: PollenDay[];
  ragweed?: PollenDay[];
}
interface PollenDay { day: string; date: string; peak: number; level: "low" | "moderate" | "high" }

function formatDateRange(startStr?: string, endStr?: string): string {
  if (!startStr || !endStr) return "";
  const start = new Date(startStr + "T12:00:00Z");
  const end = new Date(endStr + "T12:00:00Z");
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

const WEATHER_ICON: Record<WeatherEvent["kind"], React.ReactNode> = {
  frost: <Snowflake size={14} className="text-sky-500" />,
  heatwave: <Sun size={14} className="text-orange-500" />,
  heavy_rain: <CloudRain size={14} className="text-blue-500" />,
  strong_wind: <Wind size={14} className="text-rhozly-on-surface/60" />,
};

const WEATHER_LABEL: Record<WeatherEvent["kind"], string> = {
  frost: "Frost risk",
  heatwave: "Heatwave",
  heavy_rain: "Heavy rain",
  strong_wind: "Strong winds",
};

const SEVERITY_CLASSES: Record<WeatherEvent["severity"], string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  critical: "bg-rose-50 text-rose-700 border-rose-200",
};

const TASK_TYPE_DOT: Record<string, string> = {
  Watering: "bg-blue-400",
  Planting: "bg-emerald-400",
  Harvesting: "bg-amber-400",
  Maintenance: "bg-purple-400",
  Pruning: "bg-lime-400",
};

const RISK_BADGE: Record<RiskLine["level"], string> = {
  low: "bg-rhozly-surface-low text-rhozly-on-surface/60",
  elevated: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-rose-50 text-rose-700 border-rose-200",
};

const POLLEN_BADGE: Record<PollenDay["level"], string> = {
  low: "bg-emerald-50 text-emerald-700",
  moderate: "bg-amber-50 text-amber-700",
  high: "bg-rose-50 text-rose-700",
};

interface Props {
  homeId: string;
  aiEnabled?: boolean;
  isPremium?: boolean;
}

export default function WeeklyOverviewPage({ homeId, aiEnabled = false, isPremium = false }: Props) {
  const navigate = useNavigate();
  const [payload, setPayload] = useState<WeeklyOverviewPayload | null>(null);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("weekly_overviews")
        .select("payload, week_start, generated_at")
        .eq("home_id", homeId)
        .order("week_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setPayload(data.payload as WeeklyOverviewPayload);
        setWeekStart(data.week_start as string);
        setGeneratedAt(data.generated_at as string);
      } else {
        setPayload(null);
      }
    } catch (err: any) {
      Logger.error("Failed to load weekly overview", err);
      toast.error("Couldn't load your weekly overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [homeId]);

  const regenerate = async () => {
    setRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke(
        "generate-weekly-overviews",
        { body: { home_id: homeId } },
      );
      if (error) throw error;
      toast.success("Weekly overview regenerated.");
      await load();
    } catch (err: any) {
      Logger.error("Failed to regenerate weekly overview", err);
      toast.error("Couldn't regenerate — try again in a minute.");
    } finally {
      setRegenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-rhozly-on-surface/40">
        <Loader2 className="animate-spin" size={28} />
      </div>
    );
  }

  const taskTotal = payload?.task_counts
    ? Object.values(payload.task_counts).reduce((a, b) => a + b, 0)
    : 0;
  const lastUpdated = generatedAt
    ? new Date(generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-24">
      {/* Header */}
      <header className="mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 hover:text-rhozly-primary transition-colors mb-3"
        >
          <ChevronLeft size={12} /> Back
        </button>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1 flex items-center gap-1.5">
              <CalendarIcon size={11} className="text-rhozly-primary" /> Your week ahead
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-rhozly-on-surface">
              {formatDateRange(payload?.week_start, payload?.week_end) || "Week overview"}
            </h1>
            {lastUpdated && (
              <p className="text-[11px] font-bold text-rhozly-on-surface/40 mt-1">
                Last updated {lastUpdated}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            data-testid="weekly-overview-regenerate"
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 min-h-[36px] rounded-xl bg-rhozly-surface-low text-rhozly-on-surface/70 text-[11px] font-black uppercase tracking-widest hover:bg-rhozly-surface-mid disabled:opacity-50 transition-colors"
          >
            {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </header>

      {!payload && (
        <div className="rounded-3xl bg-rhozly-surface-low/60 border border-rhozly-outline/10 p-6 text-center">
          <p className="text-sm font-black text-rhozly-on-surface mb-1">No overview yet</p>
          <p className="text-xs font-semibold text-rhozly-on-surface/60 leading-snug mb-4">
            The weekly overview generates every Sunday morning. Tap Regenerate to build one now.
          </p>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-2xl bg-rhozly-primary text-white text-xs font-black uppercase tracking-widest hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {regenerating ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Generate now
          </button>
        </div>
      )}

      {payload && (
        <div className="space-y-4">
          {/* Tasks */}
          <Section icon={<CalendarIcon size={16} />} title="Tasks this week" subtitle={taskTotal === 0 ? "Nothing scheduled — enjoy the slow week." : `${taskTotal} task${taskTotal === 1 ? "" : "s"} across your schedule`}>
            {taskTotal > 0 && payload.task_counts && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(payload.task_counts).map(([type, count]) => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-rhozly-outline/15 text-xs font-black text-rhozly-on-surface"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${TASK_TYPE_DOT[type] ?? "bg-rhozly-primary"}`} />
                    {type} <span className="text-rhozly-on-surface/45">· {count}</span>
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* Weather */}
          <Section icon={<CloudRain size={16} />} title="Weather watch" subtitle={(payload.weather_events ?? []).length === 0 ? "Settled week ahead — no alerts in the forecast." : `${payload.weather_events!.length} alert${payload.weather_events!.length === 1 ? "" : "s"} for the week`}>
            {(payload.weather_events ?? []).length > 0 && (
              <div className="space-y-2">
                {payload.weather_events!.map((e, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border ${SEVERITY_CLASSES[e.severity]}`}
                  >
                    <span className="shrink-0">{WEATHER_ICON[e.kind]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black">
                        {WEATHER_LABEL[e.kind]} · {e.day}
                      </p>
                      <p className="text-[11px] font-semibold leading-snug opacity-80">{e.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Sow */}
          {(payload.sow_this_week ?? []).length > 0 && (
            <Section icon={<Sprout size={16} />} title="Sow this week" subtitle={`${payload.sow_this_week!.length} plant${payload.sow_this_week!.length === 1 ? "" : "s"} in the sowing window`}>
              <div className="flex flex-wrap gap-2">
                {payload.sow_this_week!.map((s, i) => (
                  <span
                    key={i}
                    className="inline-block px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-black"
                  >
                    {s.plant_name}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {/* What to grow this week — personalised picks (used to live on /quick).
              Complements the deterministic "Sow this week" chip strip above with
              the rich "why these for you" exploration card. */}
          <SeasonalPicksCard homeId={homeId} aiEnabled={aiEnabled} isPremium={isPremium} variant="dashboard" />

          {/* Harvest */}
          {(payload.harvest_this_week ?? []).length > 0 && (
            <Section icon={<Wheat size={16} />} title="Ready to harvest" subtitle={`${payload.harvest_this_week!.length} harvest window${payload.harvest_this_week!.length === 1 ? "" : "s"} active or opening`}>
              <div className="space-y-1.5">
                {payload.harvest_this_week!.map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200">
                    <p className="text-xs font-black text-amber-900">{h.plant_name}</p>
                    {h.reason && <p className="text-[11px] font-semibold text-amber-700/80">{h.reason}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Prune */}
          {(payload.prune_this_week ?? []).length > 0 && (
            <Section icon={<Scissors size={16} />} title="Pruning windows" subtitle={`${payload.prune_this_week!.length} plant${payload.prune_this_week!.length === 1 ? "" : "s"} ready for a trim`}>
              <div className="space-y-1.5">
                {payload.prune_this_week!.map((p, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-lime-50 border border-lime-200">
                    <p className="text-xs font-black text-lime-900">{p.plant_name}</p>
                    {p.reason && <p className="text-[11px] font-semibold text-lime-700/80">{p.reason}</p>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Maintenance */}
          {(payload.maintenance_count ?? 0) > 0 && (
            <Section icon={<Wrench size={16} />} title="Routine maintenance" subtitle={`${payload.maintenance_count} task${payload.maintenance_count === 1 ? "" : "s"} keep the garden ticking over`}>
              <button
                type="button"
                onClick={() => navigate("/dashboard?view=calendar")}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rhozly-surface-low text-xs font-black text-rhozly-on-surface/70 hover:bg-rhozly-surface-mid transition-colors"
              >
                Open calendar →
              </button>
            </Section>
          )}

          {/* Pest/disease risk */}
          {(payload.pest_disease_risk ?? []).length > 0 && (
            <Section icon={<AlertTriangle size={16} />} title="Risks to watch" subtitle={`${payload.pest_disease_risk!.length} risk line${payload.pest_disease_risk!.length === 1 ? "" : "s"} based on your inventory + this week's weather`}>
              <div className="space-y-2">
                {payload.pest_disease_risk!.map((r, i) => (
                  <div key={i} className={`px-3 py-2 rounded-xl border ${RISK_BADGE[r.level]}`}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-black">{r.plant_name} · {r.risk_kind}</p>
                      <span className="text-[9px] font-black uppercase tracking-widest">{r.level}</span>
                    </div>
                    <p className="text-[11px] font-semibold opacity-90 leading-snug">{r.note}</p>
                    <p className="text-[11px] font-bold opacity-80 leading-snug mt-1">→ {r.action}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Pollen */}
          {payload.pollen && (Array.isArray(payload.pollen.grass) && payload.pollen.grass.length > 0
            || Array.isArray(payload.pollen.birch) && payload.pollen.birch.length > 0
            || Array.isArray(payload.pollen.ragweed) && payload.pollen.ragweed.length > 0) && (
            <Section icon={<Sparkles size={16} />} title="Pollen forecast" subtitle="Daily peaks from Open-Meteo">
              {(["grass", "birch", "ragweed"] as const).map((kind) => {
                const days = payload.pollen?.[kind] ?? [];
                if (days.length === 0) return null;
                return (
                  <div key={kind} className="mb-3 last:mb-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/50 mb-1.5">{kind}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {days.map((d, i) => (
                        <span key={i} className={`text-[11px] font-black px-2 py-1 rounded-lg ${POLLEN_BADGE[d.level]}`}>
                          {d.day}: {d.level === "high" ? "HIGH" : d.level === "moderate" ? "MOD" : "LOW"}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </Section>
          )}

          {/* Tips */}
          {(payload.tips ?? []).length > 0 && (
            <Section icon={<Sparkles size={16} />} title="Tips for the week" subtitle="Short reminders, hand-picked + AI-grounded">
              <ul className="space-y-1.5">
                {payload.tips!.map((tip, i) => (
                  <li key={i} className="text-sm text-rhozly-on-surface/85 leading-snug flex gap-2">
                    <span className="text-rhozly-primary shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}

function Section({ icon, title, subtitle, children }: SectionProps) {
  return (
    <section className="rounded-3xl bg-white border border-rhozly-outline/10 shadow-sm p-4 sm:p-5">
      <div className="flex items-start gap-2 mb-3">
        <span className="text-rhozly-primary shrink-0 mt-0.5">{icon}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-rhozly-on-surface">{title}</h2>
          {subtitle && (
            <p className="text-[11px] font-semibold text-rhozly-on-surface/55 leading-snug">{subtitle}</p>
          )}
        </div>
      </div>
      {children && <div>{children}</div>}
    </section>
  );
}
