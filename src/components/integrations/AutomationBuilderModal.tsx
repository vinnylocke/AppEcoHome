// Unified automation builder (Phase 2). One modal for every automation: a free
// boolean condition tree (sensors / time / tasks / weather, AND/OR/NOT) plus an
// ordered list of actions. Replaces AutomationModal + SensorAutomationModal.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Check, Plus, Trash2, Bell, Power, PowerOff, Gauge } from "lucide-react";
import toast from "react-hot-toast";
import { supabase } from "../../lib/supabase";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { newGroup, newLeaf, summariseTree, type ConditionNode } from "../../lib/conditionTree";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "../../lib/automationTemplates";
import { scopeDevicesToArea } from "../../lib/automationDeviceScope";
import { hemisphereForHome } from "../../lib/dateRangeLeaf";
import type { Hemisphere } from "../../lib/seasonal";
import ConditionNodeEditor, { type BuilderCtx } from "./ConditionNodeEditor";

interface Props {
  homeId: string;
  automationId: string | null; // null = create
  onSaved: () => void;
  onClose: () => void;
}

type ActionKind = "valve_open" | "valve_close" | "notification" | "complete_task";
interface ActionDraft {
  action_kind: ActionKind;
  target_device_id: string | null;
  target_blueprint_id: string | null;
  valve_duration_seconds: number | null;
  notification_title: string | null;
  notification_body: string | null;
}

interface DeviceOpt { id: string; name: string; area_id: string | null }

const defaultTree = (): ConditionNode => ({ kind: "group", op: "and", children: [newLeaf("sensor")] });

/** All sensor ids referenced anywhere in the condition tree. */
function collectSensorIds(node: ConditionNode): string[] {
  if (node.kind === "group") return node.children.flatMap(collectSensorIds);
  return node.kind === "sensor" ? (node.sensorIds ?? []) : [];
}

export default function AutomationBuilderModal({ homeId, automationId, onSaved, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const isEdit = automationId !== null;

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [cooldown, setCooldown] = useState(60);
  const [tree, setTree] = useState<ConditionNode>(defaultTree());
  const [actions, setActions] = useState<ActionDraft[]>([]);

  const [locationId, setLocationId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null);
  const [runLimitCount, setRunLimitCount] = useState<number | null>(null);
  const [runLimitWindowHours, setRunLimitWindowHours] = useState(24);

  const [sensors, setSensors] = useState<DeviceOpt[]>([]);
  const [valves, setValves] = useState<DeviceOpt[]>([]);
  const [blueprints, setBlueprints] = useState<Array<{ id: string; title: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [areas, setAreas] = useState<Array<{ id: string; name: string; location_id: string }>>([]);
  const [hemisphere, setHemisphere] = useState<Hemisphere>("northern");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: devs }, { data: bps }, { data: locs }, { data: home }, autoRes] = await Promise.all([
        supabase.from("devices").select("id, name, device_type, area_id").eq("home_id", homeId).eq("is_active", true).order("name"),
        supabase.from("task_blueprints").select("id, title").eq("home_id", homeId).eq("is_recurring", true).order("title"),
        supabase.from("locations").select("id, name").eq("home_id", homeId).order("name"),
        supabase.from("homes").select("lat, timezone").eq("id", homeId).maybeSingle(),
        automationId
          ? supabase.from("automations").select("name, is_active, sensor_cooldown_minutes, trigger_logic, location_id, area_id, run_limit_count, run_limit_window_hours").eq("id", automationId).single()
          : Promise.resolve({ data: null }),
      ]);
      const toOpt = (d: { id: string; name: string; area_id: string | null }) => ({ id: d.id, name: d.name, area_id: d.area_id ?? null });
      setSensors((devs ?? []).filter((d: { device_type: string }) => d.device_type === "soil_sensor").map(toOpt));
      setValves((devs ?? []).filter((d: { device_type: string }) => d.device_type === "water_valve").map(toOpt));
      setBlueprints((bps ?? []).map((b: { id: string; title: string }) => ({ id: b.id, title: b.title })));
      setLocations((locs ?? []) as Array<{ id: string; name: string }>);
      setHemisphere(hemisphereForHome(home as { lat?: number | null; timezone?: string | null } | null));

      const locIds = (locs ?? []).map((l: { id: string }) => l.id);
      if (locIds.length) {
        const { data: ars } = await supabase.from("areas").select("id, name, location_id").in("location_id", locIds).order("name");
        setAreas((ars ?? []) as Array<{ id: string; name: string; location_id: string }>);
      }

      const a = (autoRes as { data: { name: string; is_active: boolean; sensor_cooldown_minutes: number | null; trigger_logic: ConditionNode | null; location_id: string | null; area_id: string | null; run_limit_count: number | null; run_limit_window_hours: number | null } | null }).data;
      if (a) {
        setName(a.name);
        setIsActive(a.is_active);
        setCooldown(a.sensor_cooldown_minutes ?? 60);
        setTree(a.trigger_logic ?? defaultTree());
        setLocationId(a.location_id ?? null);
        setAreaId(a.area_id ?? null);
        setRunLimitCount(a.run_limit_count ?? null);
        setRunLimitWindowHours(a.run_limit_window_hours ?? 24);
        const { data: acts } = await supabase.from("automation_actions")
          .select("action_kind, target_device_id, target_blueprint_id, valve_duration_seconds, notification_title, notification_body")
          .eq("automation_id", automationId).order("ord", { ascending: true });
        setActions((acts ?? []) as ActionDraft[]);
      }
      setLoading(false);
    })();
  }, [homeId, automationId]);

  const selectedValveIds = useMemo(
    () => actions.filter((a) => a.action_kind === "valve_open" || a.action_kind === "valve_close")
      .map((a) => a.target_device_id).filter((x): x is string => !!x),
    [actions],
  );
  const scopedSensors = useMemo(() => scopeDevicesToArea(sensors, areaId, collectSensorIds(tree)), [sensors, areaId, tree]);
  const scopedValves = useMemo(() => scopeDevicesToArea(valves, areaId, selectedValveIds), [valves, areaId, selectedValveIds]);
  const areasForLocation = useMemo(() => locationId ? areas.filter((ar) => ar.location_id === locationId) : areas, [areas, locationId]);
  const ctx: BuilderCtx = useMemo(() => ({ sensors: scopedSensors, blueprints, hemisphere }), [scopedSensors, blueprints, hemisphere]);
  const summary = useMemo(() => summariseTree(tree), [tree]);

  const applyTemplate = (t: AutomationTemplate) => {
    const built = t.build();
    if (!name.trim()) setName(built.name);
    setTree(built.tree);
    setActions(built.actions.map((a) => ({
      action_kind: a.action_kind,
      target_device_id: a.action_kind === "notification" ? null : (valves[0]?.id ?? null),
      target_blueprint_id: null,
      valve_duration_seconds: a.valve_duration_seconds ?? 1800,
      notification_title: a.notification_title ?? null,
      notification_body: null,
    })));
  };

  const addAction = () => setActions((p) => [...p, { action_kind: "valve_open", target_device_id: valves[0]?.id ?? null, target_blueprint_id: null, valve_duration_seconds: 1800, notification_title: null, notification_body: null }]);
  const setAction = (i: number, patch: Partial<ActionDraft>) => setActions((p) => p.map((a, j) => j === i ? { ...a, ...patch } : a));
  const delAction = (i: number) => setActions((p) => p.filter((_, j) => j !== i));

  const save = async () => {
    if (!name.trim()) { toast.error("Give the automation a name"); return; }
    setSaving(true);
    try {
      const payload = {
        home_id: homeId, name: name.trim(), is_active: isActive,
        trigger_kind: "condition", trigger_logic: tree,
        sensor_cooldown_minutes: cooldown, condition_was_true: false,
        location_id: locationId, area_id: areaId,
        run_limit_count: runLimitCount && runLimitCount > 0 ? runLimitCount : null,
        run_limit_window_hours: runLimitWindowHours > 0 ? runLimitWindowHours : 24,
      };
      let id = automationId;
      if (isEdit && id) {
        const { error } = await supabase.from("automations").update(payload).eq("id", id);
        if (error) throw error;
        await supabase.from("automation_actions").delete().eq("automation_id", id);
      } else {
        const { data, error } = await supabase.from("automations").insert(payload).select("id").single();
        if (error) throw error;
        id = (data as { id: string }).id;
      }
      if (actions.length > 0) {
        const { error: actErr } = await supabase.from("automation_actions").insert(
          actions.map((a, ord) => ({
            automation_id: id, action_kind: a.action_kind,
            target_device_id: (a.action_kind === "valve_open" || a.action_kind === "valve_close") ? (a.target_device_id || null) : null,
            target_blueprint_id: a.action_kind === "complete_task" ? (a.target_blueprint_id || null) : null,
            valve_duration_seconds: a.action_kind === "valve_open" ? (a.valve_duration_seconds ?? 1800) : null,
            notification_title: a.notification_title?.trim() || null,
            notification_body: a.notification_body?.trim() || null,
            ord,
          })),
        );
        if (actErr) throw actErr;
      }
      toast.success(isEdit ? "Automation updated" : "Automation created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div ref={trapRef} className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto overflow-x-hidden" data-testid="automation-builder-modal">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-black text-gray-900">{isEdit ? "Edit automation" : "New automation"}</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100"><X size={20} /></button>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-3">
              <input data-testid="automation-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Automation name"
                className="flex-1 min-w-0 rounded-xl border border-gray-200 p-3 font-semibold" />
              <button type="button" data-testid="automation-active" onClick={() => setIsActive((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold ${isActive ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"}`}>
                {isActive ? <Power size={15} /> : <PowerOff size={15} />}{isActive ? "Active" : "Off"}
              </button>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Scope (optional)</p>
              <div className="flex flex-wrap items-center gap-2">
                <select data-testid="automation-location" value={locationId ?? ""}
                  onChange={(e) => { setLocationId(e.target.value || null); setAreaId(null); }}
                  className="rounded-lg border border-gray-200 p-1.5 text-sm">
                  <option value="">All locations</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select data-testid="automation-area" value={areaId ?? ""}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setAreaId(v);
                    if (v) { const ar = areas.find((x) => x.id === v); if (ar) setLocationId(ar.location_id); }
                  }}
                  className="rounded-lg border border-gray-200 p-1.5 text-sm" disabled={areasForLocation.length === 0}>
                  <option value="">{locationId ? "All areas here" : "Any area"}</option>
                  {areasForLocation.map((ar) => <option key={ar.id} value={ar.id}>{ar.name}</option>)}
                </select>
                {areaId && <span className="text-[11px] text-gray-400">Sensor & valve pickers filtered to this area</span>}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Start from a template</p>
              <div className="flex flex-wrap gap-2">
                {AUTOMATION_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    data-testid={`template-${t.id}`}
                    title={t.description}
                    onClick={() => applyTemplate(t)}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-bold text-gray-600 hover:border-emerald-400 hover:text-emerald-700 transition-colors"
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">When all of this is true…</p>
              <ConditionNodeEditor node={tree} ctx={ctx} onChange={setTree} />
              <p className="mt-2 text-xs text-emerald-800 bg-emerald-50 rounded-lg p-2" data-testid="automation-summary">{summary}</p>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">…do this</p>
              <div className="space-y-2">
                {actions.map((a, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 p-3 flex flex-wrap items-center gap-2" data-testid={`action-${i}`}>
                    <select value={a.action_kind} onChange={(e) => setAction(i, { action_kind: e.target.value as ActionKind })} className="rounded-lg border border-gray-200 p-1.5 text-sm font-semibold">
                      <option value="valve_open">Open valve</option>
                      <option value="valve_close">Close valve</option>
                      <option value="notification">Notify</option>
                      <option value="complete_task">Complete task</option>
                    </select>
                    {(a.action_kind === "valve_open" || a.action_kind === "valve_close") && (
                      <select data-testid={`action-valve-${i}`} value={a.target_device_id ?? ""} onChange={(e) => setAction(i, { target_device_id: e.target.value })} className="rounded-lg border border-gray-200 p-1.5 text-sm">
                        <option value="">Select valve…</option>
                        {scopedValves.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                    )}
                    {a.action_kind === "valve_open" && (
                      <label className="text-xs text-gray-500">for <input type="number" value={a.valve_duration_seconds ?? 1800} onChange={(e) => setAction(i, { valve_duration_seconds: Number(e.target.value) })} className="rounded-lg border border-gray-200 p-1.5 text-sm w-20 mx-1" />s</label>
                    )}
                    {a.action_kind === "notification" && (
                      <input value={a.notification_title ?? ""} onChange={(e) => setAction(i, { notification_title: e.target.value })} placeholder="Title (optional)" className="flex-1 rounded-lg border border-gray-200 p-1.5 text-sm" />
                    )}
                    {a.action_kind === "complete_task" && (
                      <select data-testid={`action-blueprint-${i}`} value={a.target_blueprint_id ?? ""} onChange={(e) => setAction(i, { target_blueprint_id: e.target.value })} className="rounded-lg border border-gray-200 p-1.5 text-sm">
                        <option value="">Select task…</option>
                        {blueprints.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
                      </select>
                    )}
                    <button type="button" onClick={() => delAction(i)} className="ml-auto text-gray-300 hover:text-rose-500"><Trash2 size={15} /></button>
                  </div>
                ))}
                <button type="button" data-testid="add-action" onClick={addAction} className="inline-flex items-center gap-1 text-sm font-bold text-emerald-600 hover:underline"><Plus size={14} /> Add action</button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Bell size={14} className="text-gray-400" />
              <label className="text-xs text-gray-500">Don't re-fire for <input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="rounded-lg border border-gray-200 p-1.5 text-sm w-20 mx-1" /> min after firing</label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Gauge size={14} className="text-gray-400" />
              <label className="text-xs text-gray-500">Run at most
                <input data-testid="automation-run-limit" type="number" min={1} value={runLimitCount ?? ""} placeholder="∞"
                  onChange={(e) => setRunLimitCount(e.target.value === "" ? null : Math.max(1, Number(e.target.value)))}
                  className="rounded-lg border border-gray-200 p-1.5 text-sm w-16 mx-1" />
                time(s) per
                <input data-testid="automation-run-window" type="number" min={1} value={runLimitWindowHours}
                  onChange={(e) => setRunLimitWindowHours(Math.max(1, Number(e.target.value)))}
                  className="rounded-lg border border-gray-200 p-1.5 text-sm w-16 mx-1" />
                hours
              </label>
              {runLimitCount == null && <span className="text-[11px] text-gray-400">(blank = unlimited)</span>}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-100">Cancel</button>
              <button onClick={save} disabled={saving} data-testid="automation-save" className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-black flex items-center justify-center gap-2 disabled:opacity-50">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
