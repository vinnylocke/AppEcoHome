import React, { useEffect, useState } from "react";
import { Lightbulb, Check, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import toast from "react-hot-toast";

interface Evidence {
  windowDays?: number;
  rateLimited?: number;
  fired?: number;
  drydownRatePerDay?: number | null;
  retentionClass?: string | null;
  thresholdPct?: number | null;
  totalReadings?: number;
  lowReadings?: number;
  minMoisture?: number | null;
  avgMoisture?: number | null;
}

interface Suggestion {
  id: string;
  kind: string;
  field: string | null;
  current_value: unknown;
  proposed_value: unknown;
  rationale: string;
  ai_rationale: string | null;
  confidence: number;
  evidence: Evidence | null;
}

const KIND_LABEL: Record<string, string> = {
  raise_run_limit: "Water more often",
  reduce_watering: "Ease off watering",
};

const FIELD_LABEL: Record<string, string> = {
  run_limit_count: "Run limit",
  duration_seconds: "Duration",
};

const RETENTION_LABEL: Record<string, string> = {
  fast_draining: "fast-draining",
  balanced: "balanced",
  moisture_retentive: "holds water",
};

const fmt = (v: unknown) => (v == null ? "—" : String(v));
const confLabel = (c: number) => (c < 0.34 ? "Low" : c < 0.67 ? "Building" : "High");

/** The "Details" data breakdown — only rows we actually have data for. */
function detailRows(s: Suggestion): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (s.field) {
    rows.push({
      label: FIELD_LABEL[s.field] ?? "Change",
      value: `${fmt(s.current_value)} → ${fmt(s.proposed_value)}`,
    });
  }
  const e = s.evidence;
  if (e) {
    if (e.drydownRatePerDay != null) {
      rows.push({
        label: "Dries",
        value: `~${e.drydownRatePerDay}%/day${e.retentionClass ? ` (${RETENTION_LABEL[e.retentionClass] ?? e.retentionClass})` : ""}`,
      });
    }
    if ((e.rateLimited ?? 0) > 0) {
      rows.push({ label: "Hit its limit", value: `${e.rateLimited}× in ${e.windowDays ?? 7} days` });
    }
    if ((e.fired ?? 0) > 0) {
      rows.push({ label: "Watered", value: `${e.fired}× in ${e.windowDays ?? 7} days` });
    }
    if (e.thresholdPct != null && (e.totalReadings ?? 0) > 0) {
      rows.push({ label: `Below ${e.thresholdPct}% target`, value: `${e.lowReadings ?? 0} of ${e.totalReadings} readings` });
    }
    if (e.avgMoisture != null) {
      rows.push({ label: "Recent moisture", value: `avg ${e.avgMoisture}%${e.minMoisture != null ? `, low ${e.minMoisture}%` : ""}` });
    }
  }
  rows.push({ label: "Confidence", value: confLabel(s.confidence) });
  return rows;
}

/**
 * Tuning suggestions for one automation (Pillar B). Reads active
 * automation_suggestions and offers one-tap Apply (managers only) / Dismiss /
 * Details (a data breakdown). Apply mutates the automation directly — gated by
 * the automations table RLS, so a non-manager's apply fails safe. Renders
 * nothing when there are no active suggestions.
 */
export default function AutomationSuggestions({
  automationId,
  canManage,
  onApplied,
}: {
  automationId: string;
  canManage: boolean;
  onApplied?: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("automation_suggestions")
        .select("id, kind, field, current_value, proposed_value, rationale, ai_rationale, confidence, evidence")
        .eq("automation_id", automationId)
        .eq("status", "active")
        .order("confidence", { ascending: false });
      if (!cancelled) setSuggestions((data ?? []) as Suggestion[]);
    })();
    return () => { cancelled = true; };
  }, [automationId]);

  if (suggestions.length === 0) return null;

  const remove = (id: string) => setSuggestions((s) => s.filter((x) => x.id !== id));

  const apply = async (s: Suggestion) => {
    if (!s.field) return;
    setBusyId(s.id);
    // Mutate the automation — gated by the automations RLS (managers only).
    const { error: updErr } = await supabase
      .from("automations")
      .update({ [s.field]: s.proposed_value })
      .eq("id", automationId);
    if (updErr) {
      setBusyId(null);
      toast.error("Couldn't apply — you may not have permission.");
      return;
    }
    await supabase.from("automation_suggestions")
      .update({ status: "applied", updated_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusyId(null);
    remove(s.id);
    toast.success("Applied — watering updated.");
    onApplied?.();
  };

  const dismiss = async (s: Suggestion) => {
    setBusyId(s.id);
    await supabase.from("automation_suggestions")
      .update({ status: "dismissed", updated_at: new Date().toISOString() })
      .eq("id", s.id);
    setBusyId(null);
    remove(s.id);
  };

  return (
    <div className="space-y-2" data-testid={`automation-suggestions-${automationId}`}>
      {suggestions.map((s) => (
        <div key={s.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3 overflow-hidden">
          <div className="flex items-start gap-2">
            <Lightbulb size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black text-amber-800">{KIND_LABEL[s.kind] ?? "Suggestion"}</p>
              <p className="text-[12px] font-medium text-amber-900/80 mt-0.5 break-words">{s.ai_rationale ?? s.rationale}</p>

              {openId === s.id && (
                <div className="mt-2 rounded-xl bg-white/70 border border-amber-100 p-2.5 space-y-1">
                  {detailRows(s).map((r) => (
                    <div key={r.label} className="flex items-baseline justify-between gap-3 text-[11px]">
                      <span className="font-bold text-amber-900/55 shrink-0">{r.label}</span>
                      <span className="font-bold text-amber-900/85 text-right tabular-nums break-words">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {canManage && s.field && (
                  <button
                    onClick={() => apply(s)}
                    disabled={busyId === s.id}
                    data-testid={`automation-suggestion-apply-${s.id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-500 text-white text-[11px] font-black hover:bg-amber-600 transition-colors disabled:opacity-60"
                  >
                    {busyId === s.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Apply
                  </button>
                )}
                <button
                  onClick={() => dismiss(s)}
                  disabled={busyId === s.id}
                  data-testid={`automation-suggestion-dismiss-${s.id}`}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-amber-700 text-[11px] font-bold hover:bg-amber-100 transition-colors"
                >
                  <X size={11} /> Dismiss
                </button>
                <button
                  onClick={() => setOpenId((id) => (id === s.id ? null : s.id))}
                  data-testid={`automation-suggestion-details-${s.id}`}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-amber-700/70 text-[11px] font-bold hover:bg-amber-100 transition-colors"
                >
                  {openId === s.id ? <ChevronUp size={11} /> : <ChevronDown size={11} />} Details
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
