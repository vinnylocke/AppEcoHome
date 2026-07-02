import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { getLocalDateString } from "../lib/taskEngine";

/**
 * Fetches the `home-overview` aggregate for the Home dashboard's Garden
 * Overview grid + attention row (docs/plans/new-home-dashboard.md §4,
 * Phase 2). Mirrors useHomeDashboardStats: one edge-function call, a
 * generation guard so a home switch can't be overwritten by a stale
 * response, and state cleared when the home changes.
 */

export interface OverviewSensor {
  moisture: number | null;
  tempC: number | null;
  ec: number | null;
  batteryPercent: number | null;
  readingAgeMin: number | null;
}

export interface OverviewValve {
  state: "running" | "idle" | "failed";
  runningUntil: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export interface OverviewArea {
  id: string;
  name: string;
  plants: { total: number; byGrowthState: Record<string, number>; unplanted: number };
  sensor: OverviewSensor | null;
  valve: OverviewValve | null;
  tasksToday: number;
}

export interface OverviewLocationData {
  id: string;
  name: string;
  is_outside: boolean | null;
  hazard: string | null;
  tasksToday: number;
  areas: OverviewArea[];
}

export interface AttentionItem {
  kind: string;
  title: string;
  body: string;
  route: string;
  rank: number;
}

export interface HomeOverviewData {
  locations: OverviewLocationData[];
  attention: AttentionItem[];
}

export function useHomeOverview(homeId: string | null) {
  const [overview, setOverview] = useState<HomeOverviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const activeHomeRef = useRef(homeId);
  useEffect(() => {
    activeHomeRef.current = homeId;
    setOverview(null);
  }, [homeId]);

  const refresh = useCallback(async () => {
    if (!homeId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("home-overview", {
        body: { homeId, today: getLocalDateString(new Date()) },
      });
      if (activeHomeRef.current !== homeId) return;
      if (error) throw error;
      setOverview(data as HomeOverviewData);
    } catch (err) {
      if (activeHomeRef.current !== homeId) return;
      // Soft-fail: the grid still renders from client-side data; the
      // telemetry chips simply don't appear this pass.
      console.error("[useHomeOverview]", err);
    } finally {
      if (activeHomeRef.current === homeId) setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { overview, loading, refresh };
}
