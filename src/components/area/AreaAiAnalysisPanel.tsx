// AI Area Coach — tier-gated tab inside the Area Metrics modal.
//
// Auto-runs on open (cache-aware): paints the last cached insight instantly,
// then asks the `area-sensor-analysis` edge fn to refresh — which returns the
// cache untouched unless a newer reading exists (no Gemini spend) or `force`.

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, Lock, AlertTriangle, Droplets, Zap, Thermometer, Cpu, Leaf, Scale } from "lucide-react";
import {
  fetchAreaInsight,
  generateAreaInsight,
  type AreaInsight,
  type AreaInsightResult,
  type MetricKey,
  type MetricFit,
} from "../../services/areaSensorsService";
import { metricLabel, statusMeta, compatibilityMeta, formatAnalysedLabel } from "../../lib/areaInsight";

interface Props {
  areaId: string;
  homeId: string;
  aiEnabled: boolean;
}

const METRIC_ICON: Record<MetricKey, typeof Droplets> = {
  moisture: Droplets,
  ec: Zap,
  temperature: Thermometer,
};

// Always present the metrics in this fixed order so the analysis reads the same
// every time, regardless of the order the model returned them.
const METRIC_ORDER: MetricKey[] = ["moisture", "temperature", "ec"];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const fmtRange = (min: number | null, max: number | null, unit: string) =>
  min != null && max != null ? `${min}–${max}${unit}` : "—";

// Compact per-metric fit pill for a single plant (icon-only, tooltip = label).
function FitPill({ icon: Icon, fit, title }: { icon: typeof Droplets; fit: MetricFit; title: string }) {
  const meta = statusMeta(fit);
  return (
    <span title={`${title}: ${meta.label}`} className={`inline-flex items-center justify-center rounded-full p-1 ${meta.badgeClass}`}>
      <Icon className="h-3 w-3" />
    </span>
  );
}

export default function AreaAiAnalysisPanel({ areaId, homeId, aiEnabled }: Props) {
  const [result, setResult] = useState<AreaInsightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const ranAutoRef = useRef(false);

  const run = useCallback(async (force: boolean) => {
    setLoading(true);
    const res = await generateAreaInsight(homeId, areaId, force);
    setResult(res);
    setLoading(false);
  }, [homeId, areaId]);

  // Auto-run once on open (cache-aware). Paint cache first for an instant view.
  useEffect(() => {
    if (!aiEnabled || ranAutoRef.current) return;
    ranAutoRef.current = true;
    let cancelled = false;
    (async () => {
      const cachedRow = await fetchAreaInsight(areaId);
      if (!cancelled && cachedRow) setResult(cachedRow);
      if (!cancelled) await run(false);
    })();
    return () => { cancelled = true; };
  }, [aiEnabled, areaId, run]);

  if (!aiEnabled) {
    return (
      <div
        data-testid="area-ai-analysis-upgrade"
        className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-6 text-center"
      >
        <Lock className="mx-auto mb-2 h-6 w-6 text-emerald-600" />
        <h4 className="font-semibold text-emerald-900">AI Area Coach</h4>
        <p className="mt-1 text-sm text-emerald-800/80">
          Upgrade to an AI plan to get target moisture, EC and soil-temperature ranges
          tailored to the plants in this area, plus automation suggestions.
        </p>
      </div>
    );
  }

  const insight = result?.insight ?? null;
  const err = result?.error;

  return (
    <div data-testid="area-ai-analysis-panel" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          <h4 className="font-semibold text-gray-900">AI Area Coach</h4>
        </div>
        <button
          type="button"
          data-testid="area-ai-reanalyse"
          onClick={() => run(true)}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Analysing…" : "Re-analyse"}
        </button>
      </div>

      {loading && !insight && (
        <div className="space-y-3" data-testid="area-ai-loading">
          <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
          <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
        </div>
      )}

      {err === "rate_limit" && (
        <div data-testid="area-ai-rate-limit" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          You've reached today's analysis limit. Your last insight is still shown below — try again later.
        </div>
      )}
      {(err === "analysis_failed" || err === "unknown" || err === "ai_disabled") && (
        <div data-testid="area-ai-error" className="flex items-start gap-2 rounded-lg bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {err === "ai_disabled"
            ? "AI features aren't enabled on your plan."
            : "The analysis couldn't be generated this time. Tap Re-analyse to retry."}
        </div>
      )}

      {result?.empty && (
        <div data-testid="area-ai-empty" className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-600">
          <Cpu className="mx-auto mb-2 h-6 w-6 text-gray-400" />
          Link a soil sensor or add plants to this area to get AI coaching on moisture, EC and temperature.
        </div>
      )}

      {insight && (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50/70 p-4">
            <p className="font-semibold text-emerald-900">{insight.headline}</p>
            <p className="mt-1 text-sm text-emerald-900/80">{insight.summary}</p>
          </div>

          <div className="space-y-3">
            {METRIC_ORDER.map((key) => {
              const m = insight.metrics.find((x) => x.metric === key);
              if (!m) return null;
              const Icon = METRIC_ICON[m.metric] ?? Droplets;
              const meta = statusMeta(m.status);
              return (
                <div key={m.metric} data-testid={`area-ai-metric-${m.metric}`} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span className="font-medium text-gray-900">{metricLabel(m.metric)}</span>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-3 text-sm">
                    {typeof m.current === "number" && (
                      <span className="text-gray-900">
                        Now <span className="font-semibold">{m.current}{m.unit}</span>
                      </span>
                    )}
                    <span className="text-gray-500">
                      Target for your plants <span className="font-semibold">{m.ideal_min}–{m.ideal_max}{m.unit}</span>
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{m.meaning}</p>
                  <p className="mt-1 text-sm text-gray-600">{m.why_for_these_plants}</p>
                  <p className="mt-2 text-sm font-medium text-emerald-800">{m.recommendation}</p>
                </div>
              );
            })}
          </div>

          {(() => {
            const ranges = insight.plant_ranges ?? [];
            const analysis = insight.plant_analysis ?? [];
            // Prefer the deterministic, deduped per-plant ranges; overlay the AI
            // fit/notes when a matching entry exists. Fall back to analysis-only
            // for legacy cached insights without plant_ranges.
            const rows = ranges.length > 0
              ? ranges.map((r) => ({ r, a: analysis.find((x) => x.name === r.name || x.name.startsWith(r.name)) ?? null }))
              : analysis.map((a) => ({ r: null as null, a }));
            if (rows.length === 0) return null;
            return (
              <div data-testid="area-ai-plants" className="space-y-2">
                <div className="flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-emerald-600" />
                  <h5 className="font-medium text-gray-900">Each plant in this area</h5>
                </div>
                {rows.map(({ r, a }, i) => {
                  const name = r ? (r.count > 1 ? `${r.name} (×${r.count})` : r.name) : a!.name;
                  return (
                    <div key={i} data-testid={`area-ai-plant-${slug(name)}`} className="rounded-xl border border-gray-100 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-gray-900">{name}</span>
                        {a && (
                          <div className="flex items-center gap-1">
                            <FitPill icon={Droplets} fit={a.moisture_fit} title="Moisture" />
                            <FitPill icon={Thermometer} fit={a.temp_fit} title="Soil temp" />
                            <FitPill icon={Zap} fit={a.ec_fit} title="EC" />
                          </div>
                        )}
                      </div>
                      {r && (
                        <p className="mt-1 text-xs text-gray-500">
                          Target — moisture {fmtRange(r.moisture_min, r.moisture_max, "%")} · EC {fmtRange(r.ec_min, r.ec_max, " µS/cm")} · soil temp {fmtRange(r.temp_min, r.temp_max, "°C")}
                        </p>
                      )}
                      {a?.notes && <p className="mt-1.5 text-sm text-gray-600">{a.notes}</p>}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {insight.compatibility && (
            <div data-testid="area-ai-compatibility" className={`rounded-xl p-4 ${compatibilityMeta(insight.compatibility.verdict).toneClass}`}>
              <div className="flex items-center gap-2">
                <Scale className="h-4 w-4" />
                <span className="font-semibold">{compatibilityMeta(insight.compatibility.verdict).label}</span>
                {insight.compatibility.moisture_only && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium">
                    <Droplets className="h-3 w-3" /> watering only
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm opacity-90">{insight.compatibility.note}</p>
            </div>
          )}

          {(insight.automation_review || (insight.automation_suggestions?.length ?? 0) > 0) && (
            <div data-testid="area-ai-automations" className="rounded-xl border border-gray-100 p-4">
              <h5 className="font-medium text-gray-900">Automations</h5>
              {insight.automation_review && (
                <p className={`mt-1 text-sm ${insight.automation_review.ok ? "text-emerald-700" : "text-amber-700"}`}>
                  {insight.automation_review.notes}
                </p>
              )}
              {(insight.automation_suggestions?.length ?? 0) > 0 && (
                <ul className="mt-2 space-y-2">
                  {insight.automation_suggestions!.map((s, i) => (
                    <li key={i} className="rounded-lg bg-gray-50 p-3 text-sm">
                      <p className="font-medium text-gray-900">{s.title}</p>
                      <p className="text-gray-600">{s.description}</p>
                      {typeof s.suggested_moisture_threshold_pct === "number" && (
                        <p className="mt-1 text-xs text-gray-500">Suggested trigger: moisture &lt; {s.suggested_moisture_threshold_pct}%</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>{insight.confidence_note}</span>
            <span>{formatAnalysedLabel(result?.generatedAt)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export the type so consumers can import from the component if convenient.
export type { AreaInsight };
