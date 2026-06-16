import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { X, Loader2, Trash2, AlertTriangle } from "lucide-react";
import type { Device } from "./IntegrationsPage";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface Location { id: string; name: string; }
interface Area { id: string; name: string; location_id: string; }

interface Props {
  device: Device;
  onClose: () => void;
  onUpdated: () => void;
}

export default function DeviceSettingsModal({ device, onClose, onUpdated }: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>(true);
  const [name, setName] = useState(device.name);
  const [duration, setDuration] = useState<number>(
    (device.metadata?.default_duration_seconds as number | undefined) ?? 1800
  );
  const [isHomeShutoff, setIsHomeShutoff] = useState<boolean>(
    !!(device.metadata?.is_home_shutoff)
  );
  // 2026-06-16 — per-device temperature display unit. Storage is
  // always Celsius; this only affects the SoilReadingsPanel +
  // HistoryChart rendering. Default Celsius when absent.
  const [tempUnit, setTempUnit] = useState<"celsius" | "fahrenheit">(
    (device.metadata?.display_temp_unit as "celsius" | "fahrenheit" | undefined) ?? "celsius",
  );
  const [locationId, setLocationId] = useState<string>(device.location_id ?? "");
  const [areaId, setAreaId] = useState<string>(device.area_id ?? "");
  const [locations, setLocations] = useState<Location[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch locations for the home
  useEffect(() => {
    supabase
      .from("locations")
      .select("id, name")
      .eq("home_id", device.home_id)
      .order("name")
      .then(({ data }) => setLocations((data ?? []) as Location[]));
  }, [device.home_id]);

  // Fetch areas whenever selected location changes
  useEffect(() => {
    if (!locationId) { setAreas([]); setAreaId(""); return; }
    supabase
      .from("areas")
      .select("id, name, location_id")
      .eq("location_id", locationId)
      .order("name")
      .then(({ data }) => {
        const fetched = (data ?? []) as Area[];
        setAreas(fetched);
        // Clear area if it doesn't belong to the new location
        if (areaId && !fetched.find((a) => a.id === areaId)) setAreaId("");
      });
  }, [locationId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    setError(null);
    const updates: Record<string, unknown> = {
      name,
      location_id: locationId || null,
      area_id: areaId || null,
    };
    if (device.device_type === "water_valve") {
      updates.metadata = {
        ...device.metadata,
        default_duration_seconds: duration,
        is_home_shutoff: isHomeShutoff,
      };
    }
    if (device.device_type === "soil_sensor") {
      updates.metadata = {
        ...device.metadata,
        display_temp_unit: tempUnit,
      };
    }
    const { error: err } = await supabase.from("devices").update(updates).eq("id", device.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onUpdated();
  };

  const remove = async () => {
    setRemoving(true);
    const { error: err } = await supabase.from("devices").update({ is_active: false }).eq("id", device.id);
    setRemoving(false);
    if (err) { setError(err.message); return; }
    onUpdated();
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div ref={trapRef} role="dialog" aria-modal="true" aria-label="Device settings" className="relative w-[calc(100vw-2rem)] max-w-md bg-white rounded-3xl shadow-xl p-6 max-h-[90vh] overflow-y-auto" data-testid="device-settings-modal">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-rhozly-on-surface text-lg">Device Settings</h2>
          <button onClick={onClose} data-testid="settings-close" aria-label="Close">
            <X size={20} className="text-rhozly-on-surface-variant" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">Device Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="settings-name"
              className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
            />
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">Location</label>
            <select
              value={locationId}
              onChange={(e) => { setLocationId(e.target.value); setAreaId(""); }}
              data-testid="settings-location"
              className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
            >
              <option value="">— No location —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          {/* Area — only shown when a location is selected */}
          {locationId && (
            <div>
              <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">Area</label>
              <select
                value={areaId}
                onChange={(e) => setAreaId(e.target.value)}
                data-testid="settings-area"
                className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
              >
                <option value="">— No area —</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Soil sensor options */}
          {device.device_type === "soil_sensor" && (
            <div>
              <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">
                Temperature unit
              </label>
              <div className="flex gap-2" role="radiogroup" aria-label="Temperature display unit">
                <button
                  type="button"
                  data-testid="settings-temp-unit-celsius"
                  role="radio"
                  aria-checked={tempUnit === "celsius"}
                  onClick={() => setTempUnit("celsius")}
                  className={`flex-1 py-2.5 rounded-2xl border-2 text-sm font-bold transition-all ${
                    tempUnit === "celsius"
                      ? "border-rhozly-primary bg-rhozly-primary/5 text-rhozly-primary"
                      : "border-rhozly-outline/20 text-rhozly-on-surface-variant hover:border-rhozly-primary/30"
                  }`}
                >
                  Celsius (°C)
                </button>
                <button
                  type="button"
                  data-testid="settings-temp-unit-fahrenheit"
                  role="radio"
                  aria-checked={tempUnit === "fahrenheit"}
                  onClick={() => setTempUnit("fahrenheit")}
                  className={`flex-1 py-2.5 rounded-2xl border-2 text-sm font-bold transition-all ${
                    tempUnit === "fahrenheit"
                      ? "border-rhozly-primary bg-rhozly-primary/5 text-rhozly-primary"
                      : "border-rhozly-outline/20 text-rhozly-on-surface-variant hover:border-rhozly-primary/30"
                  }`}
                >
                  Fahrenheit (°F)
                </button>
              </div>
              <p className="text-xs text-rhozly-on-surface-variant mt-1">
                Affects display only. Readings are stored in Celsius — switching the unit
                later doesn't change historical data.
              </p>
            </div>
          )}

          {/* Valve options */}
          {device.device_type === "water_valve" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-rhozly-on-surface mb-1.5">
                  Default run duration
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min={60}
                    max={7200}
                    step={60}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    data-testid="settings-duration"
                    className="w-28 px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
                  />
                  <span className="text-sm text-rhozly-on-surface-variant">
                    seconds ({Math.round(duration / 60)} min)
                  </span>
                </div>
                <p className="text-xs text-rhozly-on-surface-variant mt-1">
                  The valve will auto-off after this duration as a safety failsafe.
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer" data-testid="settings-home-shutoff">
                <input
                  type="checkbox"
                  checked={isHomeShutoff}
                  onChange={(e) => setIsHomeShutoff(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-rhozly-primary"
                />
                <div>
                  <p className="text-sm font-semibold text-rhozly-on-surface">Whole home water shutoff</p>
                  <p className="text-xs text-rhozly-on-surface-variant mt-0.5">
                    Mark this valve as the main water supply for the entire home.
                  </p>
                </div>
              </label>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>
          )}

          <button
            onClick={save}
            disabled={saving}
            data-testid="settings-save"
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : null}
            {saving ? "Saving…" : "Save changes"}
          </button>

          {/* Remove device */}
          <div className="pt-4 border-t border-rhozly-outline/10">
            {!confirmRemove ? (
              <button
                onClick={() => setConfirmRemove(true)}
                data-testid="settings-remove-btn"
                className="flex items-center gap-2 text-sm text-red-500 font-semibold hover:text-red-700 transition-colors"
              >
                <Trash2 size={16} />
                Remove device
              </button>
            ) : (
              <div className="rounded-2xl bg-red-50 p-4">
                <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-3">
                  <AlertTriangle size={16} />
                  Remove this device?
                </div>
                <p className="text-xs text-red-600 mb-4">
                  The device will be hidden from Rhozly. Historical readings are kept.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="flex-1 py-2.5 rounded-xl border border-red-200 text-sm font-semibold text-red-500"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={remove}
                    disabled={removing}
                    data-testid="settings-remove-confirm"
                    className="flex-1 flex items-center justify-center gap-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold disabled:opacity-60"
                  >
                    {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    {removing ? "Removing…" : "Remove"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
