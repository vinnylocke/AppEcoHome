import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ThermometerSun, Snowflake, Wind, X, Clock, CloudRain, ChevronDown, TriangleAlert } from "lucide-react";
import toast from "react-hot-toast";

import { useNavigate } from "react-router-dom";
import { usePlantDoctor } from "../context/PlantDoctorContext";
import { formatDateRange } from "../lib/weatherDates";
import {
  isDismissedToday, dismiss as dismissType, undismiss,
  loadDismissed, saveDismissed, todayLocal, type DismissalMap,
} from "../lib/weatherAlertDismissal";

interface WeatherAlert {
  id: string;
  type: "frost" | "wind" | "rain" | "heat";
  severity: "info" | "warning" | "critical";
  message: string;
  starts_at: string;
  dates?: string[];
  ends_at?: string;
}

interface Props {
  alerts: WeatherAlert[];
  isForecastScreen?: boolean;
  /** Slim one-line bar (for the app-wide banner) instead of the full cards. */
  compact?: boolean;
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
  compact = false,
}: Props) => {
  const plantDoctor = usePlantDoctorSafe();
  const setPageContext = plantDoctor?.setPageContext ?? (() => {});

  const navigate = useNavigate();
  // Recomputed each render so it stays fresh if the app is left open past midnight.
  const today = todayLocal();
  const [dismissed, setDismissed] = useState<DismissalMap>({});
  // Stage 5: the compact bar's N≥2 collapse state (collapsed by default;
  // expands in place — not persisted, a fresh screen starts calm again).
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { setDismissed(loadDismissed()); }, []);

  const handleUndo = useCallback((type: string) => {
    setDismissed((prev) => {
      const next = undismiss(prev, type);
      saveDismissed(next);
      return next;
    });
  }, []);

  // Dismiss an alert TYPE for the rest of today; it reappears tomorrow if still valid.
  const handleDismiss = useCallback((type: string) => {
    setDismissed((prev) => {
      const next = dismissType(prev, type, todayLocal());
      saveDismissed(next);
      return next;
    });
    toast(
      (t) => (
        <span className="flex items-center gap-3 text-sm font-medium">
          Hidden until tomorrow
          <button
            onClick={() => { handleUndo(type); toast.dismiss(t.id); }}
            className="font-bold text-rhozly-primary underline underline-offset-2"
          >
            Undo
          </button>
        </span>
      ),
      { duration: 4000, ariaProps: { role: "status", "aria-live": "polite" } },
    );
  }, [handleUndo]);

  // When-label: a grouped day range for multi-day alerts ("Mon–Wed"), or a single
  // day for one-offs. Frost carries a real hour (from the hourly scan), so we append
  // the time for an imminent single-night frost; heat/wind use a noon placeholder, so
  // no time is shown for those.
  const formatWhen = (alert: WeatherAlert) => {
    const dates = alert.dates && alert.dates.length ? alert.dates : [alert.starts_at.split("T")[0]];
    if (dates.length > 1) return formatDateRange(dates);
    const day = formatDateRange(dates);
    if (alert.type === "frost") {
      const t = new Date(alert.starts_at).toLocaleTimeString("en-GB", {
        hour: "numeric", minute: "2-digit", hour12: true,
      });
      return `${day} at ${t}`;
    }
    return day;
  };

  const uniqueAlerts = useMemo(() => {
    return alerts.filter(
      (alert, index, self) =>
        index === self.findIndex((t) => t.type === alert.type),
    );
  }, [alerts]);

  const visibleAlerts = useMemo(() => {
    // "info" alerts (e.g. rain auto-complete) live in the Garden Intelligence
    // panel — never show them in the banner regardless of screen.
    const actionable = uniqueAlerts.filter((a) => a.severity !== "info");
    // The Weather section (isForecastScreen) always shows alerts; everywhere else
    // an alert TYPE stays hidden only for the day it was dismissed.
    return isForecastScreen
      ? actionable
      : actionable.filter((a) => !isDismissedToday(dismissed, a.type, today));
  }, [isForecastScreen, uniqueAlerts, dismissed, today]);

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

  const alertIcon = (type: WeatherAlert["type"], size: string) =>
    type === "frost" ? <Snowflake className={size} />
      : type === "heat" ? <ThermometerSun className={size} />
      : type === "wind" ? <Wind className={size} />
      : <CloudRain className={size} />;

  // ── Compact app-wide bar ──
  // Stage 5 of the garden-hub search-first overhaul (2026-07-21): with 2+
  // active alerts the old bar stacked ~150px of pills on EVERY padded screen.
  // Now N≥2 collapses into ONE 44px strip ("⚠ 3 weather alerts · FROST
  // Tomorrow…") that expands IN PLACE to the per-type rows (per-type
  // dismissal logic untouched). A single alert renders as today's single row.
  if (compact && visibleAlerts.length >= 2 && !expanded) {
    // Headline = the worst alert (critical beats warning; ties → first).
    const headline =
      visibleAlerts.find((a) => a.severity === "critical") ?? visibleAlerts[0];
    const styles = styleMap[headline.severity] ?? styleMap.info;
    return (
      <div data-testid="weather-alert-bar">
        <button
          type="button"
          data-testid="weather-alert-strip"
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className={`w-full flex items-center gap-2 rounded-2xl border px-3 min-h-[44px] text-left animate-in fade-in duration-300 ${styles.container}`}
        >
          <span className={`shrink-0 p-1 rounded-lg ${styles.iconBg}`}>
            <TriangleAlert className="w-3.5 h-3.5" />
          </span>
          <span className="flex-1 min-w-0 flex items-baseline gap-1.5">
            <span className="text-[12px] font-black shrink-0">
              {visibleAlerts.length} weather alerts
            </span>
            <span className="text-[12px] font-extrabold text-rhozly-primary uppercase tracking-wide shrink-0">
              {headline.type} {formatWhen(headline)}
            </span>
            <span className="hidden sm:block text-[12px] font-medium opacity-70 truncate">
              {headline.message}
            </span>
          </span>
          <ChevronDown className="w-4 h-4 shrink-0 opacity-50" />
        </button>
      </div>
    );
  }

  if (compact) {
    return (
      <div data-testid="weather-alert-bar" className="space-y-1.5">
        {visibleAlerts.length >= 2 && (
          <button
            type="button"
            data-testid="weather-alert-strip-collapse"
            aria-expanded
            onClick={() => setExpanded(false)}
            className="w-full flex items-center justify-between gap-2 px-3 min-h-[36px] pointer-coarse:min-h-11 rounded-xl text-[11px] font-black uppercase tracking-widest text-rhozly-on-surface/45 can-hover:hover:text-rhozly-on-surface can-hover:hover:bg-rhozly-surface-low transition-colors"
          >
            {visibleAlerts.length} weather alerts
            <ChevronDown className="w-4 h-4 rotate-180 opacity-60" />
          </button>
        )}
        {visibleAlerts.map((alert) => {
          const styles = styleMap[alert.severity] ?? styleMap.info;
          return (
            <div
              key={alert.id}
              data-testid={`weather-alert-bar-${alert.type}`}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 animate-in slide-in-from-top-2 duration-300 ${styles.container}`}
            >
              <span className={`shrink-0 p-1 rounded-lg ${styles.iconBg}`}>{alertIcon(alert.type, "w-3.5 h-3.5")}</span>
              <button
                onClick={() => navigate("/dashboard?view=weather")}
                className="flex-1 min-w-0 text-left flex items-baseline gap-1.5"
              >
                <span className="text-[12px] font-black uppercase tracking-wide shrink-0">{alert.type}</span>
                <span className="text-[12px] font-extrabold text-rhozly-primary shrink-0">{formatWhen(alert)}</span>
                <span className="hidden sm:block text-[12px] font-medium opacity-70 truncate">{alert.message}</span>
              </button>
              <button
                onClick={() => handleDismiss(alert.type)}
                aria-label={`Dismiss ${alert.type} alert for today`}
                data-testid={`weather-alert-bar-dismiss-${alert.type}`}
                className="shrink-0 p-1.5 -mr-1 rounded-lg opacity-50 hover:opacity-100 hover:bg-black/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div data-testid="weather-alert-banner" className="space-y-3">
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
                  <Snowflake className="w-5 h-5" />
                ) : alert.type === "heat" ? (
                  <ThermometerSun className="w-5 h-5" />
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
                    {formatWhen(alert)}
                  </div>
                </div>
                <p className="text-sm font-bold leading-tight">
                  {alert.message}
                </p>
              </div>

              {!isForecastScreen && (
                <button
                  onClick={() => handleDismiss(alert.type)}
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
