import React, { useState, useEffect, useCallback } from "react";
import { Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "../lib/supabase";

interface Insight {
  id: string;
  insight_text: string;
}

export default function AssistantCard({ userId }: { userId: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("user_insights")
      .select("id, insight_text, created_at")
      .eq("user_id", userId)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    setInsights(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Mark the latest insight as surfaced the first time it's shown
  const latestId = insights[0]?.id;
  useEffect(() => {
    if (!latestId) return;
    supabase
      .from("user_insights")
      .update({ surfaced_at: new Date().toISOString() })
      .eq("id", latestId)
      .is("surfaced_at", null)
      .then(() => {});
  }, [latestId]);

  const dismiss = async (id: string) => {
    await supabase
      .from("user_insights")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("id", id);
    setInsights((prev) => {
      const next = prev.filter((i) => i.id !== id);
      if (next.length === 0) setExpanded(false);
      return next;
    });
  };

  if (loading || insights.length === 0) return null;

  const current = insights[0];
  const rest = insights.slice(1);

  return (
    <div className="bg-gradient-to-br from-violet-500 to-indigo-600 text-white rounded-3xl p-5 shadow-md relative overflow-hidden">
      <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />

      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="bg-white/20 p-2 rounded-xl">
            <Sparkles size={15} className="text-white" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-white/80">
            AI Insight
          </span>
          {insights.length > 1 && (
            <span className="text-[10px] font-black bg-white/20 px-2 py-0.5 rounded-full">
              {insights.length}
            </span>
          )}
        </div>
        <button
          onClick={() => dismiss(current.id)}
          className="text-white/60 hover:text-white transition p-1"
          aria-label="Dismiss insight"
        >
          <X size={14} />
        </button>
      </div>

      {/* Insight text */}
      <p className="text-sm leading-snug font-semibold mb-3">
        {current.insight_text}
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => dismiss(current.id)}
          className="bg-white text-indigo-700 text-xs font-black px-4 py-1.5 rounded-full hover:bg-white/90 transition"
        >
          Got it
        </button>
        {insights.length > 1 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs font-bold text-white/70 hover:text-white transition"
          >
            {expanded ? "Hide" : `See all (${insights.length})`}
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}
      </div>

      {/* Expanded older insights */}
      {expanded && rest.length > 0 && (
        <div className="mt-4 space-y-3 max-h-72 overflow-y-auto pr-1">
          {rest.map((insight) => (
            <div
              key={insight.id}
              className="bg-white/10 rounded-2xl p-3 flex items-start justify-between gap-3"
            >
              <p className="text-xs leading-snug flex-1">{insight.insight_text}</p>
              <button
                onClick={() => dismiss(insight.id)}
                className="text-white/50 hover:text-white flex-shrink-0 mt-0.5 transition"
                aria-label="Dismiss"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
