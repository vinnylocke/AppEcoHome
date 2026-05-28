import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Lightbulb } from "lucide-react";
import AreaRotationCard from "./AreaRotationCard";

interface Props {
  homeId: string;
  areaId: string;
  areaName: string;
  /** When false (indoor area) the panel renders nothing — rotation rules
   *  don't apply to plants kept indoors. */
  isOutside: boolean;
  aiEnabled: boolean;
  /** When `true`, the panel mounts collapsed regardless of the saved
   *  preference. Used by callers that want to keep the area page tidy
   *  on first render (e.g. when the area was just opened from a list). */
  defaultCollapsed?: boolean;
}

/**
 * Collapsible Insights panel — designed as a slot for per-area
 * intelligence. The first inhabitant is the rotation card; future
 * inhabitants will include companion suggestions, pest pressure
 * history, and yield analytics.
 *
 * Open/closed state is persisted per area in localStorage so the user's
 * preference stays across visits.
 */
export default function AreaInsightsPanel({
  homeId,
  areaId,
  areaName,
  isOutside,
  aiEnabled,
  defaultCollapsed,
}: Props) {
  const storageKey = `rhozly:area-insights:${areaId}`;
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "open") return true;
      if (stored === "closed") return false;
    } catch {
      // localStorage unavailable (private mode / SSR) — fall back.
    }
    return !defaultCollapsed;
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, open ? "open" : "closed");
    } catch {
      // ignore
    }
  }, [open, storageKey]);

  if (!isOutside) return null;

  return (
    <section
      data-testid="area-insights-panel"
      className="bg-rhozly-surface-low/60 border border-rhozly-outline/15 rounded-2xl overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="area-insights-toggle"
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-rhozly-surface-low/90 transition-colors"
      >
        <div className="p-1.5 rounded-xl bg-rhozly-primary/10 text-rhozly-primary">
          <Lightbulb size={14} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">
            Insights
          </p>
          <p className="text-sm font-black text-rhozly-on-surface leading-tight">
            What this area is telling us
          </p>
        </div>
        {open ? (
          <ChevronDown size={16} className="text-rhozly-on-surface/40" />
        ) : (
          <ChevronRight size={16} className="text-rhozly-on-surface/40" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-5 border-t border-rhozly-outline/10">
          <AreaRotationCard
            homeId={homeId}
            areaId={areaId}
            areaName={areaName}
            aiEnabled={aiEnabled}
          />
        </div>
      )}
    </section>
  );
}
