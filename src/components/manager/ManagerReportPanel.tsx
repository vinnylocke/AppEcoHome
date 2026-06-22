import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, ArrowRight, Leaf, AlertTriangle, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  type ManagerReport, sortSections, severityTone, isReportEmpty,
} from "../../lib/managerReport";

export default function ManagerReportPanel({ homeId }: { homeId: string }) {
  void homeId; // report is derived from the signed-in user's home server-side
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [report, setReport] = useState<ManagerReport | null>(null);

  const load = useCallback(async (bust = false) => {
    bust ? setRefreshing(true) : setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("garden-manager-report", {
        body: { bust },
      });
      setReport((data as { report?: ManagerReport })?.report ?? null);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-rhozly-on-surface/40">
        <Loader2 size={18} className="animate-spin" /> Your head gardener is reviewing your garden…
      </div>
    );
  }

  if (isReportEmpty(report)) {
    return (
      <div className="text-center py-16 space-y-3" data-testid="report-empty">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rhozly-surface flex items-center justify-center">
          <Leaf size={20} className="text-rhozly-on-surface/40" />
        </div>
        <p className="text-sm font-bold text-rhozly-on-surface/60">Nothing to report yet</p>
        <p className="text-xs font-medium text-rhozly-on-surface/45 max-w-xs mx-auto">
          Add a few plants and set your brief, and I'll put together a full breakdown of your garden.
        </p>
        <button
          onClick={() => load(true)}
          data-testid="report-refresh"
          className="inline-flex items-center gap-1.5 text-[13px] font-black text-rhozly-primary"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Check again
        </button>
      </div>
    );
  }

  const r = report!;
  const sections = sortSections(r.sections ?? []);

  return (
    <div className="space-y-5" data-testid="report-panel">
      {/* Hero — headline + greeting */}
      <div className="rounded-3xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/70">
            <Leaf size={12} /> From your head gardener
          </div>
          <button
            onClick={() => load(true)}
            data-testid="report-refresh"
            className="p-1.5 -m-1 rounded-xl text-white/70 hover:bg-white/10 transition-colors"
            title="Refresh report"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
        {r.headline && <p className="text-[17px] font-black leading-snug mt-2">{r.headline}</p>}
        {r.greeting && <p className="text-[14px] font-medium text-white/90 leading-snug mt-1.5">{r.greeting}</p>}
      </div>

      {/* Sections — one per goal */}
      {sections.length > 0 && (
        <div className="space-y-2.5" data-testid="report-sections">
          {sections.map((s, i) => {
            const tone = severityTone(s.severity);
            return (
              <div key={i} className="rounded-2xl border border-rhozly-outline/10 bg-white p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-black text-rhozly-on-surface">{s.title}</p>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${tone.cls}`}>
                    {tone.label}
                  </span>
                </div>
                <p className="text-[13px] font-medium text-rhozly-on-surface/70 mt-1 leading-snug">{s.body}</p>
                {s.recommendation && (
                  <p className="text-[13px] font-bold text-rhozly-on-surface/90 mt-2 flex gap-1.5">
                    <Sparkles size={14} className="text-rhozly-primary shrink-0 mt-0.5" />
                    {s.recommendation}
                  </p>
                )}
                {s.link && (
                  <button
                    onClick={() => navigate(s.link!)}
                    data-testid={`report-section-link-${i}`}
                    className="inline-flex items-center gap-1 mt-2.5 text-[12px] font-black text-rhozly-primary hover:gap-2 transition-all"
                  >
                    Take me there <ArrowRight size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Gaps — goal vs. reality */}
      {(r.gaps?.length ?? 0) > 0 && (
        <div className="space-y-2.5" data-testid="report-gaps">
          <p className="text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1">
            Gaps worth closing
          </p>
          {r.gaps.map((g, i) => (
            <div key={i} className="rounded-2xl border border-amber-200/60 bg-amber-50/40 p-4">
              <p className="text-[14px] font-black text-rhozly-on-surface flex items-center gap-1.5">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" /> {g.title}
              </p>
              <p className="text-[13px] font-medium text-rhozly-on-surface/70 mt-1 leading-snug">{g.detail}</p>
              {g.suggestion && (
                <p className="text-[13px] font-bold text-rhozly-on-surface/90 mt-1.5">{g.suggestion}</p>
              )}
              {g.link && (
                <button
                  onClick={() => navigate(g.link!)}
                  data-testid={`report-gap-link-${i}`}
                  className="inline-flex items-center gap-1 mt-2.5 text-[12px] font-black text-rhozly-primary hover:gap-2 transition-all"
                >
                  Fix this <ArrowRight size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
