// ─── Today's remaining task count per location (ghost-aware) ────────────────
//
// Powers the per-location task chips (LocationTile / GardenOverviewGrid), the
// DailyBriefCard "X tasks today" hero, and — summed — the `pending` half of the
// RHO-20 "X of Y done today" breakdown (see lib/todaySummary.ts).
//
// It counts tasks STILL TO DO today: persisted pending rows plus the virtual
// "ghosts" of recurring blueprints that haven't been acted on yet. Completed
// and Skipped rows are NOT counted (they're not remaining) but they ARE used as
// tombstones to suppress their blueprint's ghost — otherwise the ghost would
// regenerate and be counted as pending, double-counting against the server's
// `done` count. This mirrors TaskEngine.fetchTasksWithGhosts, whose main query
// keeps Completed rows (only Skipped is dropped) precisely so they suppress
// their ghosts.

export interface TaskCountRow {
  location_id?: string | null;
  blueprint_id?: string | null;
  status?: string | null;
}

export interface BlueprintCountRow {
  id: string;
  location_id?: string | null;
  frequency_days?: number | null;
  paused_until?: string | null;
  start_date?: string | null;
  created_at?: string | null;
  end_date?: string | null;
  task_type?: string | null;
}

/**
 * Build the map of location_id → remaining task count for `todayStr`.
 *
 * @param locationIds  All location ids for the home (seeded to 0 so every
 *                     location has an entry, even with no tasks).
 * @param todayTasks   Persisted task rows due today. MUST include Completed and
 *                     Skipped rows (they suppress ghosts); they are filtered
 *                     out of the visible count internally.
 * @param blueprints   Active recurring blueprints for the home.
 * @param todayStr     Local YYYY-MM-DD for "today".
 */
export function buildLocationTaskCounts(
  locationIds: string[],
  todayTasks: TaskCountRow[],
  blueprints: BlueprintCountRow[],
  todayStr: string,
): Record<string, number> {
  const todayMs = new Date(todayStr).getTime();
  const counts: Record<string, number> = {};
  locationIds.forEach((id) => { counts[id] = 0; });

  // Persisted rows. Completed / Skipped are tombstones — they suppress their
  // blueprint's ghost (below) but are not themselves remaining tasks, so the
  // list hides them and the count must not include them either.
  const existingByLocation: Record<string, Set<string>> = {};
  todayTasks.forEach((t) => {
    if (!t.location_id) return;
    if (t.status !== "Skipped" && t.status !== "Completed") {
      counts[t.location_id] = (counts[t.location_id] || 0) + 1;
    }
    if (t.blueprint_id) {
      if (!existingByLocation[t.location_id]) existingByLocation[t.location_id] = new Set();
      existingByLocation[t.location_id].add(t.blueprint_id);
    }
  });

  // Ghosts: a recurring blueprint due today with no persisted row yet.
  blueprints.forEach((bp) => {
    if (!bp.location_id || !bp.frequency_days) return;
    // Mirror the TaskEngine pause rule: occurrences before paused_until never count.
    if (bp.paused_until && todayStr < String(bp.paused_until).split("T")[0]) return;
    const anchorStr = (bp.start_date || bp.created_at || new Date().toISOString()).split("T")[0];
    const anchorMs = new Date(anchorStr).getTime();
    if (todayMs < anchorMs) return;
    if (bp.end_date && todayMs > new Date(bp.end_date).getTime()) return;
    const existing = existingByLocation[bp.location_id];
    if (existing?.has(bp.id)) return;
    // Windowed harvest blueprints emit ONE window task active across
    // [start_date, end_date] — counting them on every freq-aligned day
    // multiplied them. In-window (checked above) counts once.
    const isHarvestWindow =
      (bp.task_type === "Harvesting" || bp.task_type === "Harvest") && !!bp.end_date;
    const diffDays = Math.round((todayMs - anchorMs) / (1000 * 60 * 60 * 24));
    if (isHarvestWindow || diffDays % bp.frequency_days === 0) {
      counts[bp.location_id] = (counts[bp.location_id] || 0) + 1;
    }
  });

  return counts;
}
