import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { Plus, RefreshCw, AlertCircle, Loader2, CheckCircle, XCircle, Cpu, Zap } from "lucide-react";
import { IconIntegrations } from "../../constants/icons";
import { usePermissions } from "../../context/HomePermissionsContext";
import DeviceCard from "./DeviceCard";
import SearchInput from "./SearchInput";
import { filterByText } from "../../lib/textFilter";
import ConnectDeviceWizard from "./ConnectDeviceWizard";
import DeviceDetailModal from "./DeviceDetailModal";
import AutomationsSection from "./AutomationsSection";
import type { WizardState } from "./ConnectDeviceWizard";

type TabId = "devices" | "automations";

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
  battery_percent: number | null;
  battery_reported_at: string | null;
}

export default function IntegrationsPage({ homeId }: Props) {
  const { can } = usePermissions();
  const canManageIntegrations = can('integrations.manage');
  const canControlIntegrations = can('integrations.control');

  const [activeTab, setActiveTab] = useState<TabId>("devices");
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceQuery, setDeviceQuery] = useState("");
  const [latestByDevice, setLatestByDevice] = useState<Map<string, { data: Record<string, unknown>; recorded_at: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizardInitialStep, setWizardInitialStep] = useState<number | undefined>(undefined);
  const [wizardInitialState, setWizardInitialState] = useState<Partial<WizardState> | undefined>(undefined);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [callbackTabState, setCallbackTabState] = useState<null | "loading" | "success" | "error">(null);
  const [callbackTabError, setCallbackTabError] = useState<string | null>(null);

  // Detect eWeLink OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ewelinkCode = params.get("code");
    if (!ewelinkCode) return;

    history.replaceState({}, "", window.location.pathname);

    const ewelinkState = params.get("state") ?? "";
    const ewelinkRegion = params.get("region") ?? "";
    const mode = localStorage.getItem("ewelink_oauth_mode");
    localStorage.removeItem("ewelink_oauth_mode");

    if (mode === "popup") {
      const storedState = localStorage.getItem("ewelink_oauth_state") ?? "";
      const storedHomeId = localStorage.getItem("ewelink_oauth_home_id") ?? "";
      localStorage.removeItem("ewelink_oauth_state");
      localStorage.removeItem("ewelink_oauth_home_id");

      if (storedState && ewelinkState && storedState !== ewelinkState) {
        localStorage.setItem("ewelink_oauth_result", JSON.stringify({ error: "OAuth state mismatch — please try again" }));
        return;
      }

      setCallbackTabState("loading");

      (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const res = await supabase.functions.invoke("integrations-ewelink-connect", {
            body: { action: "exchange_code", homeId: storedHomeId, code: ewelinkCode, region: ewelinkRegion },
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
          if (res.error) throw new Error(res.error.message);
          if (res.data?.error) throw new Error(res.data.error);
          const { integrationId, devices } = res.data as { integrationId: string; devices: unknown[] };
          localStorage.setItem("ewelink_oauth_result", JSON.stringify({ integrationId, devices }));
          setCallbackTabState("success");
          window.close();
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to connect";
          localStorage.setItem("ewelink_oauth_result", JSON.stringify({ error: msg }));
          setCallbackTabError(msg);
          setCallbackTabState("error");
          window.close();
        }
      })();
    } else {
      const expectedState = sessionStorage.getItem("ewelink_oauth_state");
      sessionStorage.removeItem("ewelink_oauth_state");

      if (expectedState && ewelinkState && expectedState !== ewelinkState) {
        setError("OAuth authorisation failed — please try again");
        return;
      }

      const deviceType = sessionStorage.getItem("ewelink_oauth_deviceType") as WizardState["deviceType"] | null;
      sessionStorage.removeItem("ewelink_oauth_deviceType");

      setWizardInitialStep(2);
      setWizardInitialState({
        brand: "ewelink",
        deviceType: deviceType ?? null,
        credentials: { __oauthCode: ewelinkCode, __oauthRegion: ewelinkRegion },
      });
      setShowWizard(true);
    }
  }, []);

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
      // Latest reading per device → live metric/state chips on the cards.
      supabase.rpc("latest_device_readings", { p_home_id: homeId }).then(({ data: rows }) => {
        const map = new Map<string, { data: Record<string, unknown>; recorded_at: string }>();
        for (const r of (rows ?? []) as Array<{ device_id: string; data: Record<string, unknown>; recorded_at: string }>) {
          map.set(r.device_id, { data: r.data, recorded_at: r.recorded_at });
        }
        setLatestByDevice(map);
      });
    }
    setLoading(false);
  }, [homeId]);

  // 2026-06-16 — "Refresh" now actually pulls fresh readings from
  // Ecowitt (via the poll edge function) before re-loading the device
  // list. Without this the button only re-fetched the cached `devices`
  // table and gave the misleading impression that nothing was updating
  // — webhooks only fire every ~16 min and may not even be configured
  // on the gateway.
  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const auth = { Authorization: `Bearer ${session?.access_token}` };

    const hasEcowitt = devices.some((d) => d.provider === "ecowitt");
    const ewelinkValves = devices.filter((d) => d.provider === "ewelink" && d.device_type === "water_valve");

    // Fire all provider syncs in parallel. Each is best-effort — a
    // single device's failure does NOT block the others or the final
    // device-list reload. Battery extraction happens inside each
    // provider sync; the final load() picks up the refreshed
    // devices.battery_percent column.
    const tasks: Promise<unknown>[] = [];
    if (hasEcowitt) {
      tasks.push(
        supabase.functions.invoke("integrations-ecowitt-poll", {
          body: { homeId },
          headers: auth,
        }).catch(() => null),
      );
    }
    for (const valve of ewelinkValves) {
      tasks.push(
        supabase.functions.invoke("integrations-ewelink-state", {
          body: { deviceId: valve.id },
          headers: auth,
        }).catch(() => null),
      );
    }
    if (tasks.length > 0) await Promise.all(tasks);

    await load();
  }, [devices, homeId, load]);

  useEffect(() => { load(); }, [load]);

  const closeWizard = () => {
    setShowWizard(false);
    setWizardInitialStep(undefined);
    setWizardInitialState(undefined);
  };

  const handleWizardComplete = () => {
    closeWizard();
    load();
  };

  // Ephemeral callback tab opened by window.open
  if (callbackTabState !== null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rhozly-bg p-6">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-8 text-center">
          {callbackTabState === "loading" && (
            <>
              <Loader2 size={36} className="animate-spin text-rhozly-primary mx-auto mb-4" />
              <p className="font-black text-rhozly-on-surface text-lg mb-1">Connecting…</p>
              <p className="text-sm text-rhozly-on-surface-variant">Completing eWeLink authorisation.</p>
            </>
          )}
          {callbackTabState === "success" && (
            <>
              <CheckCircle size={36} className="text-green-500 mx-auto mb-4" />
              <p className="font-black text-rhozly-on-surface text-lg mb-1">Connected!</p>
              <p className="text-sm text-rhozly-on-surface-variant">Switch back to the Rhozly app to continue.</p>
            </>
          )}
          {callbackTabState === "error" && (
            <>
              <XCircle size={36} className="text-red-500 mx-auto mb-4" />
              <p className="font-black text-rhozly-on-surface text-lg mb-1">Connection failed</p>
              <p className="text-sm text-rhozly-on-surface-variant mb-1">{callbackTabError}</p>
              <p className="text-sm text-rhozly-on-surface-variant">Switch back to the app and try again.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-4 md:px-8 pt-6 pb-0">
        <div className="flex items-center justify-between mb-5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-rhozly-primary/10 flex items-center justify-center shrink-0">
              <IconIntegrations className="text-rhozly-primary" size={20} />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-black font-display text-rhozly-on-surface leading-tight">Integrations</h1>
              <p className="text-xs sm:text-sm text-rhozly-on-surface-variant">Connected devices and automations</p>
            </div>
          </div>

          {/* Context-sensitive header actions */}
          {activeTab === "devices" && (
            <div className="flex gap-2 shrink-0">
              <button
                onClick={refresh}
                disabled={loading}
                data-testid="integrations-refresh"
                title="Sync now — fetch the latest readings from connected gateways"
                className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-rhozly-surface text-rhozly-on-surface-variant hover:bg-rhozly-surface-low disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={16} className={`sm:w-[18px] sm:h-[18px] ${loading ? "animate-spin" : ""}`} />
              </button>
              {canManageIntegrations && (
                <button
                  onClick={() => setShowWizard(true)}
                  data-testid="integrations-connect"
                  className="flex items-center gap-1.5 px-2.5 sm:px-4 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-rhozly-primary text-white font-semibold text-xs sm:text-sm hover:bg-rhozly-primary/90 transition-colors"
                >
                  <Plus size={16} className="sm:w-[18px] sm:h-[18px]" />
                  <span className="hidden sm:inline">Connect Device</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div role="tablist" aria-label="Integrations sections" className="flex gap-1 border-b border-rhozly-outline/10">
          {([
            { id: "devices" as TabId,     label: "Devices",     icon: <Cpu size={15} /> },
            { id: "automations" as TabId, label: "Automations", icon: <Zap size={15} /> },
          ]).map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                data-testid={`integrations-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-t-xl text-[13px] uppercase tracking-widest transition-all border-b-2 -mb-px ${
                  isActive
                    ? "font-bold text-rhozly-primary border-rhozly-primary bg-rhozly-primary/5"
                    : "font-normal text-rhozly-on-surface/40 border-transparent hover:text-rhozly-on-surface/70 hover:bg-rhozly-surface-low"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto px-4 md:px-8 py-6">
        {activeTab === "devices" && (
          <>
            {/* Schema-missing detector — if the devices we just fetched
                don't carry battery_percent at all, the migration didn't
                land on this Supabase project. Tells users instantly
                why the pip is dark vs leaving them guessing. */}
            {!loading && devices.length > 0 && !Object.prototype.hasOwnProperty.call(devices[0], "battery_percent") && (
              <div className="mb-4 flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900" data-testid="battery-schema-missing-banner">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">Battery columns missing on this database</p>
                  <p className="text-xs mt-0.5 text-amber-800">
                    The battery feature needs the latest migration to land on this Supabase project. Until then the
                    pip stays dark even when devices report battery. Contact support if you see this.
                  </p>
                </div>
              </div>
            )}
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
              <EmptyState onConnect={canManageIntegrations ? () => setShowWizard(true) : undefined} />
            ) : (
              <>
                {devices.length > 4 && (
                  <div className="mb-3">
                    <SearchInput value={deviceQuery} onChange={setDeviceQuery} placeholder="Search devices…" testId="device-search" />
                  </div>
                )}
                {(() => {
                  const filteredDevices = filterByText(devices, deviceQuery, (d) => [
                    d.name,
                    d.device_type === "soil_sensor" ? "soil sensor" : "water valve",
                    d.provider,
                  ]);
                  return filteredDevices.length === 0 ? (
                    <p className="text-sm text-rhozly-on-surface-variant py-6 text-center">No devices match “{deviceQuery}”.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredDevices.map((d) => (
                        <DeviceCard key={d.id} device={d} latest={latestByDevice.get(d.id)} onClick={() => setSelectedDevice(d)} />
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}

        {activeTab === "automations" && (
          <AutomationsSection
            homeId={homeId}
            canManage={can('automations.manage')}
            canRun={canManageIntegrations || canControlIntegrations}
          />
        )}
      </div>

      {/* Wizard */}
      {showWizard && (
        <ConnectDeviceWizard
          homeId={homeId}
          onComplete={handleWizardComplete}
          onClose={closeWizard}
          initialStep={wizardInitialStep}
          initialState={wizardInitialState}
        />
      )}

      {/* Detail modal */}
      {selectedDevice && (
        <DeviceDetailModal
          device={selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onRefresh={load}
          canManage={canManageIntegrations}
          canControl={canControlIntegrations || canManageIntegrations}
        />
      )}
    </div>
  );
}

function EmptyState({ onConnect }: { onConnect?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-6">
      <div className="w-16 h-16 rounded-3xl bg-rhozly-primary/10 flex items-center justify-center mb-4">
        <IconIntegrations className="text-rhozly-primary" size={28} />
      </div>
      <h2 className="text-xl font-bold text-rhozly-on-surface mb-2">No devices connected</h2>
      <p className="text-sm text-rhozly-on-surface-variant max-w-xs mb-6">
        Connect soil sensors or water valves to monitor your garden and automate watering.
      </p>
      {onConnect && (
        <button
          onClick={onConnect}
          data-testid="integrations-empty-connect"
          className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-rhozly-primary text-white font-semibold hover:bg-rhozly-primary/90 transition-colors"
        >
          <Plus size={18} />
          Connect your first device
        </button>
      )}
    </div>
  );
}
