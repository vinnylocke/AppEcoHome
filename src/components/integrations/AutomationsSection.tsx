import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { Plus, Loader2, Zap, Clock, Cpu, X } from "lucide-react";
import AutomationCard from "./AutomationCard";
import AutomationModal from "./AutomationModal";
import SensorAutomationModal, { type SensorAutomation } from "./SensorAutomationModal";

export interface AutomationFull {
  id: string;
  home_id: string;
  name: string;
  is_active: boolean;
  scheduled_time: string;
  duration_seconds: number;
  fire_valves_sequentially: boolean;
  skip_if_rained: boolean;
  rain_threshold_mm: number;
  /** New (weather-aware) — fire automatically on hot days even when no task is due. */
  trigger_if_hot: boolean;
  /** New (weather-aware) — min forecast max temp (°C) at which trigger_if_hot fires. */
  heat_threshold_c: number;
  retry_on_failure: boolean;
  /** Weather handling: off / skip / defer (Smart). */
  weather_mode: "off" | "skip" | "defer";
  weather_min_probability: number;
  weather_defer_window_hours: number;
  critical_threshold_value: number | null;
  max_defers: number;
  defer_skip_in_heat: boolean;
  /** Moisture target (%) for Smart scheduled automations. */
  sensor_threshold_value: number | null;
  /** When defer-mode is currently holding for forecast rain (ISO), else null. */
  defer_until: string | null;
  last_run_date: string | null;
  created_at: string;
  devices: Array<{ device_id: string; device_name: string }>;
  blueprints: Array<{ blueprint_id: string; blueprint_title: string; role: "controlling" | "driven" }>;
  lastRun: { id: string; status: string; triggered_at: string; triggered_by: string } | null;
}

interface Props {
  homeId: string;
  canManage: boolean;
  canRun: boolean;
}

type ModalKind = "time" | "sensor";

export default function AutomationsSection({ homeId, canManage, canRun }: Props) {
  const [automations, setAutomations] = useState<AutomationFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalKind, setModalKind] = useState<ModalKind>("time");
  const [editingAutomation, setEditingAutomation] = useState<AutomationFull | null>(null);
  const [editingSensorAutomation, setEditingSensorAutomation] = useState<SensorAutomation | null>(null);
  // 2026-06-16 Phase 3 — when the user taps "+ New automation" we open
  // a small mode picker first (time-scheduled vs sensor-triggered).
  // Editing skips the picker since the kind is already known.
  const [showModePicker, setShowModePicker] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: raw } = await supabase
      .from("automations")
      .select(`
        id, home_id, name, is_active, scheduled_time, duration_seconds,
        fire_valves_sequentially, skip_if_rained, rain_threshold_mm,
        trigger_if_hot, heat_threshold_c, retry_on_failure,
        weather_mode, weather_min_probability, weather_defer_window_hours,
        critical_threshold_value, max_defers, defer_skip_in_heat,
        sensor_threshold_value, defer_until,
        last_run_date, created_at,
        automation_devices(device_id, devices(id, name)),
        automation_blueprints(blueprint_id, role, task_blueprints(title))
      `)
      .eq("home_id", homeId)
      .order("created_at");

    const rows = (raw ?? []) as any[];

    if (rows.length === 0) {
      setAutomations([]);
      setLoading(false);
      return;
    }

    const ids = rows.map((r) => r.id);
    const { data: runData } = await supabase
      .from("automation_runs")
      .select("id, automation_id, status, triggered_at, triggered_by")
      .in("automation_id", ids)
      .order("triggered_at", { ascending: false });

    const latestRunByAutomation = new Map<string, typeof runData extends (infer U)[] | null ? U : never>();
    for (const run of runData ?? []) {
      if (!latestRunByAutomation.has(run.automation_id)) {
        latestRunByAutomation.set(run.automation_id, run);
      }
    }

    const parsed: AutomationFull[] = rows.map((r) => ({
      id: r.id,
      home_id: r.home_id,
      name: r.name,
      is_active: r.is_active,
      scheduled_time: r.scheduled_time,
      duration_seconds: r.duration_seconds,
      fire_valves_sequentially: r.fire_valves_sequentially,
      skip_if_rained: r.skip_if_rained,
      rain_threshold_mm: r.rain_threshold_mm,
      trigger_if_hot: r.trigger_if_hot ?? false,
      heat_threshold_c: r.heat_threshold_c ?? 28,
      retry_on_failure: r.retry_on_failure,
      weather_mode: r.weather_mode ?? "off",
      weather_min_probability: r.weather_min_probability ?? 60,
      weather_defer_window_hours: r.weather_defer_window_hours ?? 12,
      critical_threshold_value: r.critical_threshold_value ?? null,
      max_defers: r.max_defers ?? 2,
      defer_skip_in_heat: r.defer_skip_in_heat ?? true,
      sensor_threshold_value: r.sensor_threshold_value ?? null,
      defer_until: r.defer_until ?? null,
      last_run_date: r.last_run_date,
      created_at: r.created_at,
      devices: (r.automation_devices ?? []).map((d: any) => ({
        device_id: d.device_id,
        device_name: d.devices?.name ?? "Unknown device",
      })),
      blueprints: (r.automation_blueprints ?? []).map((b: any) => ({
        blueprint_id: b.blueprint_id,
        blueprint_title: b.task_blueprints?.title ?? "Unknown task",
        role: b.role as "controlling" | "driven",
      })),
      lastRun: latestRunByAutomation.get(r.id) ?? null,
    }));

    setAutomations(parsed);
    setLoading(false);
  }, [homeId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditingAutomation(null);
    setEditingSensorAutomation(null);
    setShowModePicker(true);
  };

  const startNewWithKind = async (kind: ModalKind) => {
    setShowModePicker(false);
    setModalKind(kind);
    setShowModal(true);
  };

  const openEdit = async (automation: AutomationFull) => {
    // 2026-06-16 — figure out whether this is a time or sensor automation
    // and route to the right modal. Time-scheduled is the default for the
    // existing rows; sensor-threshold needs an extra fetch for the rule
    // + sensors + actions that AutomationFull doesn't currently carry.
    const { data: row } = await supabase
      .from("automations")
      .select(
        "id, name, is_active, trigger_kind, area_id, sensor_metric, sensor_comparator, sensor_threshold_value, sensor_hysteresis, sensor_cooldown_minutes, sensor_agg_mode, " +
        "weather_mode, skip_if_rained, rain_threshold_mm, weather_min_probability, weather_defer_window_hours, critical_threshold_value, max_defers, defer_skip_in_heat",
      )
      .eq("id", automation.id)
      .single();
    if (row && (row as any).trigger_kind === "sensor_threshold") {
      const [{ data: sensors }, { data: actions }] = await Promise.all([
        supabase
          .from("automation_sensors")
          .select("sensor_device_id")
          .eq("automation_id", automation.id),
        supabase
          .from("automation_actions")
          .select("id, action_kind, notification_title, notification_body, target_device_id, valve_duration_seconds, ord")
          .eq("automation_id", automation.id)
          .order("ord", { ascending: true }),
      ]);
      setEditingSensorAutomation({
        id: (row as any).id,
        name: (row as any).name,
        is_active: (row as any).is_active,
        area_id: (row as any).area_id ?? null,
        sensor_metric: (row as any).sensor_metric ?? null,
        sensor_comparator: (row as any).sensor_comparator ?? null,
        sensor_threshold_value: (row as any).sensor_threshold_value ?? null,
        sensor_hysteresis: (row as any).sensor_hysteresis ?? 0,
        sensor_cooldown_minutes: (row as any).sensor_cooldown_minutes ?? 60,
        sensor_agg_mode: (row as any).sensor_agg_mode ?? "any",
        weather_mode: (row as any).weather_mode ?? null,
        skip_if_rained: (row as any).skip_if_rained ?? null,
        rain_threshold_mm: (row as any).rain_threshold_mm ?? null,
        weather_min_probability: (row as any).weather_min_probability ?? null,
        weather_defer_window_hours: (row as any).weather_defer_window_hours ?? null,
        critical_threshold_value: (row as any).critical_threshold_value ?? null,
        max_defers: (row as any).max_defers ?? null,
        defer_skip_in_heat: (row as any).defer_skip_in_heat ?? null,
        sensors: (sensors ?? []) as any,
        actions: (actions ?? []) as any,
      });
      setModalKind("sensor");
      setShowModal(true);
      return;
    }
    setEditingAutomation(automation);
    setModalKind("time");
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingAutomation(null);
    setEditingSensorAutomation(null);
  };

  const handleSaved = () => {
    closeModal();
    load();
  };

  const handleDeleted = (id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="mt-10">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rhozly-primary/10 flex items-center justify-center shrink-0">
            <Zap size={16} className="text-rhozly-primary" />
          </div>
          <div>
            <h2 className="font-black text-rhozly-on-surface text-base leading-tight">Automations</h2>
            <p className="text-xs text-rhozly-on-surface-variant">Schedule valves to run automatically</p>
          </div>
        </div>
        {canManage && (
          <button
            onClick={openNew}
            data-testid="automation-new"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rhozly-primary text-white text-xs font-bold hover:bg-rhozly-primary/90 transition-colors shrink-0"
          >
            <Plus size={14} />
            New automation
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-rhozly-on-surface-variant" />
        </div>
      ) : automations.length === 0 ? (
        <AutomationsEmptyState onNew={canManage ? openNew : undefined} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onEdit={() => openEdit(a)}
              onDeleted={() => handleDeleted(a.id)}
              canManage={canManage}
              canRun={canRun}
            />
          ))}
        </div>
      )}

      {showModal && modalKind === "time" && (
        <AutomationModal
          homeId={homeId}
          automation={editingAutomation}
          onSaved={handleSaved}
          onClose={closeModal}
        />
      )}
      {showModal && modalKind === "sensor" && (
        <SensorAutomationModal
          homeId={homeId}
          automation={editingSensorAutomation}
          onSaved={handleSaved}
          onClose={closeModal}
        />
      )}
      {showModePicker && (
        <ModePickerModal
          onPick={(k) => startNewWithKind(k)}
          onClose={() => setShowModePicker(false)}
        />
      )}
    </div>
  );
}

/**
 * Tiny chooser shown on "+ New automation". Lets the user decide
 * upfront whether they're building a time-scheduled automation (e.g.
 * "07:00 water valves daily") or a sensor-triggered one ("greenhouse
 * temp >= 30°C → notify me"). Routes to the matching modal.
 */
function ModePickerModal({
  onPick,
  onClose,
}: {
  onPick: (kind: ModalKind) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      data-testid="automation-mode-picker"
      className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-rhozly-outline/10">
          <div className="min-w-0">
            <h2 className="font-display font-black text-lg text-rhozly-on-surface">New automation</h2>
            <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug">
              Pick how this one should fire.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <button
            type="button"
            data-testid="mode-picker-time"
            onClick={() => onPick("time")}
            className="w-full flex items-start gap-3 p-4 rounded-2xl border-2 border-rhozly-outline/20 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-rhozly-on-surface">Time-scheduled</p>
              <p className="text-xs font-bold text-rhozly-on-surface/55 mt-0.5 leading-snug">
                Fires at a daily time. Optionally skip on rain. Best for routine watering.
              </p>
            </div>
          </button>
          <button
            type="button"
            data-testid="mode-picker-sensor"
            onClick={() => onPick("sensor")}
            className="w-full flex items-start gap-3 p-4 rounded-2xl border-2 border-rhozly-outline/20 hover:border-rhozly-primary/40 hover:bg-rhozly-primary/5 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Cpu size={18} />
            </div>
            <div>
              <p className="text-sm font-black text-rhozly-on-surface">Sensor-triggered</p>
              <p className="text-xs font-bold text-rhozly-on-surface/55 mt-0.5 leading-snug">
                Fires when a soil sensor reading crosses your threshold. Notification + valves.
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function AutomationsEmptyState({ onNew }: { onNew?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 rounded-3xl border border-dashed border-rhozly-outline/30 bg-rhozly-surface-lowest">
      <div className="w-12 h-12 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center mb-3">
        <Zap size={22} className="text-rhozly-primary/60" />
      </div>
      <h3 className="font-bold text-rhozly-on-surface text-sm mb-1">No automations yet</h3>
      <p className="text-xs text-rhozly-on-surface-variant max-w-xs mb-4">
        Set up a schedule to automatically water your garden when tasks are due.
      </p>
      {onNew && (
        <button
          onClick={onNew}
          data-testid="automation-empty-new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rhozly-primary text-white text-xs font-bold hover:bg-rhozly-primary/90 transition-colors"
        >
          <Plus size={14} />
          Create your first automation
        </button>
      )}
    </div>
  );
}
