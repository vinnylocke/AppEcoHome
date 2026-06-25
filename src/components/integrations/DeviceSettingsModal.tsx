import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { X, Loader2, Trash2, AlertTriangle, Battery, BatteryWarning, Search } from "lucide-react";
import type { Device } from "./IntegrationsPage";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import WebhookDetailsPanel from "./WebhookDetailsPanel";
import InspectDeviceModal from "./InspectDeviceModal";

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
  const [showInspect, setShowInspect] = useState(false);
  const inspectSupported = device.provider === "ecowitt" || device.provider === "ewelink";

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
      // `default_duration_seconds` is preserved via the metadata spread — it's
      // now a silent safety failsafe; the duration is set per-automation, so the
      // editable field was removed (it was redundant + confusing).
      updates.metadata = {
        ...device.metadata,
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

          {/* Valve options — the per-valve run time is set on each automation,
              so there's no editable device default here (it was redundant). */}
          {device.device_type === "water_valve" && (
            <>
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

          {/* Battery diagnostic — proves the wiring is alive */}
          <BatteryDiagnostic device={device} />

          {/* Diagnostic: inspect raw provider response */}
          {inspectSupported && (
            <button
              type="button"
              onClick={() => setShowInspect(true)}
              data-testid="open-inspect-device"
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl border border-rhozly-outline/20 bg-rhozly-surface-low/50 text-sm font-semibold text-rhozly-on-surface-variant hover:bg-rhozly-surface hover:text-rhozly-on-surface transition-colors"
            >
              <Search size={14} />
              Inspect raw provider response
            </button>
          )}

          {/* Webhook details — only for custom_http integrations */}
          {device.provider === "custom_http" && (
            <WebhookDetailsPanel
              integrationId={device.integration_id}
              deviceExternalId={device.external_device_id}
              family={device.device_type}
            />
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
      {showInspect && (
        <InspectDeviceModal
          deviceId={device.id}
          deviceName={device.name}
          onClose={() => setShowInspect(false)}
        />
      )}
    </div>,
    document.body,
  );
}

/**
 * Small diagnostic row — confirms the battery wiring is alive even
 * when the device has never reported one. Lets users tell the
 * difference between "wired but waiting for the next sync" and "this
 * device doesn't report battery" without having to wonder why the
 * pip is missing on the card.
 */
function BatteryDiagnostic({ device }: { device: Device }) {
  if (device.battery_percent !== null && device.battery_reported_at) {
    const ago = timeAgo(device.battery_reported_at);
    const tone = device.battery_percent < 20
      ? "bg-red-50 border-red-200 text-red-800"
      : device.battery_percent < 50
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-green-50 border-green-200 text-green-800";
    return (
      <div className={`rounded-2xl border px-4 py-3 text-sm flex items-center gap-2 ${tone}`} data-testid="battery-diagnostic">
        <Battery size={16} />
        <span className="font-semibold">Battery: {device.battery_percent}%</span>
        <span className="text-xs opacity-80">reported {ago}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-rhozly-outline/20 bg-rhozly-surface-low/40 px-4 py-3 text-sm" data-testid="battery-diagnostic">
      <div className="flex items-center gap-2 font-semibold text-rhozly-on-surface">
        <BatteryWarning size={16} className="text-rhozly-on-surface-variant" />
        Battery: no reading received yet
      </div>
      <p className="text-xs text-rhozly-on-surface-variant mt-1">
        {device.provider === "ecowitt" &&
          "Hit Refresh on the Integrations page to pull a fresh reading from the gateway. If your sensor doesn't expose a soilbattN field this line won't update."}
        {device.provider === "ewelink" &&
          "Open this device once or wait for the next state poll. If your valve is mains-powered it won't report a battery."}
        {device.provider === "custom_http" &&
          "Include battery_percent: 0–100 in your next webhook payload (or use the Test Webhook simulator above)."}
        {device.provider !== "ecowitt" && device.provider !== "ewelink" && device.provider !== "custom_http" &&
          "Battery readings appear here once your device reports them via a sync."}
      </p>
    </div>
  );
}

function timeAgo(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}
