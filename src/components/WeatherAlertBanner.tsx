import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Thermometer, Wind, X, Clock, CloudRain } from "lucide-react";
import toast from "react-hot-toast";

import { usePlantDoctor } from "../context/PlantDoctorContext";

interface WeatherAlert {
  id: string;
  type: "frost" | "wind" | "rain";
  severity: "info" | "warning" | "critical";
  message: string;
  starts_at: string;
}

interface Props {
  alerts: WeatherAlert[];
  isForecastScreen?: boolean;
}

// Safe wrapper so the banner renders even outside a PlantDoctorProvider
const usePlantDoctorSafe = () => {
  try {
    return usePlantDoctor();
  } catch {
    return null;
  }
};

export const WeatherAlertBanner = ({
  alerts,
  isForecastScreen = false,
}: Props) => {
  const plantDoctor = usePlantDoctorSafe();
  const setPageContext = plantDoctor?.setPageContext ?? (() => {});

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("dismissed-weather-alerts");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setDismissedIds(parsed);
      } catch {
        // Malformed data — start fresh
        localStorage.removeItem("dismissed-weather-alerts");
      }
    }
  }, []);

  const handleDismiss = useCallback(
    (id: string) => {
      const newDismissed = [...dismissedIds, id];
      setDismissedIds(newDismissed);
      localStorage.setItem(
        "dismissed-weather-alerts",
        JSON.stringify(newDismissed),
      );

      toast.success("Alert dismissed", {
        duration: 4000,
        ariaProps: { role: "status", "aria-live": "polite" },
      });
    },
    [dismissedIds],
  );

  const handleUndo = useCallback(
    (id: string) => {
      setDismissedIds((prev) => {
        const next = prev.filter((d) => d !== id);
        localStorage.setItem(
          "dismissed-weather-alerts",
          JSON.stringify(next),
        );
        return next;
      });
    },
    [],
  );

  const handleDismissWithUndo = useCallback(
    (id: string) => {
      const newDismissed = [...dismissedIds, id];
      setDismissedIds(newDismissed);
      localStorage.setItem(
        "dismissed-weather-alerts",
        JSON.stringify(newDismissed),
      );

      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm font-medium">
            Alert dismissed
            <button
              onClick={() => {
                handleUndo(id);
                toast.dismiss(t.id);
              }}
              className="font-bold text-rhozly-primary underline underline-offset-2"
            >
              Undo
            </button>
          </span>
        ),
        {
          duration: 4000,
          ariaProps: { role: "status", "aria-live": "polite" },
        },
      );
    },
    [dismissedIds, handleUndo],
  );

  const formatAlertTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const dayLabel = isToday ? "Today" : "Tomorrow";
    const timeLabel = date.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${dayLabel} at ${timeLabel}`;
  };

  const uniqueAlerts = useMemo(() => {
    return alerts.filter(
      (alert, index, self) =>
        index === self.findIndex((t) => t.type === alert.type),
    );
  }, [alerts]);

  const visibleAlerts = useMemo(() => {
    return isForecastScreen
      ? uniqueAlerts
      : uniqueAlerts.filter((a) => !dismissedIds.includes(a.id));
  }, [isForecastScreen, uniqueAlerts, dismissedIds]);

  useEffect(() => {
    if (visibleAlerts.length > 0) {
      setPageContext({
        action: "Viewing Weather Alerts",
        weatherThreats: visibleAlerts.map((a) => ({
          type: a.type,
          severity: a.severity,
          message: a.message,
          startTime: a.starts_at,
        })),
        isHighAlert: visibleAlerts.some((a) => a.severity === "critical"),
      });
    }

    if (visibleAlerts.length === 0) {
      // return () => setPageContext(null);
    }
  }, [visibleAlerts, setPageContext]);

  if (visibleAlerts.length === 0) return null;

  // Design-token style map — no raw palette colours
  // Container: rhozly-surface-low base + severity border tint
  // Icon bg: a slightly stronger tint using rhozly-surface
  const styleMap: Record<
    WeatherAlert["severity"],
    { container: string; iconBg: string }
  > = {
    critical: {
      container:
        "bg-rhozly-surface-low border-[#f5c2c2] text-rhozly-on-surface",
      iconBg: "bg-[#f5c2c2]",
    },
    warning: {
      container:
        "bg-rhozly-surface-low border-[#f5dfa8] text-rhozly-on-surface",
      iconBg: "bg-[#f5dfa8]",
    },
    info: {
      container:
        "bg-rhozly-surface-low border-rhozly-outline text-rhozly-on-surface",
      iconBg: "bg-rhozly-surface",
    },
  };

  return (
    <div className="space-y-3">
      {visibleAlerts.map((alert) => {
        const styles = styleMap[alert.severity] ?? styleMap.info;

        return (
          <div
            key={alert.id}
            className={`group relative overflow-hidden rounded-3xl border p-4 transition-all animate-in slide-in-from-top-4 duration-500 ${styles.container}`}
          >
            <div className="flex items-start gap-4">
              <div className={`mt-1 p-2 rounded-xl ${styles.iconBg}`}>
                {alert.type === "frost" ? (
                  <Thermometer className="w-5 h-5" />
                ) : alert.type === "wind" ? (
                  <Wind className="w-5 h-5" />
                ) : (
                  <CloudRain className="w-5 h-5" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                    {alert.type} Alert
                  </span>
                  <span className="w-1 h-1 rounded-full bg-current opacity-20" />
                  <div className="flex items-center gap-1 text-[10px] font-extrabold text-rhozly-primary">
                    <Clock className="w-3 h-3" />
                    {formatAlertTime(alert.starts_at)}
                  </div>
                </div>
                <p className="text-sm font-bold leading-tight">
                  {alert.message}
                </p>
              </div>

              {!isForecastScreen && (
                <button
                  onClick={() => handleDismissWithUndo(alert.id)}
                  aria-label="Dismiss alert"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-black/5 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 opacity-40" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
