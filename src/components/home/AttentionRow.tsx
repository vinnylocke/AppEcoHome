import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CloudLightning, Zap, BatteryLow, Droplets, Wheat, ChevronRight, type LucideIcon } from "lucide-react";
import type { AttentionItem } from "../../hooks/useHomeOverview";

/**
 * "Needs attention" row on the Home dashboard (new-home-dashboard plan
 * §3.2) — at most 4 ranked cards from the home-overview endpoint, hidden
 * entirely when the garden is calm. A new gardener typically sees 0–1;
 * a pro sees their real problem list.
 */

const KIND_STYLES: Record<string, { icon: LucideIcon; classes: string }> = {
  overdue_tasks: { icon: AlertCircle, classes: "bg-red-50 text-red-700 border-red-100" },
  weather_alert: { icon: CloudLightning, classes: "bg-sky-50 text-sky-700 border-sky-100" },
  automation_failed: { icon: Zap, classes: "bg-amber-50 text-amber-700 border-amber-100" },
  low_battery: { icon: BatteryLow, classes: "bg-orange-50 text-orange-700 border-orange-100" },
  soil_dry: { icon: Droplets, classes: "bg-yellow-50 text-yellow-800 border-yellow-100" },
  harvest_closing: { icon: Wheat, classes: "bg-lime-50 text-lime-800 border-lime-100" },
};

export default function AttentionRow({
  items,
  excludeKinds = [],
}: {
  items: AttentionItem[];
  /** Route-scoped kind filter (redesign Stage 2): the dashboard suppresses
   *  `overdue_tasks` (the hero + task list own that fact) and `weather_alert`
   *  (the global banner is the sole alert surface). Other consumers of the
   *  home-overview attention payload are untouched. */
  excludeKinds?: string[];
}) {
  const navigate = useNavigate();
  if (excludeKinds.length > 0) {
    items = items.filter((i) => !excludeKinds.includes(i.kind));
  }
  if (items.length === 0) return null;

  return (
    <section data-testid="home-attention-row">
      <h2 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-2">
        Needs attention
      </h2>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {items.map((item, i) => {
          const style = KIND_STYLES[item.kind] ?? KIND_STYLES.overdue_tasks;
          const Icon = style.icon;
          return (
            <button
              key={`${item.kind}-${i}`}
              data-testid={`home-attention-${item.kind}`}
              onClick={() => navigate(item.route)}
              className={`flex items-start gap-2.5 min-w-[220px] max-w-[280px] shrink-0 text-left border rounded-2xl px-3.5 py-3 hover:opacity-90 transition ${style.classes}`}
            >
              <Icon size={16} className="shrink-0 mt-0.5" />
              <span className="flex-1 min-w-0">
                <span className="block text-xs font-black leading-tight truncate">{item.title}</span>
                <span className="block text-[11px] font-medium opacity-80 leading-snug line-clamp-2">
                  {item.body}
                </span>
              </span>
              <ChevronRight size={14} className="shrink-0 mt-0.5 opacity-50" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
