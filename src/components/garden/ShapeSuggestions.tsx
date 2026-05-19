import React, { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";
import toast from "react-hot-toast";
import type { SunClass } from "../../lib/sunAnalysis";

interface Suggestion {
  common_name: string;
  scientific_name: string;
  type: string;
  reason: string;
}

interface Props {
  shapeId: string;
  homeId: string;
  sunClassification?: SunClass | null;
  recentLux?: number | null;
  hemisphere?: "northern" | "southern";
}

function currentSeason(): string {
  const m = new Date().getMonth() + 1;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

export default function ShapeSuggestions({ shapeId, homeId, sunClassification, recentLux, hemisphere }: Props) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);

  async function handleSuggest() {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("garden-shape-suggestions", {
        body: {
          shapeId,
          homeId,
          sunClassification: sunClassification ?? "Unknown",
          recentLux: recentLux ?? null,
          hemisphere: hemisphere ?? "northern",
          currentSeason: currentSeason(),
        },
      });
      if (error) throw error;
      setSuggestions(data?.suggestions ?? []);
    } catch (err) {
      Logger.error("Plant suggestions failed", err);
      toast.error("Could not load suggestions");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2" data-testid="shape-suggestions">
      <button
        data-testid="shape-suggest-btn"
        onClick={handleSuggest}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-rhozly-primary/10 text-rhozly-primary text-xs font-black hover:bg-rhozly-primary/15 disabled:opacity-50 transition-colors"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? "Asking Rhozly AI…" : "Suggest plants for this bed"}
      </button>

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-2" data-testid="shape-suggestions-list">
          {suggestions.map((s, i) => (
            <div key={`${s.common_name}-${i}`} className="bg-rhozly-bg rounded-xl px-3 py-2 border border-rhozly-outline/15">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-black text-rhozly-on-surface">{s.common_name}</p>
                <span className="text-[9px] font-black text-rhozly-on-surface/40 uppercase tracking-widest shrink-0">{s.type}</span>
              </div>
              {s.scientific_name && (
                <p className="text-[10px] font-bold italic text-rhozly-on-surface/50">{s.scientific_name}</p>
              )}
              <p className="text-[11px] font-medium text-rhozly-on-surface/70 mt-1 leading-snug">{s.reason}</p>
            </div>
          ))}
        </div>
      )}

      {suggestions && suggestions.length === 0 && (
        <p className="text-[10px] font-bold text-rhozly-on-surface/40 text-center py-2">No suggestions returned</p>
      )}
    </div>
  );
}
