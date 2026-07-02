import React from "react";
import { useNavigate } from "react-router-dom";
import { Wheat } from "lucide-react";
import { useHomeDashboardStats } from "../../hooks/useHomeDashboardStats";

/**
 * Detailed-mode week strip + harvest/yield line for the Home dashboard
 * (new-home-dashboard plan §3.6, Phase 3). A compact read of the same
 * `home-dashboard-stats` dayStrip the Overview tab renders in full —
 * pros get the week's shape without leaving Home. Mounted only in
 * detailed mode, so the hook (and its fetch) never runs for simple mode.
 */

export default function WeekPulse({ homeId }: { homeId: string }) {
  const navigate = useNavigate();
  const { stats } = useHomeDashboardStats(homeId);
  if (!stats?.dayStrip?.length) return null;

  const harvestsDue = stats.garden?.harvestBlueprintsDue ?? 0;
  const yieldSummary = Object.entries(stats.garden?.totalYieldByUnit ?? {})
    .map(([unit, value]) => `${Math.round((value as number) * 10) / 10} ${unit}`)
    .join(" · ");

  return (
    <section data-testid="home-week-pulse">
      <h2 className="text-xs font-black uppercase tracking-widest text-rhozly-on-surface/40 px-1 mb-2">
        This week
      </h2>
      <button
        onClick={() => navigate("/dashboard?view=overview")}
        className="w-full bg-white rounded-3xl shadow-sm border border-rhozly-primary/5 px-4 py-3 hover:bg-rhozly-primary/5 transition text-left"
      >
        <div className="grid grid-cols-7 gap-1.5">
          {stats.dayStrip.map((day) => {
            const initial = new Date(`${day.date}T12:00:00Z`).toLocaleDateString([], { weekday: "narrow" });
            return (
              <div
                key={day.date}
                className={`flex flex-col items-center gap-1 rounded-xl py-1.5 ${day.isToday ? "bg-rhozly-primary/10" : ""}`}
              >
                <span className={`text-[10px] font-black ${day.isToday ? "text-rhozly-primary" : "text-rhozly-on-surface/40"}`}>
                  {initial}
                </span>
                <span className="flex items-center gap-0.5">
                  {day.overdue > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={`${day.overdue} overdue`} />}
                  {day.pending > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title={`${day.pending} pending`} />}
                  {day.completedOnTime > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500" title={`${day.completedOnTime} done`} />}
                  {day.total === 0 && <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />}
                </span>
                <span className="text-[10px] font-bold text-rhozly-on-surface/50">{day.total}</span>
              </div>
            );
          })}
        </div>
        {(harvestsDue > 0 || yieldSummary) && (
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-rhozly-on-surface/55 mt-2 px-1">
            <Wheat size={12} className="text-yellow-600" />
            {harvestsDue > 0 && `${harvestsDue} harvest${harvestsDue === 1 ? "" : "s"} due`}
            {harvestsDue > 0 && yieldSummary && " · "}
            {yieldSummary && `picked ${yieldSummary}`}
          </p>
        )}
      </button>
    </section>
  );
}
