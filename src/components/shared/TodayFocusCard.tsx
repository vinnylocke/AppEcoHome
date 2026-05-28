import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, CloudRain, Sun, Flame, Snowflake, Trophy, CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { useHomeDashboardStats, type HomeDashboardStats } from "../../hooks/useHomeDashboardStats";
import { usePersona } from "../../hooks/usePersona";

interface Props {
  homeId: string;
  /** Where the card renders. Affects what is shown for the "quiet" variant. */
  variant?: "dashboard" | "quick";
  /** Extra className appended to the root. */
  className?: string;
}

export type TodayFocusVariant = "urgent" | "weather" | "streak" | "quiet";

export interface TodayFocusDecision {
  variant: TodayFocusVariant;
  /** Short message for experienced persona. */
  shortMessage: string;
  /** Longer message for new / null persona. */
  fullMessage: string;
  /** When tapped, where to navigate. null = no navigation (quiet variant). */
  route: string | null;
}

interface WeatherSnapshot {
  hasHeatAlert?: boolean;
  hasFrostAlert?: boolean;
  hasOtherAlert?: boolean;
}

/**
 * Pure decision function — easy to unit-test. Picks ONE of four
 * variants based on stat thresholds, in priority order:
 *   1. urgent  — at least one overdue task and it's after 8 AM.
 *   2. weather — a heat/frost alert exists for today.
 *   3. streak  — user has a streak of 3+ days.
 *   4. quiet   — nothing urgent.
 */
export function decideTodayFocus(args: {
  stats: HomeDashboardStats | null;
  weather: WeatherSnapshot;
  hourOfDay: number;
}): TodayFocusDecision {
  const overdue = args.stats?.tasks.overdue ?? 0;
  const streak = args.stats?.tasks.streak ?? 0;

  if (overdue > 0 && args.hourOfDay >= 8) {
    return {
      variant: "urgent",
      shortMessage:
        overdue === 1 ? "1 overdue. Finish?" : `${overdue} overdue. Finish?`,
      fullMessage:
        overdue === 1
          ? "1 overdue task — finish it off →"
          : `${overdue} overdue tasks — finish them off →`,
      route: "/schedule?filter=overdue",
    };
  }

  if (args.weather.hasFrostAlert) {
    return {
      variant: "weather",
      shortMessage: "Frost forecast — cover sensitive plants.",
      fullMessage: "Frost forecast today — cover or move sensitive plants →",
      route: "/dashboard",
    };
  }
  if (args.weather.hasHeatAlert) {
    return {
      variant: "weather",
      shortMessage: "Hot day. Plants may need water.",
      fullMessage: "Hot weather today — your plants may need extra water →",
      route: "/dashboard",
    };
  }
  if (args.weather.hasOtherAlert) {
    return {
      variant: "weather",
      shortMessage: "Weather alert — check the forecast.",
      fullMessage: "Weather alert today — check the forecast →",
      route: "/dashboard",
    };
  }

  if (streak >= 3) {
    return {
      variant: "streak",
      shortMessage: `${streak}-day streak — keep going.`,
      fullMessage: `${streak}-day streak — keep it going!`,
      route: "/schedule",
    };
  }

  return {
    variant: "quiet",
    shortMessage: "All caught up.",
    fullMessage: "All caught up. Nothing urgent today.",
    route: null,
  };
}

/**
 * Smart prompt card surfaced at the top of the dashboard + quick
 * access. Picks ONE thing to nudge the user about based on overdue
 * tasks, weather alerts, or streak. Hidden on `/quick` when there's
 * nothing urgent (the SeasonalPicksCard already fills that slot).
 */
export default function TodayFocusCard({ homeId, variant = "dashboard", className }: Props) {
  const navigate = useNavigate();
  const persona = usePersona();
  const { stats } = useHomeDashboardStats(homeId);
  const [weather, setWeather] = useState<WeatherSnapshot>({});

  // Lightweight weather alert check — uses the heat/frost rule
  // outputs already persisted by the weather cron. We only need
  // to know "does an alert exist today?" — no shape parsing.
  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    (async () => {
      try {
        const { supabase } = await import("../../lib/supabase");
        const today = new Date().toISOString().split("T")[0];
        const { data } = await supabase
          .from("weather_alerts")
          .select("type")
          .eq("home_id", homeId)
          .gte("starts_at", today)
          .lt("starts_at", `${today}T23:59:59`)
          .limit(5);
        if (cancelled) return;
        const types = (data ?? []).map((r: { type: string }) => r.type);
        setWeather({
          hasHeatAlert: types.some((t) => t === "heat" || t === "heatwave"),
          hasFrostAlert: types.some((t) => t === "frost"),
          hasOtherAlert: types.some(
            (t) => t !== "heat" && t !== "heatwave" && t !== "frost",
          ),
        });
      } catch {
        // Best-effort — falls through to no-weather-alerts state.
      }
    })();
    return () => { cancelled = true; };
  }, [homeId]);

  const decision = decideTodayFocus({
    stats,
    weather,
    hourOfDay: new Date().getHours(),
  });

  // On `/quick`, hide the quiet variant — the SeasonalPicksCard
  // already fills the same slot with something more interesting.
  if (decision.variant === "quiet" && variant === "quick") return null;

  const useShort = persona === "experienced";
  const message = useShort ? decision.shortMessage : decision.fullMessage;

  const visual = visualFor(decision.variant);
  const Icon = visual.icon;

  const handleClick = () => {
    if (decision.route) navigate(decision.route);
  };

  return (
    <button
      type="button"
      onClick={decision.route ? handleClick : undefined}
      disabled={!decision.route}
      data-testid="today-focus-card"
      data-variant={decision.variant}
      aria-label={message}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border text-left shadow-sm transition-all ${visual.bg} ${visual.border} ${decision.route ? "hover:shadow-md active:scale-[0.99]" : "cursor-default"} ${className ?? ""}`}
    >
      <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${visual.iconBg}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-black text-sm leading-tight ${visual.text}`}>
          {message}
        </p>
      </div>
      {decision.route && (
        <ChevronRight size={16} className={`shrink-0 ${visual.text} opacity-50`} />
      )}
    </button>
  );
}

function visualFor(variant: TodayFocusVariant): {
  bg: string;
  border: string;
  text: string;
  iconBg: string;
  icon: React.ComponentType<{ size?: number }>;
} {
  if (variant === "urgent") {
    return {
      bg: "bg-red-50",
      border: "border-red-200",
      text: "text-red-900",
      iconBg: "bg-red-500 text-white",
      icon: AlertCircle,
    };
  }
  if (variant === "weather") {
    return {
      bg: "bg-amber-50",
      border: "border-amber-200",
      text: "text-amber-900",
      iconBg: "bg-amber-500 text-white",
      icon: CloudRain,
    };
  }
  if (variant === "streak") {
    return {
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      text: "text-emerald-900",
      iconBg: "bg-emerald-500 text-white",
      icon: Trophy,
    };
  }
  // quiet
  return {
    bg: "bg-rhozly-surface-low/60",
    border: "border-rhozly-outline/15",
    text: "text-rhozly-on-surface/60",
    iconBg: "bg-rhozly-primary/10 text-rhozly-primary",
    icon: CheckCircle2,
  };
}

// Unused but exported so consumers can pick a custom icon if needed.
export const _focusIcons = { Sun, Flame, Snowflake, Sparkles };
