import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { Plug, Plus, RefreshCw, AlertCircle } from "lucide-react";
import DeviceCard from "./DeviceCard";
import ConnectDeviceWizard from "./ConnectDeviceWizard";
import DeviceDetailModal from "./DeviceDetailModal";

interface Props {
  homeId: string;
}

export interface Device {
  id: string;
  integration_id: string;
  home_id: string;
  location_id: string | null;
  area_id: string | null;
  external_device_id: string;
  name: string;
  device_type: "soil_sensor" | "water_valve";
  provider: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  last_seen_at: string | null;
}

export default function IntegrationsPage({ homeId }: Props) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("devices")
      .select("*")
      .eq("home_id", homeId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setDevices((data ?? []) as Device[]);
    }
    setLoading(false);
  }, [homeId]);

  useEffect(() => { load(); }, [load]);

  const handleWizardComplete = () => {
    setShowWizard(false);
    load();
  };

  return (
    <div className="px-4 sm:px-6 py-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center">
            <Plug className="text-rhozly-primary" size={20} />
          </div>
          <div>
            <h1 className="text-2xl font-black font-display text-rhozly-on-surface">Integrations</h1>
            <p className="text-sm text-rhozly-on-surface-variant">Connected devices and sensors</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            data-testid="integrations-refresh"
            className="p-2.5 rounded-2xl bg-rhozly-surface text-rhozly-on-surface-variant hover:bg-rhozly-surface-low transition-colors"
          >
            <RefreshCw size={18} />
          </button>
          <button
            onClick={() => setShowWizard(true)}
            data-testid="integrations-connect"
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-rhozly-primary text-white font-semibold text-sm hover:bg-rhozly-primary/90 transition-colors"
          >
            <Plus size={18} />
            Connect Device
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="rounded-3xl bg-rhozly-surface-lowest border border-rhozly-outline/20 p-5 animate-pulse h-40" />
          ))}
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-100 text-red-700">
          <AlertCircle size={18} />
          <span className="text-sm">{error}</span>
        </div>
      ) : devices.length === 0 ? (
        <EmptyState onConnect={() => setShowWizard(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((d) => (
            <DeviceCard key={d.id} device={d} onClick={() => setSelectedDevice(d)} />
          ))}
        </div>
      )}

      {/* Wizard */}
      {showWizard && (
        <ConnectDeviceWizard
          homeId={homeId}
          onComplete={handleWizardComplete}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* Detail modal */}
      {selectedDevice && (
        <DeviceDetailModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="w-16 h-16 rounded-3xl bg-rhozly-primary/10 flex items-center justify-center mb-4">
        <Plug className="text-rhozly-primary" size={28} />
      </div>
      <h2 className="text-xl font-bold text-rhozly-on-surface mb-2">No devices connected</h2>
      <p className="text-sm text-rhozly-on-surface-variant max-w-xs mb-6">
        Connect soil sensors or water valves to monitor your garden and automate watering.
      </p>
      <button
        onClick={onConnect}
        data-testid="integrations-empty-connect"
        className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-rhozly-primary text-white font-semibold hover:bg-rhozly-primary/90 transition-colors"
      >
        <Plus size={18} />
        Connect your first device
      </button>
    </div>
  );
}
