import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, X, ArrowRight, Sprout, AlertCircle } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { TaskActionButtons } from "../TaskActionButtons";
import {
  scheduleFromSchedulableTasks,
  type SchedulableTask,
} from "../../lib/scheduleFromSchedulableTask";

interface Props {
  homeId: string;
  areaId: string;
  areaName: string;
  onClose: () => void;
}

export interface RotationPlantSuggestion {
  plant_name: string;
  scientific_name?: string | null;
  family?: string | null;
  reason: string;
  schedulable_tasks: SchedulableTask[];
}

interface SuggestResponse {
  suggestions: RotationPlantSuggestion[];
}

/**
 * Layer B presentation — "Suggest plants for next season" for one area.
 *
 * Calls the `suggest-rotation-plants` edge fn (Sage+ only), renders the
 * Gemini-generated suggestions as cards with reasoning, and lets the
 * user route each suggestion's `schedulable_tasks` into the existing
 * TaskActionButtons flow so they become real planting tasks.
 */
export default function SuggestRotationPlantsSheet({
  homeId,
  areaId,
  areaName,
  onClose,
}: Props) {
  const [suggestions, setSuggestions] = useState<RotationPlantSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeAddTasks, setActiveAddTasks] = useState<{
    plantName: string;
    tasks: SchedulableTask[];
  } | null>(null);
  const trapRef = useFocusTrap<HTMLDivElement>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke(
          "suggest-rotation-plants",
          { body: { areaId, homeId } },
        );
        if (fnErr) throw fnErr;
        if (cancelled) return;
        const resp = (data ?? {}) as SuggestResponse;
        setSuggestions(resp.suggestions ?? []);
      } catch (err: any) {
        Logger.error("SuggestRotationPlantsSheet: invoke failed", err, { areaId });
        if (!cancelled) setError(err?.message ?? "Couldn't generate suggestions.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [areaId, homeId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-rhozly-bg/95 backdrop-blur-xl animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggest-rotation-title"
        className="bg-rhozly-surface-lowest w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar rounded-3xl shadow-2xl border border-rhozly-outline/20"
      >
        <div className="px-6 py-5 border-b border-rhozly-outline/10 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-2xl bg-rhozly-primary/10 text-rhozly-primary">
              <Sparkles size={18} />
            </div>
            <div>
              <h2
                id="suggest-rotation-title"
                className="text-base font-black text-rhozly-on-surface"
              >
                Plants for {areaName}, next season
              </h2>
              <p className="text-xs font-bold text-rhozly-on-surface/50 mt-0.5 leading-relaxed">
                Based on what's been grown here and the soil's needs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-rhozly-on-surface/40 hover:bg-rhozly-surface-low hover:text-rhozly-on-surface transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-3">
          {loading && (
            <div className="flex items-center gap-2 py-6 text-sm font-bold text-rhozly-on-surface/40">
              <Loader2 size={16} className="animate-spin" /> Looking through your area's history…
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && suggestions.length === 0 && (
            <div className="rounded-2xl bg-rhozly-surface-low border border-rhozly-outline/15 p-4 text-sm font-bold text-rhozly-on-surface/60">
              No suggestions came back. Try again later, or pick from the Plant Library.
            </div>
          )}

          {suggestions.map((s, i) => (
            <article
              key={`${s.plant_name}-${i}`}
              data-testid="rotation-suggestion-card"
              className="bg-white border border-rhozly-outline/15 rounded-2xl p-4 space-y-2"
            >
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 shrink-0">
                  <Sprout size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-rhozly-on-surface leading-snug">
                    {s.plant_name}
                  </p>
                  {(s.scientific_name || s.family) && (
                    <p className="text-[11px] italic text-rhozly-on-surface/50">
                      {s.scientific_name}
                      {s.scientific_name && s.family ? " · " : ""}
                      {s.family}
                    </p>
                  )}
                </div>
              </div>
              <p className="text-xs font-bold text-rhozly-on-surface/70 leading-relaxed">
                {s.reason}
              </p>
              {s.schedulable_tasks && s.schedulable_tasks.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveAddTasks({
                      plantName: s.plant_name,
                      tasks: s.schedulable_tasks,
                    })
                  }
                  data-testid="rotation-suggestion-add"
                  className="inline-flex items-center gap-1.5 text-xs font-black text-rhozly-primary hover:underline"
                >
                  Add planting tasks to calendar <ArrowRight size={12} />
                </button>
              )}
            </article>
          ))}
        </div>

        {activeAddTasks && (
          <div className="px-6 pb-4 -mt-2">
            <div className="bg-rhozly-surface-low border border-rhozly-outline/15 rounded-2xl p-3 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
                Tasks for {activeAddTasks.plantName}
              </p>
              <TaskActionButtons
                tasks={scheduleFromSchedulableTasks(activeAddTasks.tasks)}
                homeId={homeId}
                onSuccess={() => setActiveAddTasks(null)}
              />
              <button
                type="button"
                onClick={() => setActiveAddTasks(null)}
                className="text-[11px] font-bold text-rhozly-on-surface/40 hover:text-rhozly-on-surface"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
