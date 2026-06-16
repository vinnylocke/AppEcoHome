import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Check,
  Bell,
  Power,
  PowerOff,
  Cpu,
  Plus,
  Trash2,
  Thermometer,
  Droplets,
  Zap,
  MapPin,
} from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { useFocusTrap } from "../../hooks/useFocusTrap";

/**
 * Phase 3 (2026-06-16) — sensor-driven automation builder.
 *
 * Distinct from the existing time-scheduled AutomationModal because
 * the field set is fundamentally different: no schedule, no
 * weather-awareness, no task blueprints — just a rule (metric +
 * comparator + threshold + multi-sensor aggregation) and an ordered
 * list of actions.
 *
 * Flow:
 *   1. Pick an area (optional but recommended — when set the sensor /
 *      valve pickers filter to devices in that area).
 *   2. Pick one or more sensors.
 *   3. Build the rule (metric / comparator / value / hysteresis /
 *      cooldown / agg_mode).
 *   4. Add one or more actions (notification / valve_open / valve_close).
 */

export interface SensorAutomation {
  id: string;
  name: string;
  is_active: boolean;
  area_id: string | null;
  sensor_metric: "soil_moisture" | "soil_temp_c" | "soil_ec" | null;
  sensor_comparator: ">" | ">=" | "<" | "<=" | null;
  sensor_threshold_value: number | null;
  sensor_hysteresis: number;
  sensor_cooldown_minutes: number;
  sensor_agg_mode: "any" | "all" | "average";
  sensors: Array<{ sensor_device_id: string }>;
  actions: Array<{
    id?: string;
    action_kind: "notification" | "valve_open" | "valve_close";
    notification_title: string | null;
    notification_body: string | null;
    target_device_id: string | null;
    valve_duration_seconds: number | null;
    ord: number;
  }>;
}

interface Props {
  homeId: string;
  automation: SensorAutomation | null;
  onSaved: () => void;
  onClose: () => void;
}

interface AvailableDevice {
  id: string;
  name: string;
  device_type: "soil_sensor" | "water_valve";
  area_id: string | null;
}

interface AvailableArea {
  id: string;
  name: string;
  location_name: string;
}

const METRICS = [
  { id: "soil_moisture",   label: "Moisture",    icon: Droplets,    unit: "%",      color: "text-blue-600" },
  { id: "soil_temp_c",     label: "Temperature", icon: Thermometer, unit: "°C",     color: "text-orange-600" },
  { id: "soil_ec",         label: "EC",          icon: Zap,         unit: "µS/cm",  color: "text-amber-600" },
] as const;

const COMPARATORS = [
  { id: ">=", label: "≥ at least" },
  { id: ">",  label: ">  more than" },
  { id: "<=", label: "≤ at most" },
  { id: "<",  label: "<  less than" },
] as const;

const AGG_MODES = [
  { id: "any",     label: "Any sensor", hint: "Fires when ANY of the linked sensors satisfies the rule." },
  { id: "all",     label: "All sensors", hint: "Fires only when EVERY linked sensor satisfies the rule." },
  { id: "average", label: "Average",     hint: "Fires when the AVERAGE across linked sensors satisfies the rule." },
] as const;

export default function SensorAutomationModal({ homeId, automation, onSaved, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const isEdit = automation !== null;

  // ── Form state ────────────────────────────────────────────────────────
  const [name, setName] = useState(automation?.name ?? "");
  const [isActive, setIsActive] = useState(automation?.is_active ?? true);
  const [areaId, setAreaId] = useState(automation?.area_id ?? "");
  const [metric, setMetric] = useState<NonNullable<SensorAutomation["sensor_metric"]>>(
    automation?.sensor_metric ?? "soil_temp_c",
  );
  const [comparator, setComparator] = useState<NonNullable<SensorAutomation["sensor_comparator"]>>(
    automation?.sensor_comparator ?? ">=",
  );
  const [thresholdValue, setThresholdValue] = useState<string>(
    automation?.sensor_threshold_value !== null && automation?.sensor_threshold_value !== undefined
      ? String(automation.sensor_threshold_value)
      : "",
  );
  const [hysteresis, setHysteresis] = useState<number>(automation?.sensor_hysteresis ?? 0);
  const [cooldownMinutes, setCooldownMinutes] = useState<number>(automation?.sensor_cooldown_minutes ?? 60);
  const [aggMode, setAggMode] = useState<NonNullable<SensorAutomation["sensor_agg_mode"]>>(
    automation?.sensor_agg_mode ?? "any",
  );
  const [selectedSensorIds, setSelectedSensorIds] = useState<string[]>(
    automation?.sensors.map((s) => s.sensor_device_id) ?? [],
  );
  const [actions, setActions] = useState<SensorAutomation["actions"]>(
    automation?.actions ?? [
      {
        action_kind: "notification",
        notification_title: null,
        notification_body: null,
        target_device_id: null,
        valve_duration_seconds: null,
        ord: 0,
      },
    ],
  );

  const [devices, setDevices] = useState<AvailableDevice[]>([]);
  const [areas, setAreas] = useState<AvailableArea[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Load options ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoadingOptions(true);
      const [{ data: devs }, { data: areaRows }] = await Promise.all([
        supabase
          .from("devices")
          .select("id, name, device_type, area_id")
          .eq("home_id", homeId)
          .eq("is_active", true)
          .in("device_type", ["soil_sensor", "water_valve"]),
        supabase
          .from("areas")
          .select("id, name, locations!inner(name, home_id)")
          .eq("locations.home_id", homeId),
      ]);
      setDevices((devs ?? []) as AvailableDevice[]);
      setAreas(
        ((areaRows ?? []) as Array<{ id: string; name: string; locations: { name: string } | { name: string }[] }>)
          .map((a) => ({
            id: a.id,
            name: a.name,
            location_name: Array.isArray(a.locations) ? a.locations[0]?.name ?? "" : a.locations?.name ?? "",
          })),
      );
      setLoadingOptions(false);
    })();
  }, [homeId]);

  // ── Derived: filtered device lists ────────────────────────────────────
  const sensors = useMemo(
    () => devices.filter((d) => d.device_type === "soil_sensor" && (!areaId || d.area_id === areaId)),
    [devices, areaId],
  );
  const valves = useMemo(
    () => devices.filter((d) => d.device_type === "water_valve" && (!areaId || d.area_id === areaId)),
    [devices, areaId],
  );

  // ── Action editor helpers ─────────────────────────────────────────────
  const addAction = (kind: "notification" | "valve_open" | "valve_close") => {
    setActions((prev) => [
      ...prev,
      {
        action_kind: kind,
        notification_title: null,
        notification_body: null,
        target_device_id: null,
        valve_duration_seconds: kind === "valve_open" ? 1800 : null,
        ord: prev.length,
      },
    ]);
  };
  const removeAction = (idx: number) => {
    setActions((prev) => prev.filter((_, i) => i !== idx).map((a, i) => ({ ...a, ord: i })));
  };
  const updateAction = (idx: number, patch: Partial<SensorAutomation["actions"][number]>) => {
    setActions((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  };

  // ── Validation ────────────────────────────────────────────────────────
  const validationError = (() => {
    if (!name.trim()) return "Give the automation a name.";
    if (selectedSensorIds.length === 0) return "Pick at least one sensor.";
    if (thresholdValue.trim() === "" || !Number.isFinite(Number(thresholdValue))) {
      return "Enter a valid threshold value.";
    }
    if (actions.length === 0) return "Add at least one action.";
    for (const a of actions) {
      if ((a.action_kind === "valve_open" || a.action_kind === "valve_close") && !a.target_device_id) {
        return "Each valve action needs a target valve.";
      }
      if (a.action_kind === "valve_open" && (!a.valve_duration_seconds || a.valve_duration_seconds <= 0)) {
        return "Each Open Valve action needs a duration.";
      }
    }
    return null;
  })();

  // ── Save ──────────────────────────────────────────────────────────────
  const save = async () => {
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      const automationPayload = {
        home_id: homeId,
        name: name.trim(),
        is_active: isActive,
        trigger_kind: "sensor_threshold" as const,
        area_id: areaId || null,
        sensor_metric: metric,
        sensor_comparator: comparator,
        sensor_threshold_value: Number(thresholdValue),
        sensor_hysteresis: hysteresis,
        sensor_cooldown_minutes: cooldownMinutes,
        sensor_agg_mode: aggMode,
      };

      let automationId: string;
      if (isEdit && automation) {
        const { error } = await supabase
          .from("automations")
          .update(automationPayload)
          .eq("id", automation.id);
        if (error) throw error;
        automationId = automation.id;
        await supabase.from("automation_sensors").delete().eq("automation_id", automationId);
        await supabase.from("automation_actions").delete().eq("automation_id", automationId);
      } else {
        const { data: inserted, error } = await supabase
          .from("automations")
          .insert(automationPayload)
          .select("id")
          .single();
        if (error || !inserted) throw error ?? new Error("Could not create automation");
        automationId = (inserted as { id: string }).id;
      }

      // Sensors join.
      if (selectedSensorIds.length > 0) {
        const { error: sensErr } = await supabase.from("automation_sensors").insert(
          selectedSensorIds.map((id) => ({ automation_id: automationId, sensor_device_id: id })),
        );
        if (sensErr) throw sensErr;
      }

      // Actions list.
      const { error: actErr } = await supabase.from("automation_actions").insert(
        actions.map((a, ord) => ({
          automation_id: automationId,
          action_kind: a.action_kind,
          notification_title: a.notification_title?.trim() || null,
          notification_body: a.notification_body?.trim() || null,
          target_device_id: a.target_device_id || null,
          valve_duration_seconds: a.action_kind === "valve_open"
            ? (a.valve_duration_seconds ?? 1800)
            : null,
          ord,
        })),
      );
      if (actErr) throw actErr;

      toast.success(isEdit ? "Automation updated" : "Automation created");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save automation");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────
  const metricMeta = METRICS.find((m) => m.id === metric)!;

  return createPortal(
    <div
      data-testid="sensor-automation-modal"
      className="fixed inset-0 z-[110] bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sensor-automation-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl border border-rhozly-outline/10 overflow-hidden animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-rhozly-outline/10">
          <div className="min-w-0">
            <h2 id="sensor-automation-title" className="font-display font-black text-lg text-rhozly-on-surface truncate">
              {isEdit ? "Edit sensor automation" : "New sensor automation"}
            </h2>
            <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug">
              Fires when a sensor reading crosses your threshold.
            </p>
          </div>
          <button
            type="button"
            data-testid="sensor-auto-close"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 p-2 rounded-xl text-rhozly-on-surface/40 hover:text-rhozly-on-surface hover:bg-rhozly-surface-low transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loadingOptions ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-rhozly-primary" size={22} />
            </div>
          ) : (
            <>
              {/* Name + active */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
                    Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Greenhouse hot alert"
                    data-testid="sensor-auto-name"
                    className="w-full px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                  />
                </div>

                <label className="flex items-start gap-3 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="mt-1 w-4 h-4 accent-rhozly-primary"
                  />
                  <div>
                    <p className="font-bold text-rhozly-on-surface">Active</p>
                    <p className="text-[11px] text-rhozly-on-surface/55">
                      Uncheck to pause without deleting the rule.
                    </p>
                  </div>
                </label>
              </div>

              {/* Area scope */}
              <Section title="Area scope" hint="When set, the sensor + valve pickers below show only devices linked to this area.">
                <div className="flex items-center gap-2">
                  <MapPin size={14} className="text-rhozly-on-surface/40" />
                  <select
                    value={areaId}
                    onChange={(e) => {
                      setAreaId(e.target.value);
                      // Clear picks that no longer fit the area filter.
                      setSelectedSensorIds([]);
                      setActions((prev) => prev.map((a) =>
                        a.action_kind === "notification" ? a : { ...a, target_device_id: null }
                      ));
                    }}
                    data-testid="sensor-auto-area"
                    className="flex-1 px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                  >
                    <option value="">Any area</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.location_name} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </Section>

              {/* Sensors */}
              <Section title="Sensors" hint="Pick one or more linked soil sensors. Use the aggregation mode to combine them.">
                {sensors.length === 0 ? (
                  <p className="text-xs font-bold text-rhozly-on-surface/45 bg-rhozly-surface-low rounded-xl p-3">
                    No soil sensors {areaId ? "in this area" : "in this home"} yet. Connect one from Integrations.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sensors.map((s) => {
                      const checked = selectedSensorIds.includes(s.id);
                      return (
                        <label
                          key={s.id}
                          data-testid={`sensor-auto-sensor-${s.id}`}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 cursor-pointer transition-colors ${
                            checked
                              ? "border-rhozly-primary bg-rhozly-primary/5"
                              : "border-rhozly-outline/15 hover:border-rhozly-primary/30"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedSensorIds((prev) =>
                                e.target.checked ? [...prev, s.id] : prev.filter((x) => x !== s.id),
                              );
                            }}
                            className="w-4 h-4 accent-rhozly-primary"
                          />
                          <Cpu size={14} className="text-rhozly-on-surface/55" />
                          <span className="flex-1 text-sm font-bold text-rhozly-on-surface truncate">
                            {s.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {selectedSensorIds.length > 1 && (
                  <div className="mt-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
                      When more than one sensor is linked
                    </p>
                    <div className="flex gap-1.5">
                      {AGG_MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          data-testid={`sensor-auto-agg-${m.id}`}
                          onClick={() => setAggMode(m.id)}
                          title={m.hint}
                          className={`flex-1 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 transition-all ${
                            aggMode === m.id
                              ? "border-rhozly-primary bg-rhozly-primary/5 text-rhozly-primary"
                              : "border-rhozly-outline/15 text-rhozly-on-surface/55 hover:border-rhozly-primary/30"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] font-bold text-rhozly-on-surface/45 mt-1.5 leading-snug">
                      {AGG_MODES.find((m) => m.id === aggMode)?.hint}
                    </p>
                  </div>
                )}
              </Section>

              {/* Rule */}
              <Section title="Rule" hint="The threshold that triggers the automation.">
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {METRICS.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        data-testid={`sensor-auto-metric-${m.id}`}
                        onClick={() => setMetric(m.id)}
                        className={`flex flex-col items-center gap-1 py-3 rounded-xl border-2 transition-all ${
                          metric === m.id
                            ? "border-rhozly-primary bg-rhozly-primary/5"
                            : "border-rhozly-outline/15 hover:border-rhozly-primary/30"
                        }`}
                      >
                        <Icon size={16} className={m.color} />
                        <span className="text-[11px] font-black text-rhozly-on-surface">{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <select
                    value={comparator}
                    onChange={(e) => setComparator(e.target.value as typeof comparator)}
                    data-testid="sensor-auto-comparator"
                    className="col-span-6 px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                  >
                    {COMPARATORS.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="any"
                    value={thresholdValue}
                    onChange={(e) => setThresholdValue(e.target.value)}
                    placeholder="0"
                    data-testid="sensor-auto-threshold"
                    className="col-span-4 px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                  />
                  <span className="col-span-2 flex items-center justify-center text-xs font-black text-rhozly-on-surface/55">
                    {metricMeta.unit}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
                      Hysteresis ({metricMeta.unit})
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={hysteresis}
                      onChange={(e) => setHysteresis(Math.max(0, Number(e.target.value) || 0))}
                      data-testid="sensor-auto-hysteresis"
                      className="w-full px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1.5">
                      Cooldown (min)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={cooldownMinutes}
                      onChange={(e) => setCooldownMinutes(Math.max(0, Number(e.target.value) || 0))}
                      data-testid="sensor-auto-cooldown"
                      className="w-full px-3 py-2.5 min-h-[44px] bg-white rounded-xl border border-rhozly-outline/20 text-sm font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                    />
                  </div>
                </div>
                <p className="text-[10px] font-bold text-rhozly-on-surface/45 mt-1.5 leading-snug">
                  Hysteresis: how far past the threshold before firing (prevents flapping). Cooldown: minutes
                  between successive fires.
                </p>
              </Section>

              {/* Actions */}
              <Section title="Actions" hint="What happens when the rule fires.">
                <div className="space-y-2">
                  {actions.map((a, idx) => (
                    <div
                      key={idx}
                      data-testid={`sensor-auto-action-${idx}`}
                      className="bg-rhozly-surface-low/40 border border-rhozly-outline/15 rounded-xl p-3"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55">
                          {a.action_kind === "notification" && <><Bell size={12} /> Notification</>}
                          {a.action_kind === "valve_open" && <><Power size={12} /> Open valve</>}
                          {a.action_kind === "valve_close" && <><PowerOff size={12} /> Close valve</>}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAction(idx)}
                          data-testid={`sensor-auto-action-remove-${idx}`}
                          aria-label="Remove action"
                          className="p-1 text-rhozly-on-surface/40 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {a.action_kind === "notification" && (
                        <div className="space-y-2">
                          <input
                            type="text"
                            placeholder={`Notification title (defaults to "${name || "automation name"}")`}
                            value={a.notification_title ?? ""}
                            onChange={(e) => updateAction(idx, { notification_title: e.target.value })}
                            data-testid={`sensor-auto-notif-title-${idx}`}
                            className="w-full px-3 py-2 min-h-[40px] bg-white rounded-xl border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                          />
                          <textarea
                            placeholder="Body — what should the message say?"
                            value={a.notification_body ?? ""}
                            onChange={(e) => updateAction(idx, { notification_body: e.target.value })}
                            data-testid={`sensor-auto-notif-body-${idx}`}
                            rows={2}
                            className="w-full px-3 py-2 bg-white rounded-xl border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary resize-none"
                          />
                        </div>
                      )}

                      {(a.action_kind === "valve_open" || a.action_kind === "valve_close") && (
                        <div className="space-y-2">
                          {valves.length === 0 ? (
                            <p className="text-[11px] font-bold text-rhozly-on-surface/45 italic">
                              No valves {areaId ? "in this area" : "in this home"} yet.
                            </p>
                          ) : (
                            <select
                              value={a.target_device_id ?? ""}
                              onChange={(e) => updateAction(idx, { target_device_id: e.target.value || null })}
                              data-testid={`sensor-auto-valve-${idx}`}
                              className="w-full px-3 py-2 min-h-[40px] bg-white rounded-xl border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                            >
                              <option value="">Pick a valve…</option>
                              {valves.map((v) => (
                                <option key={v.id} value={v.id}>{v.name}</option>
                              ))}
                            </select>
                          )}
                          {a.action_kind === "valve_open" && (
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/55">
                                Duration
                              </span>
                              <input
                                type="number"
                                min={1}
                                value={a.valve_duration_seconds ?? 1800}
                                onChange={(e) => updateAction(idx, { valve_duration_seconds: Number(e.target.value) || 1800 })}
                                data-testid={`sensor-auto-duration-${idx}`}
                                className="w-24 px-2 py-1.5 min-h-[36px] bg-white rounded-xl border border-rhozly-outline/15 text-xs font-bold text-rhozly-on-surface outline-none focus:border-rhozly-primary"
                              />
                              <span className="text-[10px] font-bold text-rhozly-on-surface/55">
                                seconds ({Math.round((a.valve_duration_seconds ?? 1800) / 60)} min)
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <ActionButton onClick={() => addAction("notification")} icon={<Bell size={13} />} label="Add notification" />
                  <ActionButton onClick={() => addAction("valve_open")}   icon={<Power size={13} />} label="Add open valve" />
                  <ActionButton onClick={() => addAction("valve_close")}  icon={<PowerOff size={13} />} label="Add close valve" />
                </div>
              </Section>

              {validationError && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs font-bold text-amber-800">
                  {validationError}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-rhozly-outline/10 px-5 py-4 flex items-center justify-end gap-2">
          <button
            type="button"
            data-testid="sensor-auto-cancel"
            onClick={onClose}
            className="px-4 py-2.5 min-h-[44px] rounded-2xl text-sm font-bold text-rhozly-on-surface/55 hover:text-rhozly-on-surface transition"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="sensor-auto-save"
            onClick={save}
            disabled={saving || !!validationError}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 min-h-[44px] rounded-2xl bg-rhozly-primary text-white text-sm font-black hover:opacity-90 disabled:opacity-40 transition shadow-sm"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create automation"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40">{title}</p>
      {hint && <p className="text-[11px] font-bold text-rhozly-on-surface/45 leading-snug mt-0.5 mb-2">{hint}</p>}
      <div className={hint ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function ActionButton({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[40px] rounded-xl bg-white border-2 border-dashed border-rhozly-outline/20 text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/55 hover:text-rhozly-primary hover:border-rhozly-primary/30 transition-colors"
    >
      <Plus size={12} /> {icon} {label}
    </button>
  );
}
