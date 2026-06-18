// AI Area Coach — tier-gated tab inside the Area Metrics modal.
//
// Auto-runs on open (cache-aware): paints the last cached insight instantly,
// then asks the `area-sensor-analysis` edge fn to refresh — which returns the
// cache untouched unless a newer reading exists (no Gemini spend) or `force`.

import { useCallback, useEffect, useRef, useState } from "react";
import { Sparkles, RefreshCw, Lock, AlertTriangle, Droplets, Zap, Thermometer, Cpu } from "lucide-react";
import {
  fetchAreaInsight,
  generateAreaInsight,
  type AreaInsight,
  type AreaInsightResult,
  type MetricKey,
} from "../../services/areaSensorsService";
import { metricLabel, statusMeta, formatAnalysedLabel } from "../../lib/areaInsight";

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
