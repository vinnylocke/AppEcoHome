import React, { useState } from "react";
import { supabase } from "../../lib/supabase";
import { X, Loader2, Trash2, AlertTriangle } from "lucide-react";
import type { Device } from "./IntegrationsPage";

interface Props {
  device: Device;
  onClose: () => void;
  onUpdated: () => void;
}

export default function DeviceSettingsModal({ device, onClose, onUpdated }: Props) {
  const [name, setName] = useState(device.name);
  const [duration, setDuration] = useState<number>(
    (device.metadata?.default_duration_seconds as number | undefined) ?? 1800
  );
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const updates: Record<string, unknown> = { name };
    if (device.device_type === "water_valve") {
      updates.metadata = { ...device.metadata, default_duration_seconds: duration };
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

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-6" data-testid="device-settings-modal">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-black text-rhozly-on-surface text-lg">Device Settings</h2>
          <button onClick={onClose} data-testid="settings-close">
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

          {/* Valve duration */}
          {device.device_type === "water_valve" && (
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
    </div>
  );
}
