import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  Play, Settings, Trash2, ChevronDown, ChevronUp, Loader2,
  CheckCircle, XCircle, CloudRain, Calendar, Clock, Droplets, MapPin, Gauge,
} from "lucide-react";
import AutomationRunHistory from "./AutomationRunHistory";
import AutomationSuggestions from "./AutomationSuggestions";
import type { AutomationFull } from "./AutomationsSection";
import { summariseTree } from "../../lib/conditionTree";

interface Props {
  automation: AutomationFull;
  onEdit: () => void;
  onDeleted: () => void;
  canManage: boolean;
  canRun: boolean;
}

const STATUS_BADGE: Record<string, { label: string; color: string; dot: string }> = {
  success:          { label: "Success",       color: "text-green-700 bg-green-50",  dot: "bg-green-500" },
  partial:          { label: "Partial",        color: "text-amber-700 bg-amber-50", dot: "bg-amber-500" },
  failed:           { label: "Failed",         color: "text-red-700 bg-red-50",     dot: "bg-red-500"   },
  skipped_weather:  { label: "Rain skipped",   color: "text-blue-700 bg-blue-50",   dot: "bg-blue-400"  },
  deferred_weather: { label: "Waiting for rain", color: "text-sky-700 bg-sky-50",   dot: "bg-sky-400"   },
  skipped_no_tasks: { label: "No tasks due",   color: "text-slate-600 bg-slate-100",dot: "bg-slate-400" },
};

export default function AutomationCard({ automation, onEdit, onDeleted, canManage, canRun }: Props) {
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<"success" | "failed" | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const lastRun = automation.lastRun;
  const lastRunBadge = lastRun ? STATUS_BADGE[lastRun.status] : null;

  const runNow = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke("run-automations", {
        body: { action: "manual", automationId: automation.id },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const ok = !res.error && res.data?.success;
      setRunResult(ok ? "success" : "failed");
    } catch {
      setRunResult("failed");
    } finally {
      setRunning(false);
      setTimeout(() => setRunResult(null), 4000);
    }
  };

  const deleteAutomation = async () => {
    setDeleting(true);
    await supabase.from("automations").delete().eq("id", automation.id);
    onDeleted();
  };

  return (
    <div className={`rounded-3xl border bg-white p-5 shadow-sm flex flex-col gap-4 transition-opacity ${automation.is_active ? "border-rhozly-outline/20" : "border-rhozly-outline/10 opacity-60"}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Droplets size={18} className="text-rhozly-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-black text-rhozly-on-surface text-sm leading-tight">{automation.name}</h3>
              {!automation.is_active && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-rhozly-surface text-rhozly-on-surface-variant">
                  Inactive
                </span>
              )}
            </div>
            <p className="text-xs text-rhozly-on-surface-variant mt-0.5" data-testid={`automation-summary-${automation.id}`}>
              Runs when {summariseTree(automation.trigger_logic)}
            </p>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onEdit}
              data-testid={`automation-edit-${automation.id}`}
              className="p-2 rounded-xl text-rhozly-on-surface-variant hover:bg-rhozly-surface transition-colors"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              data-testid={`automation-delete-${automation.id}`}
              className="p-2 rounded-xl text-rhozly-on-surface-variant hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Scope + run-limit chips */}
      {(automation.area_name || automation.location_name || automation.run_limit_count) && (
        <div className="flex flex-wrap gap-1.5">
          {(automation.area_name || automation.location_name) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rhozly-surface text-rhozly-on-surface-variant text-xs font-semibold">
              <MapPin size={10} />
              {automation.area_name ?? automation.location_name}
            </span>
          )}
          {automation.run_limit_count && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-semibold">
              <Gauge size={10} />
              ≤ {automation.run_limit_count}/{automation.run_limit_window_hours}h
            </span>
          )}
        </div>
      )}

      {/* Devices */}
      {automation.devices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {automation.devices.map((d) => (
            <span key={d.device_id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rhozly-primary/10 text-rhozly-primary text-xs font-semibold">
              <Droplets size={10} />
              {d.device_name}
            </span>
          ))}
        </div>
      )}

      {/* Tasks summary */}
      {automation.blueprints.length > 0 && (
        <div className="text-xs text-rhozly-on-surface-variant">
          <span className="font-semibold">Tasks: </span>
          {automation.blueprints.map((b, i) => (
            <span key={b.blueprint_id}>
              {i > 0 && " · "}
              <span className={b.role === "controlling" ? "text-rhozly-on-surface font-medium" : ""}>
                {b.blueprint_title}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Last run */}
      {lastRun && lastRunBadge && (
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${lastRunBadge.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${lastRunBadge.dot}`} />
            {lastRunBadge.label}
          </span>
          <span className="text-xs text-rhozly-on-surface-variant">
            {new Date(lastRun.triggered_at).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
          </span>
        </div>
      )}

      {/* Tuning suggestions (Pillar B) */}
      <AutomationSuggestions automationId={automation.id} canManage={canManage} />

      {/* Actions */}
      <div className="flex items-center gap-2">
        {canRun && (
          <button
            onClick={runNow}
            disabled={running}
            data-testid={`automation-run-now-${automation.id}`}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
              runResult === "success" ? "bg-green-500 text-white" :
              runResult === "failed"  ? "bg-red-500 text-white" :
              "bg-rhozly-primary text-white hover:bg-rhozly-primary/90 disabled:opacity-60"
            }`}
          >
            {running ? (
              <><Loader2 size={13} className="animate-spin" /> Running…</>
            ) : runResult === "success" ? (
              <><CheckCircle size={13} /> Done</>
            ) : runResult === "failed" ? (
              <><XCircle size={13} /> Failed</>
            ) : (
              <><Play size={13} /> Run now</>
            )}
          </button>
        )}

        <button
          onClick={() => setShowHistory((v) => !v)}
          data-testid={`automation-history-${automation.id}`}
          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold text-rhozly-on-surface-variant hover:bg-rhozly-surface transition-colors"
        >
          <Clock size={13} />
          History
          {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Run history */}
      {showHistory && (
        <div className="border-t border-rhozly-outline/10 pt-3">
          <AutomationRunHistory automationId={automation.id} />
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="rounded-2xl bg-red-50 p-4 border border-red-100">
          <p className="text-sm font-semibold text-red-700 mb-1">Delete this automation?</p>
          <p className="text-xs text-red-600 mb-3">Run history will be kept. Valves will be unlinked.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-2 rounded-xl border border-red-200 text-xs font-semibold text-red-500"
            >
              Cancel
            </button>
            <button
              onClick={deleteAutomation}
              disabled={deleting}
              data-testid={`automation-delete-confirm-${automation.id}`}
              className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-red-500 text-white text-xs font-bold disabled:opacity-60"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
