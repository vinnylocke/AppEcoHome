import React, { useCallback, useEffect, useState } from "react";
import { Loader2, CalendarDays, Sun, CalendarClock, Sparkles } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { ManagerReport, YearPlan } from "../../lib/managerReport";

const GROUPS: Array<{ key: keyof YearPlan; label: string; icon: React.ReactElement; cls: string }> = [
  { key: "thisMonth", label: "This month", icon: <CalendarDays size={15} />, cls: "text-emerald-600" },
  { key: "thisSeason", label: "This season", icon: <Sun size={15} />, cls: "text-amber-600" },
  { key: "comingUp", label: "Coming up", icon: <CalendarClock size={15} />, cls: "text-sky-600" },
];

function hasPlan(yp: YearPlan | null | undefined): boolean {
  return !!yp && (yp.thisMonth?.length > 0 || yp.thisSeason?.length > 0 || yp.comingUp?.length > 0);
}

export default function ManagerYearPlan({ homeId }: { homeId: string }) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [yearPlan, setYearPlan] = useState<YearPlan | null>(null);

  // Read the already-generated report row directly (no AI cost). The Overview tab
  // is what generates/refreshes it; here we just surface its year plan.
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("garden_manager_reports")
      .select("report")
      .eq("home_id", homeId)
      .maybeSingle();
    const report = (data as { report?: ManagerReport } | null)?.report ?? null;
    setYearPlan(report?.yearPlan ?? null);
    setLoading(false);
  }, [homeId]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data } = await supabase.functions.invoke("garden-manager-report", { body: {} });
      const report = (data as { report?: ManagerReport })?.report ?? null;
      setYearPlan(report?.yearPlan ?? null);
    } catch {
      /* leave empty */
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-rhozly-on-surface/40">
        <Loader2 size={18} className="animate-spin" /> Loading your year plan…
      </div>
    );
  }

  if (!hasPlan(yearPlan)) {
    return (
      <div className="text-center py-16 space-y-3" data-testid="yearplan-empty">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-rhozly-surface flex items-center justify-center">
          <CalendarDays size={20} className="text-rhozly-on-surface/40" />
        </div>
        <p className="text-sm font-bold text-rhozly-on-surface/60">No year plan yet</p>
        <p className="text-xs font-medium text-rhozly-on-surface/45 max-w-xs mx-auto">
          I'll map out what to do month by month once I've reviewed your garden.
        </p>
        <button
          onClick={generate}
          disabled={generating}
          data-testid="yearplan-generate"
          className="inline-flex items-center gap-1.5 px-5 py-3 rounded-2xl bg-rhozly-primary text-white text-[14px] font-black disabled:opacity-60"
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generating ? "Building your plan…" : "Build my year plan"}
        </button>
      </div>
    );
  }

  const yp = yearPlan!;

  return (
    <div className="space-y-4" data-testid="yearplan-panel">
      {GROUPS.map((g) => {
        const items = yp[g.key] ?? [];
        if (items.length === 0) return null;
        return (
          <div key={g.key} className="rounded-2xl border border-rhozly-outline/10 bg-white p-4" data-testid={`yearplan-${g.key}`}>
            <div className={`flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest mb-2.5 ${g.cls}`}>
              {g.icon} {g.label}
            </div>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={i} className="flex gap-2 text-[14px] font-medium text-rhozly-on-surface/80 leading-snug">
                  <span className="text-rhozly-primary font-black shrink-0">·</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
