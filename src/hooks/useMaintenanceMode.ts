import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

interface MaintenanceModeState {
  isOn: boolean;
  message: string | null;
}

export function useMaintenanceMode(): MaintenanceModeState {
  const [isOn, setIsOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const wasOn = useRef(false);
  // Set once a realtime event has landed — the slower initial fetch must
  // not clobber a fresher realtime value that raced past it.
  const realtimeWrote = useRef(false);

  const applyState = useCallback((enabled: boolean, msg: string | null) => {
    // Maintenance just lifted — activate any waiting SW then reload.
    // State is intentionally NOT updated before this return: updating
    // setIsOn(false) would cause React to briefly render the normal app
    // (mounting UpdateBanner) between the signal and the reload.
    if (wasOn.current && !enabled) {
      wasOn.current = false;
      if (navigator.serviceWorker) {
        navigator.serviceWorker.ready
          .then((reg) => {
            if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
          })
          .finally(() => window.location.reload());
      } else {
        window.location.reload();
      }
      return;
    }

    wasOn.current = enabled;
    setIsOn(enabled);
    setMessage(msg);
  }, []);

  const poll = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle();
    if (error) return; // transient — the next poll/realtime event recovers
    applyState(data?.value?.enabled ?? false, data?.value?.message ?? null);
  }, [applyState]);

  useEffect(() => {
    supabase
      .from("app_config")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || realtimeWrote.current) return;
        applyState(data?.value?.enabled ?? false, data?.value?.message ?? null);
      });

    const channel = supabase
      .channel("app-config-maintenance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_config", filter: "key=eq.maintenance_mode" },
        (payload) => {
          realtimeWrote.current = true;
          const val = (payload.new as any)?.value;
          applyState(val?.enabled ?? false, val?.message ?? null);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [applyState]);

  // Poll fallback while the maintenance screen is up. Deploys are exactly
  // when infrastructure flaps: if the realtime socket dropped (or never
  // joined), the single "maintenance off" UPDATE event is missed and the
  // user stares at the maintenance screen forever. While isOn, re-check
  // every 30s and on wake/reconnect; a fetched "off" behaves exactly like
  // the realtime event (SW activate + reload via applyState).
  useEffect(() => {
    if (!isOn) return;
    const interval = setInterval(() => { void poll(); }, 30_000);
    const onWake = () => { void poll(); };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("online", onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [isOn, poll]);

  return { isOn, message };
}
