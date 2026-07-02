import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, X, ArrowRight, RefreshCw, Leaf } from "lucide-react";
import { supabase } from "../lib/supabase";
import FeatureGate from "./shared/FeatureGate";

interface FeedInsight {
  id: string;
  source: "pattern" | "automation" | "area" | "weekly" | "seasonal";
  category: string;
  title: string;
  body: string;
  severity: number;
  createdAt: string;
  link: string | null;
  dismissable: boolean;
}

const CAT: Record<string, { label: string; cls: string }> = {
  watering: { label: "Watering", cls: "bg-sky-50 text-sky-700" },
  harvest: { label: "Harvest", cls: "bg-orange-50 text-orange-700" },
  care: { label: "Plant care", cls: "bg-emerald-50 text-emerald-700" },
  tasks: { label: "Tasks", cls: "bg-amber-50 text-amber-700" },
  area: { label: "Area", cls: "bg-violet-50 text-violet-700" },
  weekly: { label: "This week", cls: "bg-indigo-50 text-indigo-700" },
  seasonal: { label: "Planting", cls: "bg-lime-50 text-lime-700" },
  planning: { label: "Planner", cls: "bg-fuchsia-50 text-fuchsia-700" },
  weather: { label: "Weather", cls: "bg-cyan-50 text-cyan-700" },
  pests: { label: "Pest risk", cls: "bg-rose-50 text-rose-700" },
};

// Takes no props today; the ignored `_props` param exists so the gated
// wrapper below can derive/forward its props type via ComponentProps.
function AiInsightsPageInner(_props: Record<string, unknown>) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [insights, setInsights] = useState<FeedInsight[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("insights-feed");
      setSummary((data?.summary as string) ?? null);
      setInsights((data?.insights as FeedInsight[]) ?? []);
    } catch {
      setSummary(null);
      setInsights([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismiss = async (ins: FeedInsight) => {
    setInsights((xs) => xs.filter((x) => x.id !== ins.id));
    if (ins.source === "pattern") {
      await supabase.from("user_insights")
        .update({ dismissed_at: new Date().toISOString() })
        .eq("id", ins.id.replace("ui-", ""));
    } else if (ins.source === "automation") {
      await supabase.from("automation_suggestions")
        .update({ status: "dismissed", updated_at: new Date().toISOString() })
        .eq("id", ins.id.replace("as-", ""));
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
            <Sparkles size={20} className="text-rhozly-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-rhozly-on-surface tracking-tight">AI Insights</h1>
            <p className="text-xs font-bold text-rhozly-on-surface/40 uppercase tracking-widest mt-0.5">
              Everything Rhozly has spotted, in one place
            </p>
          </div>
        </div>
        <button
          onClick={load}
          data-testid="insights-refresh"
          className="p-2.5 rounded-2xl text-rhozly-on-surface/50 hover:bg-rhozly-surface transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Summary */}
      {summary && (
        <div
          data-testid="insights-summary"
          className="rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/70 mb-1.5">
            <Sparkles size={12} /> Your overview
          </div>
          <p className="text-[15px] font-bold leading-snug">{summary}</p>
        </div>
      )}

      {/* Loading */}
      {loading && insights.length === 0 && (
        <div className="flex items-center justify-center gap-2 py-16 text-rhozly-on-surface/40">
          <Loader2 size={18} className="animate-spin" /> Gathering your insights…
        </div>
      )}

      {/* Empty */}
      {!loading && insights.length === 0 && (
        <div className="text-center py-16 space-y-2" data-testid="insights-empty">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-rhozly-surface flex items-center justify-center">
            <Leaf size={20} className="text-rhozly-on-surface/40" />
          </div>
          <p className="text-sm font-bold text-rhozly-on-surface/60">All quiet right now</p>
          <p className="text-xs font-medium text-rhozly-on-surface/45 max-w-xs mx-auto">
            No insights at the moment — Rhozly will surface things here as it spots them.
          </p>
        </div>
      )}

      {/* Feed */}
      {insights.length > 0 && (
        <ul className="space-y-2.5" data-testid="insights-feed">
          {insights.map((ins) => {
            const cat = CAT[ins.category] ?? { label: ins.category, cls: "bg-rhozly-surface text-rhozly-on-surface/60" };
            return (
              <li key={ins.id} className="rounded-2xl border border-rhozly-outline/10 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${cat.cls}`}>
                    {cat.label}
                  </span>
                  {ins.dismissable && (
                    <button
                      onClick={() => dismiss(ins)}
                      data-testid={`insight-dismiss-${ins.id}`}
                      className="p-1 rounded-lg text-rhozly-on-surface/30 hover:text-rhozly-on-surface/60 hover:bg-rhozly-surface transition-colors shrink-0"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <p className="text-[14px] font-black text-rhozly-on-surface mt-1.5">{ins.title}</p>
                <p className="text-[13px] font-medium text-rhozly-on-surface/70 mt-0.5 leading-snug">{ins.body}</p>
                {ins.link && (
                  <button
                    onClick={() => navigate(ins.link!)}
                    data-testid={`insight-link-${ins.id}`}
                    className="inline-flex items-center gap-1 mt-2.5 text-[12px] font-black text-rhozly-primary hover:gap-2 transition-all"
                  >
                    Take me there <ArrowRight size={13} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Unified AI Insights page (Parts 4 + 5 of the AI-insights overhaul) — one place
 * for every insight Rhozly has surfaced, with a persona-aware AI overview at the
 * top and a deep link from each card back to where it came from. Evergreen-gated.
 */
export default function AiInsightsPage(props: React.ComponentProps<typeof AiInsightsPageInner>) {
  return (
    <FeatureGate feature="ai_insights">
      <AiInsightsPageInner {...props} />
    </FeatureGate>
  );
}
