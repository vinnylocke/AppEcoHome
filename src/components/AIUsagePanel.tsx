import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { getTier, HOURLY_RATE_LIMITS, FN_DISPLAY_NAMES } from "../constants/tiers";
import type { TierId } from "../constants/tiers";
import { IconAI } from "../constants/icons";

interface Props {
  homeId: string;
  userId: string;
}

interface Override {
  function_name: string;
  max_per_hour: number;
  note: string | null;
}

const AI_FUNCTIONS = [
  "plant-doctor",
  "scan-area",
  "identify-plant",
  "generate-landscape-plan",
  "generate-guide",
];

export default function AIUsagePanel({ homeId, userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState<TierId>("sprout");
  const [todayCalls, setTodayCalls] = useState(0);
  const [monthCalls, setMonthCalls] = useState(0);
  const [monthCost, setMonthCost] = useState(0);
  const [overrides, setOverrides] = useState<Override[]>([]);

  useEffect(() => {
    if (!homeId || !userId) return;

    const load = async () => {
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [profileRes, usageRes, overridesRes] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("subscription_tier")
          .eq("uid", userId)
          .maybeSingle(),
        supabase
          .from("ai_usage_log")
          .select("estimated_cost_usd, created_at")
          .eq("home_id", homeId)
          .gte("created_at", monthStart.toISOString()),
        supabase
          .from("user_rate_limit_overrides")
          .select("function_name, max_per_hour, note")
          .eq("user_id", userId),
      ]);

      if (profileRes.data?.subscription_tier) {
        setTier(profileRes.data.subscription_tier as TierId);
      }

      if (usageRes.data) {
        const rows = usageRes.data as { estimated_cost_usd: number; created_at: string }[];
        setMonthCalls(rows.length);
        setTodayCalls(rows.filter((r) => new Date(r.created_at) >= todayStart).length);
        setMonthCost(rows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0));
      }

      if (overridesRes.data) setOverrides(overridesRes.data as Override[]);
      setLoading(false);
    };

    load();
  }, [homeId, userId]);

  const tierDef = getTier(tier);
  const hasAI = tierDef.ai_enabled;
  const hasOverrides = overrides.length > 0;

  const getLimit = (fn: string) => {
    const ov = overrides.find((o) => o.function_name === fn);
    return ov ? ov.max_per_hour : (HOURLY_RATE_LIMITS[fn]?.[tier] ?? 0);
  };

  const formatCost = (usd: number) => {
    if (usd === 0) return "$0.00";
    if (usd < 0.01) return "< $0.01";
    return `$${usd.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="border border-rhozly-outline/20 rounded-3xl bg-white p-5">
        <div className="flex items-center justify-between mb-4 animate-pulse">
          <div className="h-4 w-20 bg-rhozly-surface-low rounded-full" />
          <div className="h-5 w-16 bg-rhozly-surface-low rounded-full" />
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-8 bg-rhozly-surface-low rounded-2xl" />
          <div className="h-16 bg-rhozly-surface-low rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="ai-usage-panel"
      className="border border-rhozly-outline/20 rounded-3xl bg-white overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-rhozly-outline/10">
        <span className="flex items-center gap-2 text-sm font-bold text-rhozly-on-surface">
          <IconAI size={14} className="text-rhozly-primary" />
          AI Usage
        </span>
        <span
          className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${tierDef.accentBg} ${tierDef.accentText} ${tierDef.accentBorder} border`}
        >
          {tierDef.icon} {tierDef.name}
        </span>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Today", value: todayCalls.toString(), sub: "calls" },
            { label: "This month", value: monthCalls.toString(), sub: "calls" },
            { label: "Est. cost", value: formatCost(monthCost), sub: "month" },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-rhozly-surface-lowest rounded-2xl p-3 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-1">
                {label}
              </p>
              <p className="text-base font-black text-rhozly-on-surface leading-tight">{value}</p>
              <p className="text-[9px] font-bold text-rhozly-on-surface/30">{sub}</p>
            </div>
          ))}
        </div>

        {/* Hourly limits */}
        {hasAI ? (
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-rhozly-on-surface/40 mb-2">
              Hourly limits
              {hasOverrides && (
                <span className="ml-1.5 text-rhozly-primary">· custom</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {AI_FUNCTIONS.map((fn) => {
                const limit = getLimit(fn);
                const isOverride = overrides.some((o) => o.function_name === fn);
                return (
                  <span
                    key={fn}
                    className={`inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-full border ${
                      isOverride
                        ? "bg-rhozly-primary/10 text-rhozly-primary border-rhozly-primary/20"
                        : "bg-rhozly-surface-low text-rhozly-on-surface/50 border-transparent"
                    }`}
                  >
                    {FN_DISPLAY_NAMES[fn] ?? fn}
                    <span className="opacity-60">·</span>
                    {limit}/hr
                  </span>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-rhozly-on-surface/40 font-bold">
            AI features are not included in your current plan.
          </p>
        )}
      </div>
    </div>
  );
}
