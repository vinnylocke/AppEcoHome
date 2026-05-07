import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import type { TaskCategory } from "../constants/taskCategories";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonthStats {
  tasksCompleted: number;
  tasksByType: Record<TaskCategory, number>;
  newPlants: number;
  pruned: number;
  harvested: number;
  weatherEvents: number;
}

export interface MonthlyReport extends MonthStats {
  month: Date;
  delta: MonthStats | null; // difference vs previous month (positive = increase)
}

export interface YearlyReport {
  year: number;
  totals: MonthStats;
  byMonth: Array<{ month: Date } & MonthStats>; // 12 entries, one per calendar month
  highlights: string[];
}

const EMPTY_STATS: MonthStats = {
  tasksCompleted: 0,
  tasksByType: { Planting: 0, Watering: 0, Harvesting: 0, Maintenance: 0, Pruning: 0 },
  newPlants: 0,
  pruned: 0,
  harvested: 0,
  weatherEvents: 0,
};

// ─── Pure helpers (exported for unit tests) ──────────────────────────────────

export function subtractStats(a: MonthStats, b: MonthStats): MonthStats {
  return {
    tasksCompleted: a.tasksCompleted - b.tasksCompleted,
    tasksByType: {
      Planting: a.tasksByType.Planting - b.tasksByType.Planting,
      Watering: a.tasksByType.Watering - b.tasksByType.Watering,
      Harvesting: a.tasksByType.Harvesting - b.tasksByType.Harvesting,
      Maintenance: a.tasksByType.Maintenance - b.tasksByType.Maintenance,
      Pruning: a.tasksByType.Pruning - b.tasksByType.Pruning,
    },
    newPlants: a.newPlants - b.newPlants,
    pruned: a.pruned - b.pruned,
    harvested: a.harvested - b.harvested,
    weatherEvents: a.weatherEvents - b.weatherEvents,
  };
}

export function sumStats(months: MonthStats[]): MonthStats {
  return months.reduce(
    (acc, m) => ({
      tasksCompleted: acc.tasksCompleted + m.tasksCompleted,
      tasksByType: {
        Planting: acc.tasksByType.Planting + m.tasksByType.Planting,
        Watering: acc.tasksByType.Watering + m.tasksByType.Watering,
        Harvesting: acc.tasksByType.Harvesting + m.tasksByType.Harvesting,
        Maintenance: acc.tasksByType.Maintenance + m.tasksByType.Maintenance,
        Pruning: acc.tasksByType.Pruning + m.tasksByType.Pruning,
      },
      newPlants: acc.newPlants + m.newPlants,
      pruned: acc.pruned + m.pruned,
      harvested: acc.harvested + m.harvested,
      weatherEvents: acc.weatherEvents + m.weatherEvents,
    }),
    { ...EMPTY_STATS, tasksByType: { ...EMPTY_STATS.tasksByType } },
  );
}

export function generateHighlights(byMonth: Array<{ month: Date } & MonthStats>): string[] {
  const highlights: string[] = [];
  const totalTasks = byMonth.reduce((s, m) => s + m.tasksCompleted, 0);
  if (totalTasks === 0) return [];

  // Busiest month
  const busiest = byMonth.reduce((a, b) =>
    a.tasksCompleted >= b.tasksCompleted ? a : b,
  );
  if (busiest.tasksCompleted > 0) {
    const name = new Date(busiest.month).toLocaleString("en-GB", { month: "long" });
    highlights.push(`Busiest month: ${name} (${busiest.tasksCompleted} tasks)`);
  }

  // Most common task type
  const typeTotals = byMonth.reduce(
    (acc, m) => {
      for (const [type, count] of Object.entries(m.tasksByType)) {
        acc[type] = (acc[type] ?? 0) + (count as number);
      }
      return acc;
    },
    {} as Record<string, number>,
  );
  const topType = Object.entries(typeTotals)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])[0];
  if (topType) {
    highlights.push(`Most common task: ${topType[0]} (${topType[1]} times)`);
  }

  // Plants
  const totalPlants = byMonth.reduce((s, m) => s + m.newPlants, 0);
  if (totalPlants > 0) {
    highlights.push(`${totalPlants} new plant${totalPlants !== 1 ? "s" : ""} added to your garden`);
  }

  // Harvests
  const totalHarvested = byMonth.reduce((s, m) => s + m.harvested, 0);
  if (totalHarvested > 0) {
    highlights.push(`${totalHarvested} harvest${totalHarvested !== 1 ? "s" : ""} recorded`);
  }

  // Weather events
  const totalWeather = byMonth.reduce((s, m) => s + m.weatherEvents, 0);
  if (totalWeather > 0) {
    highlights.push(`${totalWeather} weather event${totalWeather !== 1 ? "s" : ""} logged`);
  }

  return highlights;
}

// ─── Data fetching ────────────────────────────────────────────────────────────

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

async function fetchLocationIds(homeId: string): Promise<string[]> {
  const { data } = await supabase
    .from("locations")
    .select("id")
    .eq("home_id", homeId);
  return (data ?? []).map((l: any) => l.id);
}

async function fetchMonthStats(
  homeId: string,
  locationIds: string[],
  start: Date,
  end: Date,
): Promise<MonthStats> {
  const startStr = start.toISOString();
  const endStr = end.toISOString();

  const [tasksRes, plantsRes, harvestsRes, weatherRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("type")
      .eq("home_id", homeId)
      .eq("status", "Completed")
      .gte("completed_at", startStr)
      .lt("completed_at", endStr),

    supabase
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("home_id", homeId)
      .gte("created_at", startStr)
      .lt("created_at", endStr),

    supabase
      .from("yield_records")
      .select("id", { count: "exact", head: true })
      .eq("home_id", homeId)
      .gte("harvested_at", startStr)
      .lt("harvested_at", endStr),

    locationIds.length > 0
      ? supabase
          .from("weather_alerts")
          .select("id", { count: "exact", head: true })
          .in("location_id", locationIds)
          .gte("created_at", startStr)
          .lt("created_at", endStr)
      : Promise.resolve({ count: 0 }),
  ]);

  const tasksByType: Record<TaskCategory, number> = {
    Planting: 0,
    Watering: 0,
    Harvesting: 0,
    Maintenance: 0,
    Pruning: 0,
  };
  let tasksCompleted = 0;
  for (const t of tasksRes.data ?? []) {
    tasksCompleted++;
    if (t.type in tasksByType) tasksByType[t.type as TaskCategory]++;
  }

  return {
    tasksCompleted,
    tasksByType,
    newPlants: plantsRes.count ?? 0,
    pruned: tasksByType.Pruning,
    harvested: harvestsRes.count ?? 0,
    weatherEvents: (weatherRes as any).count ?? 0,
  };
}

async function fetchYearStats(
  homeId: string,
  locationIds: string[],
  year: number,
): Promise<Array<{ month: Date } & MonthStats>> {
  const yearStart = new Date(year, 0, 1).toISOString();
  const yearEnd = new Date(year + 1, 0, 1).toISOString();

  const [tasksRes, plantsRes, harvestsRes, weatherRes] = await Promise.all([
    supabase
      .from("tasks")
      .select("type, completed_at")
      .eq("home_id", homeId)
      .eq("status", "Completed")
      .gte("completed_at", yearStart)
      .lt("completed_at", yearEnd),

    supabase
      .from("inventory_items")
      .select("created_at")
      .eq("home_id", homeId)
      .gte("created_at", yearStart)
      .lt("created_at", yearEnd),

    supabase
      .from("yield_records")
      .select("harvested_at")
      .eq("home_id", homeId)
      .gte("harvested_at", yearStart)
      .lt("harvested_at", yearEnd),

    locationIds.length > 0
      ? supabase
          .from("weather_alerts")
          .select("created_at")
          .in("location_id", locationIds)
          .gte("created_at", yearStart)
          .lt("created_at", yearEnd)
      : Promise.resolve({ data: [] }),
  ]);

  // Bucket into 12 months
  const months = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(year, i, 1),
    ...structuredClone(EMPTY_STATS),
    tasksByType: { Planting: 0, Watering: 0, Harvesting: 0, Maintenance: 0, Pruning: 0 },
  }));

  for (const t of tasksRes.data ?? []) {
    const m = new Date(t.completed_at).getMonth();
    months[m].tasksCompleted++;
    if (t.type in months[m].tasksByType) months[m].tasksByType[t.type as TaskCategory]++;
    if (t.type === "Pruning") months[m].pruned++;
    if (t.type === "Harvesting") months[m].harvested++;
  }

  for (const p of plantsRes.data ?? []) {
    const m = new Date(p.created_at).getMonth();
    months[m].newPlants++;
  }

  for (const h of harvestsRes.data ?? []) {
    const m = new Date(h.harvested_at).getMonth();
    months[m].harvested++;
  }
  // Deduplicate harvests: yield_records are the primary source, but Harvesting tasks
  // may double-count. Use yield_records count directly (already bucketed above).
  // Reset harvested from task loop, keep only yield_records count.
  for (const m of months) {
    m.harvested = 0; // reset task-based count
  }
  for (const h of harvestsRes.data ?? []) {
    const m = new Date(h.harvested_at).getMonth();
    months[m].harvested++;
  }

  for (const w of (weatherRes as any).data ?? []) {
    const m = new Date(w.created_at).getMonth();
    months[m].weatherEvents++;
  }

  return months;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGardenReport(
  homeId: string | null | undefined,
  selectedMonth: Date,
  selectedYear: number,
): {
  monthly: MonthlyReport | null;
  yearly: YearlyReport | null;
  isLoadingMonthly: boolean;
  isLoadingYearly: boolean;
} {
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null);
  const [yearly, setYearly] = useState<YearlyReport | null>(null);
  const [isLoadingMonthly, setIsLoadingMonthly] = useState(false);
  const [isLoadingYearly, setIsLoadingYearly] = useState(false);

  // Monthly fetch
  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    setIsLoadingMonthly(true);

    (async () => {
      const locationIds = await fetchLocationIds(homeId);
      const monthStart = startOfMonth(selectedMonth);
      const monthEnd = endOfMonth(selectedMonth);
      const prevMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
      const prevMonthEnd = startOfMonth(selectedMonth);

      const [current, previous] = await Promise.all([
        fetchMonthStats(homeId, locationIds, monthStart, monthEnd),
        fetchMonthStats(homeId, locationIds, prevMonthStart, prevMonthEnd),
      ]);

      if (!cancelled) {
        setMonthly({
          month: monthStart,
          ...current,
          delta: subtractStats(current, previous),
        });
        setIsLoadingMonthly(false);
      }
    })();

    return () => { cancelled = true; };
  }, [homeId, selectedMonth.getFullYear(), selectedMonth.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Yearly fetch
  useEffect(() => {
    if (!homeId) return;
    let cancelled = false;
    setIsLoadingYearly(true);

    (async () => {
      const locationIds = await fetchLocationIds(homeId);
      const byMonth = await fetchYearStats(homeId, locationIds, selectedYear);

      if (!cancelled) {
        setYearly({
          year: selectedYear,
          totals: sumStats(byMonth),
          byMonth,
          highlights: generateHighlights(byMonth),
        });
        setIsLoadingYearly(false);
      }
    })();

    return () => { cancelled = true; };
  }, [homeId, selectedYear]);

  return { monthly, yearly, isLoadingMonthly, isLoadingYearly };
}
