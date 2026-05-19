import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../lib/supabase";
import { X, Settings, Loader2 } from "lucide-react";
import SoilReadingsPanel from "./SoilReadingsPanel";
import HistoryChart from "./HistoryChart";
import ValveControlPanel from "./ValveControlPanel";
import DeviceSettingsModal from "./DeviceSettingsModal";
import type { Device } from "./IntegrationsPage";
import type { SoilReading } from "./SoilReadingsPanel";

interface Props {
  device: Device;
  onClose: () => void;
  onRefresh: () => void;
  canManage: boolean;
  canControl: boolean;
}

export default function DeviceDetailModal({ device, onClose, onRefresh, canManage, canControl }: Props) {
  const [current, setCurrent] = useState<SoilReading | null>(null);
  const [previous, setPrevious] = useState<SoilReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (device.device_type !== "soil_sensor") { setLoading(false); return; }

    supabase
      .from("device_readings")
      .select("data, recorded_at")
      .eq("device_id", device.id)
      .order("recorded_at", { ascending: false })
      .limit(2)
      .then(({ data }) => {
        if (data?.[0]) setCurrent(data[0].data as SoilReading);
        if (data?.[1]) setPrevious(data[1].data as SoilReading);
        setLoading(false);
      });
  }, [device.id, device.device_type]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div
          className="relative w-[calc(100vw-2rem)] max-w-lg bg-white rounded-3xl shadow-xl max-h-[90vh] overflow-y-auto"
          data-testid="device-detail-modal"
        >
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-rhozly-outline/10 px-6 py-4 flex items-center gap-3 rounded-t-3xl">
            <div className="flex-1 min-w-0">
              <h2 className="font-black text-rhozly-on-surface text-lg truncate">{device.name}</h2>
              <p className="text-xs text-rhozly-on-surface-variant capitalize">
                {device.provider} · {device.device_type === "soil_sensor" ? "Soil Sensor" : "Water Valve"}
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowSettings(true)}
                data-testid="device-settings-btn"
                className="p-2 rounded-xl bg-rhozly-surface text-rhozly-on-surface-variant hover:text-rhozly-on-surface transition-colors"
              >
                <Settings size={18} />
              </button>
            )}
            <button
              onClick={onClose}
              data-testid="device-detail-close"
              aria-label="Close"
              className="p-2 text-rhozly-on-surface-variant hover:text-rhozly-on-surface"
            >
              <X size={20} />
            </button>
          </div>

          <div className="px-6 py-5 space-y-6">
            {/* Soil sensor readings */}
            {device.device_type === "soil_sensor" && (
              <section>
                <h3 className="text-sm font-bold text-rhozly-on-surface mb-3">Current Readings</h3>
                {loading ? (
                  <div className="flex items-center justify-center h-28">
                    <Loader2 className="animate-spin text-rhozly-primary" size={22} />
                  </div>
                ) : (
                  <SoilReadingsPanel current={current} previous={previous} />
                )}
              </section>
            )}

            {/* Valve controls */}
            {device.device_type === "water_valve" && canControl && (
              <section>
                <ValveControlPanel
                  deviceId={device.id}
                  homeId={device.home_id}
                  defaultDurationSeconds={(device.metadata?.default_duration_seconds as number | undefined) ?? 1800}
                />
              </section>
            )}

            {/* History chart */}
            <section>
              <h3 className="text-sm font-bold text-rhozly-on-surface mb-3">History</h3>
              <HistoryChart deviceId={device.id} deviceType={device.device_type} />
            </section>

            {/* Last seen */}
            {device.last_seen_at && (
              <p className="text-xs text-rhozly-on-surface-variant text-center">
                Last reading: {new Date(device.last_seen_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {showSettings && (
        <DeviceSettingsModal
          device={device}
          onClose={() => setShowSettings(false)}
          onUpdated={() => { setShowSettings(false); onRefresh(); onClose(); }}
        />
      )}
    </>,
    document.body,
  );
}
