import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

interface MaintenanceModeState {
  isOn: boolean;
  message: string | null;
}

export function useMaintenanceMode(): MaintenanceModeState {
  const [isOn, setIsOn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const wasOn = useRef(false);

  useEffect(() => {
    supabase
      .from("app_config")
      .select("value")
      .eq("key", "maintenance_mode")
      .maybeSingle()
      .then(({ data }) => {
        const enabled = data?.value?.enabled ?? false;
        setIsOn(enabled);
        setMessage(data?.value?.message ?? null);
        wasOn.current = enabled;
      });

    const channel = supabase
      .channel("app-config-maintenance")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_config", filter: "key=eq.maintenance_mode" },
        (payload) => {
          const val = (payload.new as any)?.value;
          const enabled = val?.enabled ?? false;

          // Maintenance just lifted — activate any waiting SW then reload.
          // State is intentionally NOT updated before this return: updating
          // setIsOn(false) would cause React to briefly render the normal app
          // (mounting UpdateBanner) between the Realtime event and the reload.
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
          setMessage(val?.message ?? null);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return { isOn, message };
}
