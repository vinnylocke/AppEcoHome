import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { X, Loader2, Droplets, AlertCircle, Check, Search, ChevronDown, Thermometer, CloudRain } from "lucide-react";
import type { AutomationFull } from "./AutomationsSection";
import { useFocusTrap } from "../../hooks/useFocusTrap";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AvailableDevice { id: string; name: string; }

interface AvailableBlueprint {
  id: string;
  title: string;
  locationId: string | null;
  locationName: string | null;
  areaId: string | null;
  areaName: string | null;
  planId: string | null;
  planName: string | null;
  plantId: number | null;
  plantName: string | null;
}

interface Props {
  homeId: string;
  automation: AutomationFull | null;
  onSaved: () => void;
  onClose: () => void;
}

const DEFAULT_DURATION = 1800;
const DEFAULT_TIME = "07:00";

// ── Main component ────────────────────────────────────────────────────────────

export default function AutomationModal({ homeId, automation, onSaved, onClose }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const isEdit = automation !== null;

  // Form state
  const [name, setName] = useState(automation?.name ?? "");
  const [isActive, setIsActive] = useState(automation?.is_active ?? true);
  const [scheduledTime, setScheduledTime] = useState(
    automation?.scheduled_time ? automation.scheduled_time.slice(0, 5) : DEFAULT_TIME,
  );
  const [durationSeconds, setDurationSeconds] = useState(automation?.duration_seconds ?? DEFAULT_DURATION);
  const [fireSequentially, setFireSequentially] = useState(automation?.fire_valves_sequentially ?? false);
  const [skipIfRained, setSkipIfRained] = useState(automation?.skip_if_rained ?? false);
  const [rainThreshold, setRainThreshold] = useState(automation?.rain_threshold_mm ?? 5);
  const [triggerIfHot, setTriggerIfHot] = useState(automation?.trigger_if_hot ?? false);
  const [heatThreshold, setHeatThreshold] = useState(automation?.heat_threshold_c ?? 28);
  const [retryOnFailure, setRetryOnFailure] = useState(automation?.retry_on_failure ?? true);

  // Parent "Weather-aware" toggle — derived from whichever sub-setting
  // is enabled. Toggling it OFF clears both sub-settings on save;
  // toggling ON re-reveals the sub-rows so the user can opt in.
  const [weatherAware, setWeatherAware] = useState(
    (automation?.skip_if_rained ?? false) || (automation?.trigger_if_hot ?? false),
  );

  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>(
    automation?.devices.map((d) => d.device_id) ?? [],
  );
  const [controllingIds, setControllingIds] = useState<string[]>(
    automation?.blueprints.filter((b) => b.role === "controlling").map((b) => b.blueprint_id) ?? [],
  );
  const [drivenIds, setDrivenIds] = useState<string[]>(
    automation?.blueprints.filter((b) => b.role === "driven").map((b) => b.blueprint_id) ?? [],
  );

  // Available options
  const [availableDevices, setAvailableDevices] = useState<AvailableDevice[]>([]);
  const [availableBlueprints, setAvailableBlueprints] = useState<AvailableBlueprint[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Blueprint filter state
  const [bpSearch, setBpSearch] = useState("");
  const [bpLocationId, setBpLocationId] = useState("");
  const [bpAreaId, setBpAreaId] = useState("");
  const [bpPlantId, setBpPlantId] = useState("");
  const [bpPlanId, setBpPlanId] = useState("");

  // Save state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────

  useEffect(() => {
    const fetchOptions = async () => {
      setLoadingOptions(true);

      // Valves for this home
      const { data: allDevices } = await supabase
        .from("devices")
        .select("id, name")
        .eq("home_id", homeId)
        .eq("device_type", "water_valve")
        .eq("is_active", true)
        .order("name");

      // Devices already in OTHER automations
      const { data: linked } = await supabase
        .from("automation_devices")
        .select("device_id, automation_id");

      const ownId = automation?.id ?? null;
      const alreadyLinked = new Set(
        (linked ?? []).filter((l) => l.automation_id !== ownId).map((l) => l.device_id),
      );

      setAvailableDevices(
        ((allDevices ?? []) as AvailableDevice[]).filter(
          (d) => !alreadyLinked.has(d.id) || automation?.devices.some((ad) => ad.device_id === d.id),
        ),
      );

      // Recurring blueprints with location / area / plan names
      const { data: bps } = await supabase
        .from("task_blueprints")
        .select(`
          id, title, location_id, area_id, plan_id,
          locations(id, name),
          areas(id, name),
          plans(id, name)
        `)
        .eq("home_id", homeId)
        .eq("is_recurring", true)
        .order("title");

      const rows = (bps ?? []) as any[];

      // Collect all inventory_item_ids across blueprints
      const allItemIds: string[] = rows.flatMap((r) => r.inventory_item_ids ?? []);

      // Fetch plant names for those items (one query, no array FK join needed)
      const itemPlantMap = new Map<string, { plantId: number; plantName: string }>();
      if (allItemIds.length > 0) {
        const { data: items } = await supabase
          .from("inventory_items")
          .select("id, plant_id, plants(id, name)")
          .in("id", allItemIds);

        for (const item of (items ?? []) as any[]) {
          if (item.plants) {
            itemPlantMap.set(item.id, { plantId: item.plant_id, plantName: item.plants.name });
          }
        }
      }

      // Build the resolved blueprint list — one plant per blueprint (first match wins)
      const resolved: AvailableBlueprint[] = rows.map((r) => {
        let plantId: number | null = null;
        let plantName: string | null = null;
        for (const itemId of (r.inventory_item_ids ?? [])) {
          const hit = itemPlantMap.get(itemId);
          if (hit) { plantId = hit.plantId; plantName = hit.plantName; break; }
        }
        return {
          id: r.id,
          title: r.title,
          locationId: r.location_id ?? null,
          locationName: (r.locations as any)?.name ?? null,
          areaId: r.area_id ?? null,
          areaName: (r.areas as any)?.name ?? null,
          planId: r.plan_id ?? null,
          planName: (r.plans as any)?.name ?? null,
          plantId,
          plantName,
        };
      });

      setAvailableBlueprints(resolved);
      setLoadingOptions(false);
    };

    fetchOptions();
  }, [homeId, automation]);

  // Keep controlling IDs always in driven too
  useEffect(() => {
    setDrivenIds((prev) => Array.from(new Set([...prev, ...controllingIds])));
  }, [controllingIds]);

  // ── Filter derived data ─────────────────────────────────────────────────────

  const distinctLocations = useMemo(() => {
    const seen = new Map<string, string>();
    for (const bp of availableBlueprints) {
      if (bp.locationId && bp.locationName && !seen.has(bp.locationId)) {
        seen.set(bp.locationId, bp.locationName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [availableBlueprints]);

  const distinctAreas = useMemo(() => {
    const seen = new Map<string, string>();
    for (const bp of availableBlueprints) {
      if (bp.areaId && bp.areaName && (!bpLocationId || bp.locationId === bpLocationId)) {
        if (!seen.has(bp.areaId)) seen.set(bp.areaId, bp.areaName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [availableBlueprints, bpLocationId]);

  const distinctPlants = useMemo(() => {
    const seen = new Map<number, string>();
    for (const bp of availableBlueprints) {
      if (
        bp.plantId && bp.plantName &&
        (!bpLocationId || bp.locationId === bpLocationId) &&
        (!bpAreaId || bp.areaId === bpAreaId)
      ) {
        if (!seen.has(bp.plantId)) seen.set(bp.plantId, bp.plantName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [availableBlueprints, bpLocationId, bpAreaId]);

  const distinctPlans = useMemo(() => {
    const seen = new Map<string, string>();
    for (const bp of availableBlueprints) {
      if (bp.planId && bp.planName && !seen.has(bp.planId)) {
        seen.set(bp.planId, bp.planName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [availableBlueprints]);

  const filteredBlueprints = useMemo(() => {
    const q = bpSearch.toLowerCase().trim();
    return availableBlueprints.filter((bp) => {
      if (q && !bp.title.toLowerCase().includes(q)) return false;
      if (bpLocationId && bp.locationId !== bpLocationId) return false;
      if (bpAreaId && bp.areaId !== bpAreaId) return false;
      if (bpPlantId && String(bp.plantId) !== bpPlantId) return false;
      if (bpPlanId && bp.planId !== bpPlanId) return false;
      return true;
    });
  }, [availableBlueprints, bpSearch, bpLocationId, bpAreaId, bpPlantId, bpPlanId]);

  const filtersActive = bpSearch || bpLocationId || bpAreaId || bpPlantId || bpPlanId;

  const clearFilters = () => {
    setBpSearch("");
    setBpLocationId("");
    setBpAreaId("");
    setBpPlantId("");
    setBpPlanId("");
  };

  // ── Actions ─────────────────────────────────────────────────────────────────

  const toggleDevice = (id: string) =>
    setSelectedDeviceIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleControlling = (id: string) =>
    setControllingIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const toggleDriven = (id: string) => {
    if (controllingIds.includes(id)) return;
    setDrivenIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const validate = (): string | null => {
    if (!name.trim()) return "Automation name is required.";
    if (selectedDeviceIds.length === 0) return "Select at least one valve.";
    if (controllingIds.length === 0) return "Select at least one controlling task.";
    return null;
  };

  const upsertBlueprints = async (automationId: string) => {
    const links: { automation_id: string; blueprint_id: string; role: string }[] = [];
    const seen = new Set<string>();
    for (const bpId of controllingIds) {
      links.push({ automation_id: automationId, blueprint_id: bpId, role: "controlling" });
      seen.add(bpId);
    }
    for (const bpId of drivenIds) {
      if (!seen.has(bpId)) links.push({ automation_id: automationId, blueprint_id: bpId, role: "driven" });
    }
    if (links.length > 0) await supabase.from("automation_blueprints").insert(links);
  };

  const save = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    setError(null);
    try {
      // Weather-aware parent toggle: when OFF, both sub-settings must be
      // cleared on save so they don't linger from a previous edit.
      const effectiveSkipIfRained = weatherAware && skipIfRained;
      const effectiveTriggerIfHot = weatherAware && triggerIfHot;

      const payload = {
        name: name.trim(),
        is_active: isActive,
        scheduled_time: scheduledTime + ":00",
        duration_seconds: durationSeconds,
        fire_valves_sequentially: fireSequentially,
        skip_if_rained: effectiveSkipIfRained,
        rain_threshold_mm: rainThreshold,
        trigger_if_hot: effectiveTriggerIfHot,
        heat_threshold_c: heatThreshold,
        retry_on_failure: retryOnFailure,
        updated_at: new Date().toISOString(),
      };

      if (isEdit && automation) {
        const { error: updateErr } = await supabase.from("automations").update(payload).eq("id", automation.id);
        if (updateErr) throw new Error(updateErr.message);
        await supabase.from("automation_devices").delete().eq("automation_id", automation.id);
        if (selectedDeviceIds.length > 0)
          await supabase.from("automation_devices").insert(selectedDeviceIds.map((device_id) => ({ automation_id: automation.id, device_id })));
        await supabase.from("automation_blueprints").delete().eq("automation_id", automation.id);
        await upsertBlueprints(automation.id);
      } else {
        const { data: newRow, error: insertErr } = await supabase
          .from("automations")
          .insert({ home_id: homeId, ...payload })
          .select("id")
          .single();
        if (insertErr || !newRow) throw new Error(insertErr?.message ?? "Failed to create automation");
        const newId = newRow.id as string;
        if (selectedDeviceIds.length > 0)
          await supabase.from("automation_devices").insert(selectedDeviceIds.map((device_id) => ({ automation_id: newId, device_id })));
        await upsertBlueprints(newId);
      }

      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  const durationMins = Math.round(durationSeconds / 60);

  // ── Render ──────────────────────────────────────────────────────────────────

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label="Automation"
        className="relative w-full sm:w-[calc(100vw-2rem)] sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[92vh] overflow-y-auto"
        data-testid="automation-modal"
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 flex items-center justify-between px-6 pt-6 pb-4 border-b border-rhozly-outline/10">
          <h2 className="font-black text-rhozly-on-surface text-lg">
            {isEdit ? "Edit Automation" : "New Automation"}
          </h2>
          <button onClick={onClose} data-testid="automation-modal-close" aria-label="Close" className="p-1.5 rounded-xl hover:bg-rhozly-surface transition-colors">
            <X size={20} className="text-rhozly-on-surface-variant" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {loadingOptions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin text-rhozly-on-surface-variant" />
            </div>
          ) : (
            <>
              {/* Name + active toggle */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">Automation name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Garden watering"
                    data-testid="automation-name-input"
                    className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm placeholder:text-rhozly-on-surface-variant/50"
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer" data-testid="automation-active-toggle">
                  <div
                    onClick={() => setIsActive((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors ${isActive ? "bg-rhozly-primary" : "bg-rhozly-outline/40"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isActive ? "left-5" : "left-0.5"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-rhozly-on-surface leading-tight">Active</p>
                    <p className="text-xs text-rhozly-on-surface-variant">Automation will run on schedule</p>
                  </div>
                </label>
              </div>

              {/* Schedule */}
              <div>
                <h3 className="text-sm font-bold text-rhozly-on-surface mb-3">Schedule</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-rhozly-on-surface-variant mb-1.5">Start time (UTC)</label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      data-testid="automation-time-input"
                      className="w-full px-3 py-2.5 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-rhozly-on-surface-variant mb-1.5">Run duration</label>
                    <div className="relative">
                      <input
                        type="number"
                        min={60}
                        max={7200}
                        step={60}
                        value={durationSeconds}
                        onChange={(e) => setDurationSeconds(Number(e.target.value))}
                        data-testid="automation-duration-input"
                        className="w-full px-3 py-2.5 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-rhozly-on-surface-variant pointer-events-none">
                        s ({durationMins} min)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Valves */}
              <div>
                <h3 className="text-sm font-bold text-rhozly-on-surface mb-1">Valves</h3>
                <p className="text-xs text-rhozly-on-surface-variant mb-3">
                  Select which valves this automation controls. Each valve can only belong to one automation.
                </p>
                {availableDevices.length === 0 ? (
                  <p className="text-xs text-rhozly-on-surface-variant italic py-2">
                    No available valves — all valves are already assigned to an automation.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableDevices.map((d) => (
                      <label
                        key={d.id}
                        className="flex items-center gap-3 p-3 rounded-2xl border border-rhozly-outline/20 cursor-pointer hover:bg-rhozly-surface transition-colors"
                        data-testid={`automation-device-${d.id}`}
                        onClick={() => toggleDevice(d.id)}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 ${
                          selectedDeviceIds.includes(d.id) ? "bg-rhozly-primary border-rhozly-primary" : "border-rhozly-outline/40 bg-white"
                        }`}>
                          {selectedDeviceIds.includes(d.id) && <Check size={12} className="text-white" />}
                        </div>
                        <div className="flex items-center gap-2 min-w-0">
                          <Droplets size={14} className="text-rhozly-primary shrink-0" />
                          <span className="text-sm text-rhozly-on-surface font-medium truncate">{d.name}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {selectedDeviceIds.length >= 2 && (
                  <label className="flex items-start gap-3 mt-3 cursor-pointer" data-testid="automation-sequential-toggle">
                    <input
                      type="checkbox"
                      checked={fireSequentially}
                      onChange={(e) => setFireSequentially(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-rhozly-primary"
                    />
                    <div>
                      <p className="text-sm font-semibold text-rhozly-on-surface">Fire valves sequentially</p>
                      <p className="text-xs text-rhozly-on-surface-variant mt-0.5">
                        Each valve runs one at a time. Recommended if your water pressure is limited.
                      </p>
                    </div>
                  </label>
                )}
              </div>

              {/* Linked tasks */}
              <div>
                <h3 className="text-sm font-bold text-rhozly-on-surface mb-1">Linked tasks</h3>
                <p className="text-xs text-rhozly-on-surface-variant mb-3">
                  <strong>Controlling</strong> tasks trigger the automation when due and are auto-completed.
                  {" "}<strong>Driven</strong> tasks are only auto-completed (no trigger).
                </p>

                {/* Filter bar */}
                {availableBlueprints.length > 5 && (
                  <div className="space-y-2 mb-3">
                    {/* Search */}
                    <div className="relative">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rhozly-on-surface-variant/50 pointer-events-none" />
                      <input
                        type="text"
                        value={bpSearch}
                        onChange={(e) => setBpSearch(e.target.value)}
                        placeholder="Search tasks…"
                        data-testid="automation-bp-search"
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm placeholder:text-rhozly-on-surface-variant/50"
                      />
                    </div>

                    {/* Cascade dropdowns */}
                    <div className="grid grid-cols-2 gap-2">
                      <FilterSelect
                        value={bpLocationId}
                        onChange={(v) => { setBpLocationId(v); setBpAreaId(""); setBpPlantId(""); }}
                        placeholder="All locations"
                        options={distinctLocations}
                        testId="automation-bp-location"
                      />
                      <FilterSelect
                        value={bpAreaId}
                        onChange={(v) => { setBpAreaId(v); setBpPlantId(""); }}
                        placeholder="All areas"
                        options={distinctAreas}
                        disabled={!bpLocationId}
                        testId="automation-bp-area"
                      />
                      <FilterSelect
                        value={bpPlantId}
                        onChange={setBpPlantId}
                        placeholder="All plants"
                        options={distinctPlants.map((p) => ({ id: String(p.id), name: p.name }))}
                        disabled={!bpAreaId}
                        testId="automation-bp-plant"
                      />
                      <FilterSelect
                        value={bpPlanId}
                        onChange={setBpPlanId}
                        placeholder="All plans"
                        options={distinctPlans}
                        testId="automation-bp-plan"
                      />
                    </div>

                    {filtersActive && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-rhozly-primary font-semibold hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                )}

                {/* Blueprint list */}
                {availableBlueprints.length === 0 ? (
                  <p className="text-xs text-rhozly-on-surface-variant italic py-2">
                    No recurring tasks found. Create recurring tasks in the Schedule tab first.
                  </p>
                ) : filteredBlueprints.length === 0 ? (
                  <div className="py-4 text-center">
                    <p className="text-xs text-rhozly-on-surface-variant mb-1">No tasks match your filters.</p>
                    <button onClick={clearFilters} className="text-xs text-rhozly-primary font-semibold hover:underline">
                      Clear filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredBlueprints.map((bp) => {
                      const isControlling = controllingIds.includes(bp.id);
                      const isDriven = drivenIds.includes(bp.id);
                      const breadcrumb = [bp.locationName, bp.areaName, bp.plantName].filter(Boolean).join(" › ");
                      return (
                        <div key={bp.id} className="p-3 rounded-2xl border border-rhozly-outline/20">
                          <p className="text-sm font-semibold text-rhozly-on-surface">{bp.title}</p>
                          {breadcrumb && (
                            <p className="text-xs text-rhozly-on-surface-variant mt-0.5 mb-2">{breadcrumb}</p>
                          )}
                          <div className="flex gap-4 mt-1">
                            <label className="flex items-center gap-2 cursor-pointer" data-testid={`automation-controlling-${bp.id}`}>
                              <input
                                type="checkbox"
                                checked={isControlling}
                                onChange={() => toggleControlling(bp.id)}
                                className="w-4 h-4 accent-rhozly-primary"
                              />
                              <span className="text-xs font-semibold text-rhozly-primary">Controlling</span>
                            </label>
                            <label
                              className={`flex items-center gap-2 ${isControlling ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                              data-testid={`automation-driven-${bp.id}`}
                            >
                              <input
                                type="checkbox"
                                checked={isDriven || isControlling}
                                onChange={() => toggleDriven(bp.id)}
                                disabled={isControlling}
                                className="w-4 h-4 accent-rhozly-primary"
                              />
                              <span className="text-xs font-semibold text-rhozly-on-surface-variant">Driven</span>
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-sm font-bold text-rhozly-on-surface mb-3">Settings</h3>
                <div className="space-y-4">
                  {/* Parent "Weather-aware" toggle wraps both rain-skip + heat-trigger. */}
                  <div className="rounded-2xl border border-rhozly-outline/20 overflow-hidden">
                    <label
                      className="flex items-center gap-3 p-3 cursor-pointer hover:bg-rhozly-surface/60 transition-colors"
                      data-testid="automation-weather-aware-toggle"
                    >
                      <div
                        onClick={(e) => { e.preventDefault(); setWeatherAware((v) => !v); }}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${weatherAware ? "bg-rhozly-primary" : "bg-rhozly-outline/40"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${weatherAware ? "left-5" : "left-0.5"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-rhozly-on-surface leading-tight">Weather-aware</p>
                        <p className="text-xs text-rhozly-on-surface-variant mt-0.5">
                          Let today's weather skip or trigger this automation.
                        </p>
                      </div>
                    </label>

                    {weatherAware && (
                      <div className="border-t border-rhozly-outline/15 px-3 py-3 space-y-4 bg-rhozly-surface/30">
                        {/* Skip if rained */}
                        <div>
                          <label className="flex items-start gap-3 cursor-pointer" data-testid="automation-skip-rain-toggle">
                            <input
                              type="checkbox"
                              checked={skipIfRained}
                              onChange={(e) => setSkipIfRained(e.target.checked)}
                              className="mt-0.5 w-4 h-4 accent-rhozly-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-rhozly-on-surface flex items-center gap-1.5">
                                <CloudRain size={13} className="text-rhozly-primary" />
                                Skip if it rained
                              </p>
                              <p className="text-xs text-rhozly-on-surface-variant mt-0.5">
                                Skip the run if today's rainfall exceeds the threshold.
                              </p>
                            </div>
                          </label>
                          {skipIfRained && (
                            <div className="mt-2 ml-7 flex items-center gap-3">
                              <input
                                type="number"
                                min={1}
                                max={50}
                                step={0.5}
                                value={rainThreshold}
                                onChange={(e) => setRainThreshold(Number(e.target.value))}
                                data-testid="automation-rain-threshold"
                                className="w-24 px-3 py-2 rounded-xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
                              />
                              <span className="text-xs text-rhozly-on-surface-variant">mm rainfall threshold</span>
                            </div>
                          )}
                        </div>

                        {/* Trigger if hot */}
                        <div>
                          <label className="flex items-start gap-3 cursor-pointer" data-testid="automation-trigger-hot-toggle">
                            <input
                              type="checkbox"
                              checked={triggerIfHot}
                              onChange={(e) => setTriggerIfHot(e.target.checked)}
                              className="mt-0.5 w-4 h-4 accent-rhozly-primary"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-rhozly-on-surface flex items-center gap-1.5">
                                <Thermometer size={13} className="text-rhozly-primary" />
                                Run automatically when it's hot
                              </p>
                              <p className="text-xs text-rhozly-on-surface-variant mt-0.5">
                                Fire at the scheduled time on hot days even if no task is due.
                                Rain still wins if both are true today.
                              </p>
                            </div>
                          </label>
                          {triggerIfHot && (
                            <div className="mt-2 ml-7 flex items-center gap-3">
                              <input
                                type="number"
                                min={20}
                                max={45}
                                step={1}
                                value={heatThreshold}
                                onChange={(e) => setHeatThreshold(Number(e.target.value))}
                                data-testid="automation-heat-threshold"
                                className="w-24 px-3 py-2 rounded-xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
                              />
                              <span className="text-xs text-rhozly-on-surface-variant">°C trigger threshold</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <label className="flex items-start gap-3 cursor-pointer" data-testid="automation-retry-toggle">
                    <input
                      type="checkbox"
                      checked={retryOnFailure}
                      onChange={(e) => setRetryOnFailure(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-rhozly-primary"
                    />
                    <div>
                      <p className="text-sm font-semibold text-rhozly-on-surface">Retry on failure</p>
                      <p className="text-xs text-rhozly-on-surface-variant mt-0.5">
                        Retry failed valve commands once before marking the run as failed.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 border border-red-100">
                  <AlertCircle size={15} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <button
                onClick={save}
                disabled={saving}
                data-testid="automation-save"
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-60 transition-colors"
              >
                {saving && <Loader2 size={16} className="animate-spin" />}
                {saving ? "Saving…" : isEdit ? "Save changes" : "Create automation"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── FilterSelect helper ───────────────────────────────────────────────────────

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
  disabled = false,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { id: string; name: string }[];
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || options.length === 0}
        data-testid={testId}
        className="w-full appearance-none pl-3 pr-7 py-2 rounded-xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-xs disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rhozly-on-surface-variant pointer-events-none" />
    </div>
  );
}
