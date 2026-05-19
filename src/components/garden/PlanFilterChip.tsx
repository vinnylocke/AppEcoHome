import React, { useEffect, useState } from "react";
import { Filter, X, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Logger } from "../../lib/errorHandler";

interface Plan {
  id: string;
  name: string;
  status: string | null;
}

interface Props {
  homeId: string;
  value: string | null;
  onChange: (planId: string | null) => void;
}

export default function PlanFilterChip({ homeId, value, onChange }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("plans")
          .select("id, name, status")
          .eq("home_id", homeId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        if (!cancelled) setPlans(data ?? []);
      } catch (err) {
        Logger.error("Failed to load plans for filter", err);
      }
    })();
    return () => { cancelled = true; };
  }, [homeId]);

  const activePlan = plans.find(p => p.id === value) ?? null;

  return (
    <div className="relative" data-testid="plan-filter-chip">
      <button
        data-testid="plan-filter-trigger"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 min-h-[36px] px-3 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
          activePlan ? "bg-rhozly-primary/10 text-rhozly-primary" : "text-rhozly-on-surface/60 hover:bg-rhozly-surface"
        }`}
      >
        <Filter size={14} />
        <span className="truncate max-w-[160px]">{activePlan ? activePlan.name : "All shapes"}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div
          data-testid="plan-filter-menu"
          className="absolute top-full mt-1 right-0 z-30 bg-white rounded-2xl shadow-xl border border-rhozly-outline/15 py-1 min-w-[200px] max-h-[60vh] overflow-y-auto"
        >
          <button
            data-testid="plan-filter-option-all"
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full text-left px-3 min-h-[40px] flex items-center gap-2 text-xs font-bold transition-colors ${
              !activePlan ? "bg-rhozly-primary/5 text-rhozly-primary" : "text-rhozly-on-surface/70 hover:bg-rhozly-surface"
            }`}
          >
            <span className="flex-1">All shapes</span>
            {!activePlan && <span className="text-[10px]">✓</span>}
          </button>
          <div className="my-1 border-t border-rhozly-outline/10" />
          {plans.length === 0 ? (
            <p className="px-3 py-2 text-[10px] font-bold text-rhozly-on-surface/40">
              No plans yet. Create one in the Planner first.
            </p>
          ) : plans.map(p => (
            <button
              key={p.id}
              data-testid={`plan-filter-option-${p.id}`}
              onClick={() => { onChange(p.id); setOpen(false); }}
              className={`w-full text-left px-3 min-h-[40px] flex items-center gap-2 text-xs font-bold transition-colors ${
                p.id === value ? "bg-rhozly-primary/5 text-rhozly-primary" : "text-rhozly-on-surface/70 hover:bg-rhozly-surface"
              }`}
            >
              <span className="flex-1 truncate">{p.name}</span>
              {p.status && <span className="text-[9px] font-black text-rhozly-on-surface/30 uppercase tracking-widest">{p.status}</span>}
              {p.id === value && <span className="text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}

      {activePlan && !open && (
        <button
          data-testid="plan-filter-clear"
          onClick={() => onChange(null)}
          aria-label="Clear plan filter"
          className="absolute -right-1 -top-1 min-h-[20px] min-w-[20px] flex items-center justify-center rounded-full bg-rhozly-primary text-white"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
