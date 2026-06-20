import React, { useEffect, useState } from "react";
import { Lightbulb, Check, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import toast from "react-hot-toast";

interface Suggestion {
  id: string;
  kind: string;
  field: string | null;
  current_value: unknown;
  proposed_value: unknown;
  rationale: string;
  ai_rationale: string | null;
  confidence: number;
}

const KIND_LABEL: Record<string, string> = {
  raise_run_limit: "Water more often",
  reduce_watering: "Ease off watering",
  enable_weather_skip: "Skip watering before rain",
};

/**
 * Tuning suggestions for one automation (Pillar B). Reads active
 * automation_suggestions and offers one-tap Apply (managers only) / Dismiss /
 * Details. Apply mutates the automation directly — gated by the automations
 * table RLS, so a non-manager's apply fails safe. Renders nothing when there
 * are no active suggestions.
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
        .select("id, kind, field, current_value, proposed_value, rationale, ai_rationale, confidence")
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
        <div key={s.id} className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <div className="flex items-start gap-2">
            <Lightbulb size={15} className="text-amber-500 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-black text-amber-800">{KIND_LABEL[s.kind] ?? "Suggestion"}</p>
              <p className="text-[12px] font-medium text-amber-900/80 mt-0.5">{s.ai_rationale ?? s.rationale}</p>
              {openId === s.id && s.field && (
                <p className="text-[11px] font-bold text-amber-900/55 mt-1 tabular-nums">
                  {s.field}: {String(s.current_value)} → {String(s.proposed_value)}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-2">
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
