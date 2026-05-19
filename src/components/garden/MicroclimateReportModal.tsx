import React, { useEffect, useMemo, useState } from "react";
import { X, Wind, Snowflake, Sun, Lightbulb, Loader2, Printer } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import type { ShapeData } from "../GardenShapeProperties";
import type { ShapeSunResult } from "../../lib/sunAnalysis";
import {
  computeMicroclimate,
  type ForecastDay,
  type ShapeMicroclimate,
  type FrostRisk,
  type WindExposure,
} from "../../lib/garden/microclimate";

interface Props {
  shapes: ShapeData[];
  homeId: string;
  sunAnalysisResults: ShapeSunResult[] | null;
  recentLuxByArea: Record<string, number | null>;
  onClose: () => void;
}

const FROST_TONE: Record<FrostRisk, string> = {
  "None":     "bg-slate-100 text-slate-600",
  "Mild":     "bg-sky-100 text-sky-700",
  "Moderate": "bg-orange-100 text-orange-700",
  "Severe":   "bg-red-100 text-red-700",
};

const WIND_TONE: Record<WindExposure, string> = {
  "Sheltered":        "bg-emerald-100 text-emerald-700",
  "Partly Sheltered": "bg-amber-100 text-amber-700",
  "Exposed":          "bg-red-100 text-red-700",
};

export default function MicroclimateReportModal({
  shapes, homeId, sunAnalysisResults, recentLuxByArea, onClose,
}: Props) {
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("weather_snapshots")
          .select("data")
          .eq("home_id", homeId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;

        // Open-Meteo & cached snapshot shapes vary. Try multiple paths.
        const raw = (data?.data ?? {}) as any;
        const daily = raw.daily ?? raw.forecast ?? raw.next7 ?? null;
        let parsed: ForecastDay[] = [];
        if (daily?.time && daily?.temperature_2m_min) {
          // Open-Meteo wide layout
          for (let i = 0; i < daily.time.length; i++) {
            parsed.push({
              date: daily.time[i],
              temp_min_c: daily.temperature_2m_min[i] ?? 0,
              temp_max_c: daily.temperature_2m_max?.[i] ?? 0,
              wind_speed_kph: daily.windspeed_10m_max?.[i],
              precip_mm: daily.precipitation_sum?.[i],
            });
          }
        } else if (Array.isArray(daily)) {
          parsed = daily.map((d: any) => ({
            date: d.date ?? d.day ?? "",
            temp_min_c: d.temp_min_c ?? d.min ?? d.tempmin ?? 0,
            temp_max_c: d.temp_max_c ?? d.max ?? d.tempmax ?? 0,
            wind_speed_kph: d.wind_speed_kph ?? d.windspeed,
            precip_mm: d.precip_mm ?? d.precipitation,
          }));
        }
        setForecast(parsed);
      } catch (err) {
        Logger.error("Failed to load forecast for microclimate report", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [homeId]);

  const reports = useMemo<ShapeMicroclimate[]>(() => {
    const rows: ShapeMicroclimate[] = [];
    for (const s of shapes) {
      if (s.preset_id === "garden-boundary") continue;
      const sunResult = sunAnalysisResults?.find((r) => r.shapeId === s.id);
      const recentLux = s.area_id ? (recentLuxByArea[s.area_id] ?? null) : null;
      rows.push(computeMicroclimate(s, shapes, sunResult, recentLux, forecast));
    }
    return rows;
  }, [shapes, sunAnalysisResults, recentLuxByArea, forecast]);

  return (
    <div
      data-testid="microclimate-report-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4"
    >
      <div id="microclimate-print-root" className="bg-white rounded-3xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-rhozly-outline/10 shrink-0">
          <div>
            <p className="text-[10px] font-black text-rhozly-on-surface/40 uppercase tracking-widest">Garden insights</p>
            <p className="font-black text-rhozly-on-surface">Microclimate Report</p>
            <p className="text-[10px] font-bold text-rhozly-on-surface/40 mt-0.5 hidden print:block">
              Generated {new Date().toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="flex items-center gap-1 print:hidden">
            <button
              data-testid="microclimate-print-btn"
              onClick={() => window.print()}
              aria-label="Print or save as PDF"
              title="Print or save as PDF"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/60 hover:text-rhozly-primary hover:bg-rhozly-surface transition-colors"
            >
              <Printer size={18} />
            </button>
            <button
              data-testid="microclimate-close-btn"
              onClick={onClose}
              aria-label="Close report"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-rhozly-on-surface/30" />
            </div>
          ) : reports.length === 0 ? (
            <p className="text-center text-sm font-bold text-rhozly-on-surface/40 py-6">
              Draw some shapes first to see microclimate data.
            </p>
          ) : (
            reports.map((r) => (
              <div
                key={r.shapeId}
                data-testid={`microclimate-row-${r.shapeId}`}
                className="bg-rhozly-surface rounded-2xl p-4 space-y-2 border border-rhozly-outline/10"
              >
                <p className="font-black text-rhozly-on-surface text-sm">{r.label ?? "Unnamed shape"}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Cell Icon={Sun} label="Sun" value={r.sunClass ?? "Unknown"} sub={r.sunHours != null ? `${r.sunHours.toFixed(1)}h direct` : null} />
                  <Cell Icon={Lightbulb} label="Recent lux" value={r.recentLux != null ? `${Math.round(r.recentLux).toLocaleString()}` : "—"} />
                  <Cell Icon={Wind} label="Wind" value={r.windExposure} toneClass={WIND_TONE[r.windExposure]} />
                  <Cell Icon={Snowflake} label="Frost tonight" value={r.frostRiskTonight} sub={`7-day: ${r.frostRiskNext7}`} toneClass={FROST_TONE[r.frostRiskTonight]} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ Icon, label, value, sub, toneClass }: { Icon: any; label: string; value: string; sub?: string | null; toneClass?: string }) {
  return (
    <div className={`rounded-xl p-2 ${toneClass ?? "bg-white"}`}>
      <p className="text-[9px] font-black opacity-70 uppercase tracking-widest flex items-center gap-1">
        <Icon size={10} /> {label}
      </p>
      <p className="text-xs font-black mt-0.5 truncate">{value}</p>
      {sub && <p className="text-[9px] font-bold opacity-60 truncate">{sub}</p>}
    </div>
  );
}
