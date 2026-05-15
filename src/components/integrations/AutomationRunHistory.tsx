import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { Loader2, CheckCircle, XCircle, CloudRain, Calendar, Play, Clock } from "lucide-react";

interface DeviceResult { device_id: string; name: string; success: boolean; queued?: boolean; }
interface TaskResult { blueprint_id: string; title: string; already_done: boolean; }

interface AutomationRun {
  id: string;
  triggered_at: string;
  triggered_by: "schedule" | "manual";
  status: string;
  devices_triggered: DeviceResult[];
  tasks_completed: TaskResult[];
  error_message: string | null;
  completed_at: string | null;
}

interface Props {
  automationId: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  success:           { label: "Success",        color: "text-green-600 bg-green-50",    icon: <CheckCircle size={12} /> },
  partial:           { label: "Partial",         color: "text-amber-600 bg-amber-50",   icon: <CheckCircle size={12} /> },
  failed:            { label: "Failed",          color: "text-red-600 bg-red-50",       icon: <XCircle size={12} /> },
  skipped_weather:   { label: "Skipped (rain)",  color: "text-blue-600 bg-blue-50",     icon: <CloudRain size={12} /> },
  skipped_no_tasks:  { label: "No tasks due",    color: "text-slate-500 bg-slate-100",  icon: <Calendar size={12} /> },
  pending:           { label: "Running…",        color: "text-rhozly-primary bg-rhozly-primary/10", icon: <Loader2 size={12} className="animate-spin" /> },
};

export default function AutomationRunHistory({ automationId }: Props) {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("automation_runs")
      .select("id, triggered_at, triggered_by, status, devices_triggered, tasks_completed, error_message, completed_at")
      .eq("automation_id", automationId)
      .order("triggered_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRuns((data ?? []) as AutomationRun[]);
        setLoading(false);
      });
  }, [automationId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 size={16} className="animate-spin text-rhozly-on-surface-variant" />
      </div>
    );
  }

  if (runs.length === 0) {
    return <p className="text-xs text-rhozly-on-surface-variant py-3 text-center">No runs yet.</p>;
  }

  return (
    <div className="space-y-2">
      {runs.map((run) => {
        const cfg = STATUS_CONFIG[run.status] ?? STATUS_CONFIG.pending;
        const completedDevices = (run.devices_triggered ?? []).filter((d) => d.success && !d.queued);
        const completedTasks = (run.tasks_completed ?? []).filter((t) => !t.already_done);
        return (
          <div key={run.id} className="flex items-start gap-3 py-2 border-b border-rhozly-outline/10 last:border-0">
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 mt-0.5 ${cfg.color}`}>
              {cfg.icon}
              {cfg.label}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-rhozly-on-surface-variant">
                {new Date(run.triggered_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                {" · "}
                <span className="inline-flex items-center gap-0.5">
                  {run.triggered_by === "manual" ? <Play size={10} /> : <Clock size={10} />}
                  {run.triggered_by === "manual" ? "Manual" : "Scheduled"}
                </span>
              </p>
              {(completedDevices.length > 0 || completedTasks.length > 0) && (
                <p className="text-xs text-rhozly-on-surface-variant mt-0.5">
                  {completedDevices.length > 0 && `${completedDevices.length} valve${completedDevices.length !== 1 ? "s" : ""} fired`}
                  {completedDevices.length > 0 && completedTasks.length > 0 && " · "}
                  {completedTasks.length > 0 && `${completedTasks.length} task${completedTasks.length !== 1 ? "s" : ""} completed`}
                </p>
              )}
              {run.error_message && (
                <p className="text-xs text-red-500 mt-0.5 truncate">{run.error_message}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
