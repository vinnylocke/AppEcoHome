import React, { useState } from "react";
import { supabase } from "../../../lib/supabase";
import { Loader2, CheckCircle } from "lucide-react";
import type { WizardState, DiscoveredDevice } from "../ConnectDeviceWizard";

interface Props {
  homeId: string;
  state: WizardState;
  onComplete: () => void;
}

export default function Step5Confirm({ homeId, state, onComplete }: Props) {
  const selectedDevices = state.discoveredDevices.filter((d) =>
    state.selectedDeviceIds.includes(d.externalDeviceId)
  );

  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(selectedDevices.map((d) => [d.externalDeviceId, d.name]))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const setName = (id: string, v: string) => setNames((n) => ({ ...n, [id]: v }));

  const save = async () => {
    setError(null);
    setLoading(true);
    try {
      for (const device of selectedDevices) {
        const meta = buildMeta(device, state);
        const { error: insertErr } = await supabase.from("devices").upsert(
          {
            integration_id: state.integrationId,
            home_id: homeId,
            external_device_id: device.externalDeviceId,
            name: names[device.externalDeviceId] ?? device.name,
            device_type: state.deviceType,
            provider: state.brand,
            metadata: meta,
            is_active: true,
          },
          { onConflict: "integration_id,external_device_id" },
        );
        if (insertErr) throw new Error(insertErr.message);
      }

      // 2026-06-16 — fire an immediate poll so the user sees the first
      // reading without waiting for the gateway's next webhook (the
      // Ecowitt gateway only pushes every ~16 min by default, and the
      // webhook may not even be wired up if the user has to configure
      // it manually in WSView Plus). Fire-and-forget — failure here
      // doesn't block the "All set!" confirmation; the user can hit
      // Refresh on the Integrations page if needed.
      if (state.brand === "ecowitt") {
        const { data: { session } } = await supabase.auth.getSession();
        void supabase.functions
          .invoke("integrations-ecowitt-poll", {
            body: { homeId },
            headers: { Authorization: `Bearer ${session?.access_token}` },
          })
          .catch(() => { /* ignore — refresh button will retry */ });
      }

      setDone(true);
      setTimeout(onComplete, 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle className="text-green-600" size={32} />
        </div>
        <h2 className="text-xl font-black text-rhozly-on-surface mb-2">All set!</h2>
        <p className="text-sm text-rhozly-on-surface-variant">Your devices are connected and ready.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-black text-rhozly-on-surface mb-1">Name your devices</h2>
      <p className="text-sm text-rhozly-on-surface-variant mb-6">
        Give each device a memorable name. You can change these later.
      </p>

      {selectedDevices.length === 0 ? (
        <p className="text-sm text-rhozly-on-surface-variant text-center py-6">No devices selected.</p>
      ) : (
        <div className="space-y-4 mb-6">
          {selectedDevices.map((d) => (
            <div key={d.externalDeviceId}>
              <label className="block text-xs text-rhozly-on-surface-variant mb-1.5">
                {d.model}{d.channel ? ` · Channel ${d.channel}` : ""}
              </label>
              <input
                type="text"
                value={names[d.externalDeviceId] ?? d.name}
                onChange={(e) => setName(d.externalDeviceId, e.target.value)}
                data-testid={`device-name-${d.externalDeviceId}`}
                placeholder={d.name}
                className="w-full px-4 py-3 rounded-2xl border border-rhozly-outline/30 bg-white text-rhozly-on-surface focus:outline-none focus:border-rhozly-primary text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-3">{error}</p>
      )}

      <button
        onClick={save}
        disabled={loading || selectedDevices.length === 0}
        data-testid="confirm-save"
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-rhozly-primary text-white font-bold hover:bg-rhozly-primary/90 disabled:opacity-60 transition-colors"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : null}
        {loading ? "Saving…" : "Save devices"}
      </button>
    </div>
  );
}

function buildMeta(device: DiscoveredDevice, state: WizardState): Record<string, unknown> {
  if (state.brand === "ecowitt") {
    return {
      model: device.model,
      channel: device.channel ?? 1,
      gateway_mac: state.credentials.gatewayMac ?? "",
    };
  }
  if (device.isSubDevice) {
    return {
      model: device.model,
      use_sub_device: true,
      parent_device_id: device.parentDeviceId,
      sub_device_id: device.subDeviceId,
      default_duration_seconds: 1800,
    };
  }
  return {
    model: device.model,
    use_sub_device: false,
    direct_device_id: device.externalDeviceId,
    default_duration_seconds: 1800,
  };
}
