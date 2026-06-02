import { supabase } from "./supabase";

export const getLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// ---------------------------------------------------------------------------
// Window-task helpers (Wave 20 — harvest window-task model)
// ---------------------------------------------------------------------------
//
// Harvest tasks carry a `window_end_date` — the last day the harvest window
// is open. While inside that window the task is "active" (visible on Today
// + Calendar) but not overdue. Only after `window_end_date` does it flag.
// `next_check_at` is a per-task snooze the user (or AI ripeness) sets via
// the "Not yet" action; while it's in the future the task is hidden.

/** True if the task is past its due date in the user-meaningful sense.
 *  Window tasks (Harvesting with `window_end_date`) are overdue only AFTER
 *  the window closes. Everything else uses the legacy `due_date < today`. */
export function isTaskOverdue(
  task: { status?: string; due_date?: string | null; window_end_date?: string | null },
  todayStr: string,
): boolean {
  if (!task.due_date) return false;
  if (task.status && task.status !== "Pending") return false;
  if (task.window_end_date) {
    return task.window_end_date < todayStr;
  }
  return task.due_date < todayStr;
}

/** True if the task is currently inside its harvest window — i.e. a
 *  window task whose due_date <= today <= window_end_date. */
export function isInsideHarvestWindow(
  task: { due_date?: string | null; window_end_date?: string | null },
  todayStr: string,
): boolean {
  if (!task.window_end_date || !task.due_date) return false;
  return task.due_date <= todayStr && todayStr <= task.window_end_date;
}

/** Days remaining in the harvest window, inclusive of today. Returns 0
 *  when today is the last day, -1 when the window has closed. */
export function daysLeftInWindow(
  task: { window_end_date?: string | null },
  todayStr: string,
): number | null {
  if (!task.window_end_date) return null;
  const end = new Date(task.window_end_date);
  const today = new Date(todayStr);
  const diff = Math.round((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}

/** Collect every YYYY-MM-DD inside ANY active harvest window in the
 *  supplied task list. Used by TaskCalendar to tint days that belong to
 *  one or more harvest windows.
 *
 *  - Only counts tasks where `window_end_date` is set.
 *  - Skips completed / skipped tasks so resolved windows don't pollute
 *    the highlight.
 *  - Inclusive on both ends.
 *  - Iteration is bounded at 400 days per window — guards against bad
 *    data without sacrificing real-world windows (longest UK fruit
 *    seasons top out around 6 months).
 */
export function collectHarvestWindowDates(
  tasks: Array<{
    status?: string;
    due_date?: string | null;
    window_end_date?: string | null;
  }>,
): Set<string> {
  const set = new Set<string>();
  for (const t of tasks) {
    if (!t.window_end_date || !t.due_date) continue;
    if (t.status && t.status !== "Pending") continue;
    const start = new Date(t.due_date);
    const end = new Date(t.window_end_date);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
    if (end < start) continue;
    const cursor = new Date(start);
    let guard = 0;
    while (cursor <= end && guard++ < 400) {
      set.add(getLocalDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return set;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchArgs {
  homeId: string;
  startDateStr: string;
  endDateStr: string;
  includeOverdue?: boolean;
  todayStr: string;
}

/**
 * Partial snapshot emitted after the engine finishes Round 1 + ghost
 * materialisation but before Round 2 (inventory thumbnails + dependency
 * badges). Consumers that supply `onTasksReady` can paint the list at
 * this point — the enrichment lands when the full result resolves.
 */
export interface Phase1Snapshot {
  tasks: any[];
  blueprints: any[];
}

export interface FullResult {
  tasks: any[];
  inventoryDict: Record<string, any>;
  blockedTaskIds: Set<string>;
}

// ---------------------------------------------------------------------------
// In-memory cache (Phase 2 of Quick Access perf work)
// ---------------------------------------------------------------------------
//
// `peekCache` returns a fresh entry synchronously — TaskList uses it on
// mount for instant initial paint. Realtime-driven refreshes invalidate
// via `invalidateCache(homeId)`. The TTL is a safety ceiling, not the
// primary invalidation lever.

const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  full: FullResult;
  fetchedAt: number;
}

interface PendingFetch {
  promise: Promise<FullResult>;
  phase1Snapshot: Phase1Snapshot | null;
  phase1Callbacks: Array<(snapshot: Phase1Snapshot) => void>;
}

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, PendingFetch>();

function cacheKey(args: FetchArgs): string {
  return [
    args.homeId,
    args.startDateStr,
    args.endDateStr,
    !!args.includeOverdue,
    args.todayStr,
  ].join("|");
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export const TaskEngine = {
  /**
   * Synchronous cache peek — returns a fresh entry or null. Used by
   * TaskList for instant initial paint on return visits.
   */
  peekCache(args: FetchArgs): FullResult | null {
    const key = cacheKey(args);
    const entry = cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }
    return entry.full;
  },

  /**
   * Invalidate all cache entries (no arg) or only entries for one home.
   * Realtime tick handlers call this before re-fetching.
   */
  invalidateCache(homeId?: string): void {
    if (!homeId) {
      cache.clear();
      return;
    }
    for (const key of [...cache.keys()]) {
      if (key.startsWith(homeId + "|")) cache.delete(key);
    }
  },

  /**
   * Fire-and-forget prefetch — kicks off a fetch in the background so its
   * result lands in the cache by the time the next mount happens.
   * Called from the Today tile tap on /quick before navigating to
   * /quick/calendar. De-duplicates against an in-flight fetch for the
   * same args.
   */
  prefetch(args: FetchArgs): void {
    void TaskEngine.fetchTasksWithGhosts(args).catch(() => {
      // Swallow: prefetch is opportunistic. The real fetch on mount will
      // surface any error to the user.
    });
  },

  async fetchTasksWithGhosts(
    args: FetchArgs & {
      onTasksReady?: (snapshot: Phase1Snapshot) => void;
    },
  ): Promise<FullResult> {
    const { homeId, startDateStr, endDateStr, includeOverdue = false, todayStr, onTasksReady } = args;
    const key = cacheKey(args);

    // Deduplicate: if an identical fetch is already in-flight, reuse it.
    const existing = pending.get(key);
    if (existing) {
      if (onTasksReady) {
        if (existing.phase1Snapshot) {
          // Phase 1 already complete — fire immediately for this subscriber.
          try {
            onTasksReady(existing.phase1Snapshot);
          } catch {
            // Don't let a callback throw break the engine.
          }
        } else {
          // Phase 1 not yet done — subscribe to be notified when it lands.
          existing.phase1Callbacks.push(onTasksReady);
        }
      }
      return existing.promise;
    }

    const entry: PendingFetch = {
      promise: null as unknown as Promise<FullResult>,
      phase1Snapshot: null,
      phase1Callbacks: onTasksReady ? [onTasksReady] : [],
    };

    const run = async (): Promise<FullResult> => {
      // Round 1 — fetch all three independent sources in parallel.
      // Window-task semantics: a Harvesting task with `window_end_date` is
      // "active" through the whole window, so include it when the window
      // intersects the requested range — its `due_date` may be far in the
      // past. The `tasks_window_end_idx` partial index keeps this cheap.
      let tasksQuery = supabase
        .from("tasks")
        .select("*, locations(name, is_outside), areas(name), plans(name)")
        .eq("home_id", homeId)
        .neq("status", "Skipped");
      if (!includeOverdue) {
        tasksQuery = tasksQuery.or(
          `due_date.gte.${startDateStr},window_end_date.gte.${startDateStr}`,
        );
      }
      tasksQuery = tasksQuery.lte("due_date", endDateStr);

      const [
        { data: physicalTasks, error: tError },
        { data: blueprints, error: bpError },
        { data: skippedTombstones },
      ] = await Promise.all([
        tasksQuery,
        supabase
          .from("task_blueprints")
          .select("*, locations(name, is_outside), areas(name), plans(name)")
          .eq("home_id", homeId)
          .eq("is_recurring", true)
          .eq("is_archived", false),
        supabase
          .from("tasks")
          .select("blueprint_id, due_date")
          .eq("home_id", homeId)
          .eq("status", "Skipped")
          .gte("due_date", startDateStr)
          .lte("due_date", endDateStr)
          .not("blueprint_id", "is", null),
      ]);

      if (tError) throw tError;
      if (bpError) throw bpError;

      const tombstoneSet = new Set(
        (skippedTombstones ?? []).map(
          (t: any) => `${t.blueprint_id}:${t.due_date}`,
        ),
      );

      // Filter historical completed tasks out of the window, AND hide
      // window tasks the user (or AI ripeness) snoozed via "Not yet"
      // when their `next_check_at` is still in the future.
      const rawTasks = (physicalTasks || []).filter((task: any) => {
        if (
          task.status === "Pending"
          && task.next_check_at
          && task.next_check_at > todayStr
        ) {
          return false;
        }
        return true;
      }).filter((task) => {
        if (task.status !== "Completed") return true;
        const isDueInWindow =
          task.due_date >= startDateStr && task.due_date <= endDateStr;
        const timestamp = task.updated_at || task.created_at || task.due_date;
        const completedDateStr = timestamp.split("T")[0];
        const isCompletedInWindow =
          completedDateStr >= startDateStr && completedDateStr <= endDateStr;
        return isDueInWindow || isCompletedInWindow;
      });

      const bps = blueprints || [];

      // Generate ghost tasks from blueprints (pure JS — no DB calls).
      const ghosts: any[] = [];
      const nowMs = Date.now();
      bps.forEach((bp) => {
        if (!bp.frequency_days || !bp.start_date) return;

        // Paused blueprints don't generate ghost tasks until the pause ends.
        const pausedUntil = bp.paused_until ? new Date(bp.paused_until).getTime() : null;
        const isPaused = pausedUntil !== null && pausedUntil > nowMs;
        if (isPaused) return;

        // ── Harvest window branch ────────────────────────────────────────
        // Harvest blueprints with both a start_date AND end_date emit ONE
        // ghost per window — due_date is the window start, window_end_date
        // is the window close. The engine + UI then treat the task as
        // "active in window" rather than overdue-by-default. See
        // docs/app-reference/04-schedule/01-blueprint-manager.md.
        if (bp.task_type === "Harvesting" && bp.end_date) {
          const ghostStartIso = bp.start_date;
          const intersectsRange =
            ghostStartIso <= endDateStr && bp.end_date >= startDateStr;
          if (!intersectsRange) return;

          const alreadyExists =
            rawTasks.some(
              (t: any) => t.blueprint_id === bp.id && t.due_date === ghostStartIso,
            ) || tombstoneSet.has(`${bp.id}:${ghostStartIso}`);
          if (alreadyExists) return;

          ghosts.push({
            id: `ghost-${bp.id}-${ghostStartIso}`,
            blueprint_id: bp.id,
            home_id: bp.home_id,
            title: bp.title,
            description: bp.description,
            type: bp.task_type,
            due_date: ghostStartIso,
            window_end_date: bp.end_date,
            status: "Pending",
            location_id: bp.location_id,
            area_id: bp.area_id,
            plan_id: bp.plan_id,
            inventory_item_ids: bp.inventory_item_ids || [],
            locations: bp.locations,
            scope: bp.scope || "home",
            created_by: bp.created_by || null,
            assigned_to: bp.assigned_to || null,
            isGhost: true,
          });
          return;
        }

        const freq = bp.frequency_days;
        let currentGhostDate = new Date(bp.start_date);
        const targetEndDate = new Date(endDateStr);

        const windowStart = new Date(startDateStr);
        if (currentGhostDate < windowStart) {
          const diffTime = Math.abs(
            windowStart.getTime() - currentGhostDate.getTime(),
          );
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          const cyclesToSkip = Math.ceil(diffDays / freq);
          currentGhostDate.setDate(
            currentGhostDate.getDate() + cyclesToSkip * freq,
          );
        }

        while (currentGhostDate <= targetEndDate) {
          const ghostDateStr = getLocalDateString(currentGhostDate);
          if (bp.end_date && ghostDateStr > bp.end_date) break;

          const alreadyExists =
            rawTasks.some(
              (t) => t.blueprint_id === bp.id && t.due_date === ghostDateStr,
            ) || tombstoneSet.has(`${bp.id}:${ghostDateStr}`);

          if (
            !alreadyExists &&
            ghostDateStr >= startDateStr &&
            ghostDateStr <= endDateStr
          ) {
            ghosts.push({
              id: `ghost-${bp.id}-${ghostDateStr}`,
              blueprint_id: bp.id,
              home_id: bp.home_id,
              title: bp.title,
              description: bp.description,
              type: bp.task_type,
              due_date: ghostDateStr,
              status: "Pending",
              location_id: bp.location_id,
              area_id: bp.area_id,
              plan_id: bp.plan_id,
              inventory_item_ids: bp.inventory_item_ids || [],
              locations: bp.locations,
              scope: bp.scope || "home",
              created_by: bp.created_by || null,
              assigned_to: bp.assigned_to || null,
              isGhost: true,
            });
          }
          currentGhostDate.setDate(currentGhostDate.getDate() + freq);
        }
      });

      // Phase 1 complete — fire all subscribers with the partial snapshot.
      const tasks = [...rawTasks, ...ghosts];
      const snapshot: Phase1Snapshot = { tasks, blueprints: bps };
      entry.phase1Snapshot = snapshot;
      for (const cb of entry.phase1Callbacks) {
        try {
          cb(snapshot);
        } catch {
          // Swallow — see comment in dedup branch above.
        }
      }

      // Round 2 — fetch inventory items + task_dependencies in parallel.
      const allItemIds = new Set<string>();
      rawTasks.forEach((t) => {
        if (t.inventory_item_ids)
          t.inventory_item_ids.forEach((id: string) => allItemIds.add(id));
      });
      bps.forEach((bp) => {
        if (bp.inventory_item_ids)
          bp.inventory_item_ids.forEach((id: string) => allItemIds.add(id));
      });
      const uniqueItemIds = Array.from(allItemIds);
      const physicalIds = rawTasks.map((t) => t.id);

      const [invResult, depsResult] = await Promise.all([
        uniqueItemIds.length > 0
          ? supabase
              .from("inventory_items")
              .select(
                "id, plant_name, identifier, location_name, area_name, plants(thumbnail_url, cycle)",
              )
              .in("id", uniqueItemIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        physicalIds.length > 0
          ? supabase
              .from("task_dependencies")
              .select("task_id, depends_on_task_id")
              .in("task_id", physicalIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (invResult.error) throw invResult.error;

      const inventoryDict: Record<string, any> = {};
      invResult.data?.forEach((item) => {
        inventoryDict[item.id] = item;
      });

      // Round 3 — pending parents (sequential on deps; skipped when no deps).
      const deps = depsResult.data ?? [];
      const blockedTaskIds = new Set<string>();

      if (deps.length > 0) {
        const parentIds = deps.map((d) => d.depends_on_task_id);
        const { data: pendingParents } = await supabase
          .from("tasks")
          .select("id")
          .in("id", parentIds)
          .eq("status", "Pending");

        if (pendingParents && pendingParents.length > 0) {
          const pendingParentSet = new Set(pendingParents.map((p) => p.id));
          deps.forEach((d) => {
            if (pendingParentSet.has(d.depends_on_task_id)) {
              blockedTaskIds.add(d.task_id);
            }
          });
        }
      }

      const full: FullResult = { tasks, inventoryDict, blockedTaskIds };
      cache.set(key, { full, fetchedAt: Date.now() });
      return full;
    };

    entry.promise = run().finally(() => {
      pending.delete(key);
    });

    pending.set(key, entry);
    return entry.promise;
  },
};
