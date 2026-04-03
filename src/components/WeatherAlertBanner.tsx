import React, { useState, useEffect } from "react";
import { Thermometer, Wind, X, Clock } from "lucide-react";

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

export const WeatherAlertBanner = ({
  alerts,
  isForecastScreen = false,
}: Props) => {
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("dismissed-weather-alerts");
    if (saved) setDismissedIds(JSON.parse(saved));
  }, []);

  const handleDismiss = (id: string) => {
    const newDismissed = [...dismissedIds, id];
    setDismissedIds(newDismissed);
    localStorage.setItem(
      "dismissed-weather-alerts",
      JSON.stringify(newDismissed),
    );
  };

  // --- 🕒 TIME FORMATTING HELPER ---
  const formatAlertTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();

    // Check if it's today or tomorrow
    const isToday = date.toDateString() === now.toDateString();
    const dayLabel = isToday ? "Today" : "Tomorrow";

    const timeLabel = date.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    return `${dayLabel} at ${timeLabel}`;
  };

  // --- 🧹 DEDUPLICATION ---
  // If 3 locations have a frost alert, we only want to show 1 banner
  const uniqueAlerts = alerts.filter(
    (alert, index, self) =>
      index === self.findIndex((t) => t.type === alert.type),
  );

  const visibleAlerts = isForecastScreen
    ? uniqueAlerts
    : uniqueAlerts.filter((a) => !dismissedIds.includes(a.id));

  if (visibleAlerts.length === 0) return null;

  return (
    <div className="space-y-3">
      {visibleAlerts.map((alert) => {
        const isCritical = alert.severity === "critical";

        return (
          <div
            key={alert.id}
            className={`group relative overflow-hidden rounded-3xl border p-4 transition-all animate-in slide-in-from-top-4 duration-500 ${
              isCritical
                ? "bg-red-50 border-red-200 text-red-900"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            <div className="flex items-start gap-4">
              <div
                className={`mt-1 p-2 rounded-xl ${isCritical ? "bg-red-200" : "bg-amber-200"}`}
              >
                {alert.type === "frost" ? (
                  <Thermometer className="w-5 h-5" />
                ) : (
                  <Wind className="w-5 h-5" />
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
                  onClick={() => handleDismiss(alert.id)}
                  className="p-1 hover:bg-black/5 rounded-lg transition-colors"
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
