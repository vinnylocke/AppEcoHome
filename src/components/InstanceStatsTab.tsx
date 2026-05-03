import React, { useState, useEffect } from "react";
import { Calendar, Wheat, Scissors, CheckSquare, Bug, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { fetchYieldRecords } from "../services/yieldService";
import type { YieldRecord } from "../types";

interface Props {
  instance: any;
}

interface TaskRow {
  id: string;
  type: string;
  status: string;
  due_date: string;
  completed_at: string | null;
}

interface AilmentLink {
  id: string;
  linked_at: string;
  ailment: { id: string; name: string; type: string } | null;
}

export default function InstanceStatsTab({ instance }: Props) {
  const [loading, setLoading] = useState(true);
  const [yieldRecords, setYieldRecords] = useState<YieldRecord[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [ailments, setAilments] = useState<AilmentLink[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [yieldData, tasksRes, ailmentsRes] = await Promise.all([
          fetchYieldRecords(instance.id),
          supabase
            .from("tasks")
            .select("id, type, status, due_date, completed_at")
            .contains("inventory_item_ids", [instance.id]),
          supabase
            .from("plant_instance_ailments")
            .select("id, linked_at, ailment:ailments(id, name, type)")
            .eq("plant_instance_id", instance.id)
            .eq("status", "active"),
        ]);
        setYieldRecords(yieldData);
        setTasks((tasksRes.data ?? []) as TaskRow[]);
        setAilments((ailmentsRes.data ?? []) as AilmentLink[]);
      } catch {
        // show empty states on error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [instance.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 size={24} className="animate-spin text-rhozly-primary/30" />
      </div>
    );
  }

  const pruneTasks = tasks
    .filter((t) => t.type === "Pruning" && t.status === "Completed")
    .sort((a, b) => {
      const da = new Date(a.completed_at ?? a.due_date).getTime();
      const db = new Date(b.completed_at ?? b.due_date).getTime();
      return db - da;
    });

  const totalByUnit: Record<string, number> = {};
  for (const r of yieldRecords) {
    totalByUnit[r.unit] = (totalByUnit[r.unit] ?? 0) + r.value;
  }

  const pendingCount = tasks.filter((t) => t.status === "Pending").length;
  const completedCount = tasks.filter((t) => t.status === "Completed").length;

  const plantedDate = instance.planted_at
    ? new Date(instance.planted_at).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const statCard = "bg-rhozly-surface rounded-2xl p-4 space-y-3";
  const sectionLabel = "text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 flex items-center gap-2";
  const metaLabel = "text-[10px] font-bold text-rhozly-on-surface/40 uppercase mb-0.5";
  const bigNumber = "text-2xl font-black text-rhozly-on-surface";
  const smallValue = "text-sm font-black text-rhozly-on-surface";
  const emptyText = "text-sm text-rhozly-on-surface/40 font-bold";

  return (
    <div className="space-y-4 animate-in slide-in-from-right-4">

      {/* Plant Info */}
      <div data-testid="stats-plant-info" className={statCard}>
        <h3 className={sectionLabel}><Calendar size={12} /> Plant Info</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className={metaLabel}>Planted</p>
            <p className={smallValue}>{plantedDate ?? "Not recorded"}</p>
          </div>
          <div>
            <p className={metaLabel}>Status</p>
            <p className={smallValue}>{instance.status}</p>
          </div>
          {instance.growth_state && (
            <div className="col-span-2">
              <p className={metaLabel}>Growth Stage</p>
              <p className={smallValue}>{instance.growth_state}</p>
            </div>
          )}
        </div>
      </div>

      {/* Yield History */}
      <div data-testid="stats-yield-section" className={statCard}>
        <h3 className={sectionLabel}><Wheat size={12} /> Yield History</h3>
        {yieldRecords.length === 0 ? (
          <p className={emptyText}>No harvests recorded yet</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={metaLabel}>Harvests</p>
              <p data-testid="stats-yield-count" className={bigNumber}>
                {yieldRecords.length}
              </p>
            </div>
            <div>
              <p className={metaLabel}>Last Harvest</p>
              <p data-testid="stats-yield-last-date" className={smallValue}>
                {new Date(yieldRecords[0].harvested_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            <div className="col-span-2">
              <p className={metaLabel}>Total Yield</p>
              <p data-testid="stats-yield-total" className={smallValue}>
                {Object.entries(totalByUnit)
                  .map(([unit, total]) => {
                    const rounded = Math.round(total * 100) / 100;
                    return `${rounded % 1 === 0 ? rounded : rounded} ${unit}`;
                  })
                  .join(", ")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Pruning */}
      <div data-testid="stats-prune-section" className={statCard}>
        <h3 className={sectionLabel}><Scissors size={12} /> Pruning</h3>
        {pruneTasks.length === 0 ? (
          <p className={emptyText}>No pruning recorded yet</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={metaLabel}>Sessions</p>
              <p data-testid="stats-prune-count" className={bigNumber}>
                {pruneTasks.length}
              </p>
            </div>
            <div>
              <p className={metaLabel}>Last Pruned</p>
              <p data-testid="stats-prune-last-date" className={smallValue}>
                {new Date(
                  pruneTasks[0].completed_at ?? pruneTasks[0].due_date,
                ).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Task Summary */}
      <div data-testid="stats-tasks-section" className={statCard}>
        <h3 className={sectionLabel}><CheckSquare size={12} /> Tasks</h3>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className={metaLabel}>Total</p>
            <p data-testid="stats-task-total" className={bigNumber}>{tasks.length}</p>
          </div>
          <div>
            <p className={metaLabel}>Pending</p>
            <p data-testid="stats-task-pending" className="text-2xl font-black text-amber-500">
              {pendingCount}
            </p>
          </div>
          <div>
            <p className={metaLabel}>Done</p>
            <p data-testid="stats-task-completed" className="text-2xl font-black text-green-500">
              {completedCount}
            </p>
          </div>
        </div>
      </div>

      {/* Issues / Pests / Diseases */}
      <div data-testid="stats-issues-section" className={statCard}>
        <h3 className={sectionLabel}><Bug size={12} /> Active Issues</h3>
        {ailments.length === 0 ? (
          <p data-testid="stats-issues-none" className={emptyText}>No active issues</p>
        ) : (
          <div className="space-y-2">
            {ailments.map(
              (link) =>
                link.ailment && (
                  <div
                    key={link.id}
                    data-testid="stats-issue-item"
                    className="flex items-center justify-between"
                  >
                    <span className={smallValue}>{link.ailment.name}</span>
                    <span
                      className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                        link.ailment.type === "pest"
                          ? "bg-orange-100 text-orange-600"
                          : link.ailment.type === "disease"
                            ? "bg-red-100 text-red-600"
                            : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {link.ailment.type === "invasive_plant" ? "invasive" : link.ailment.type}
                    </span>
                  </div>
                ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
