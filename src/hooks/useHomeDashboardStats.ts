import { useState, useCallback, useEffect } from "react";
import { supabase } from "../lib/supabase";

export interface MemberStat {
  userId: string;
  name: string;
  completed: number;
}

export interface DayStrip {
  date: string;
  total: number;
  completed: number;
  isPast: boolean;
  isToday: boolean;
}

export interface HomeDashboardStats {
  tasks: {
    total: number;
    completed: number;
    autoCompleted: number;
    overdue: number;
    pending: number;
    completionRate: number;
    byCategory: Record<string, number>;
    skippedByRain: number;
    streak: number;
    memberBreakdown: MemberStat[];
  };
  garden: {
    totalPlants: number;
    plantsAddedThisWeek: number;
    harvestBlueprintsDue: number;
    harvestBlueprintsCompleted: number;
    plantInstancesHarvested: number;
    totalYieldByUnit: Record<string, number>;
    pruningBlueprintsDue: number;
    pruningBlueprintsCompleted: number;
    plantInstancesPruned: number;
    generalPruningEvents: number;
  };
  weather: {
    alertCount: number;
    activeAlertCount: number;
    rainfallMm: number | null;
    tasksSkippedByRain: number;
  };
  automations: {
    total: number;
    successful: number;
    failed: number;
    tasksCompleted: number;
  };
  additional: {
    plantDoctorSessions: number;
    newWatchlistAlerts: number;
  };
  dayStrip: DayStrip[];
}

function getLocalWeekBounds(): { weekStart: string; weekEnd: string; today: string } {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  // Format using LOCAL time components to avoid UTC-shift in non-UTC timezones (e.g. BST UTC+1).
  // toISOString() returns UTC, which can be one day behind local midnight.
  const localDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const sunday = new Date(now);
  sunday.setHours(0, 0, 0, 0);
  sunday.setDate(sunday.getDate() - dayOfWeek);

  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 6);

  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  return {
    weekStart: localDate(sunday),
    weekEnd: localDate(saturday),
    today: localDate(todayMidnight),
  };
}

export function useHomeDashboardStats(homeId: string | null) {
  const [stats, setStats] = useState<HomeDashboardStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [weekBounds, setWeekBounds] = useState<{ weekStart: string; weekEnd: string } | null>(null);

  const refresh = useCallback(async () => {
    if (!homeId) return;
    setLoading(true);
    setError(null);
    try {
      const { weekStart, weekEnd, today } = getLocalWeekBounds();
      setWeekBounds({ weekStart, weekEnd });
      const { data, error: fnErr } = await supabase.functions.invoke(
        "home-dashboard-stats",
        { body: { homeId, weekStart, weekEnd, today } },
      );
      if (fnErr) throw fnErr;
      setStats(data as HomeDashboardStats);
    } catch (err) {
      console.error("[useHomeDashboardStats]", err);
      setError("Could not load dashboard stats.");
    } finally {
      setLoading(false);
    }
  }, [homeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, error, refresh, weekStart: weekBounds?.weekStart ?? null, weekEnd: weekBounds?.weekEnd ?? null };
}
