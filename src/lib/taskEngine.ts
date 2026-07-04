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

/** True if this Completed task was finished AFTER the day it was meant to be
 *  done (RHO-19). "Late" means: `completed_at`'s LOCAL calendar day is strictly
 *  after the task's effective deadline.
 *  - Only Completed tasks with a `completed_at` and a `due_date` can be late.
 *  - Window (harvest) tasks compare against `window_end_date`, NOT `due_date` —
 *    a harvest logged any day inside its open window is on time; only after the
 *    window closes is it late.
 *  - Snooze (`next_check_at`) is irrelevant: it only moves *pending* visibility,
 *    never the deadline a completion is judged against.
 *  Returns the effective deadline (YYYY-MM-DD) when late, else null — callers
 *  use it for the "due N" copy without recomputing. Uses the LOCAL day of
 *  `completed_at` (never a UTC `.slice`) so an evening completion west of UTC
 *  isn't mis-dated by a day. */
export function lateCompletionDueDate(
  task: {
    status?: string;
    completed_at?: string | null;
    due_date?: string | null;
    window_end_date?: string | null;
  },
): string | null {
  if (task.status !== "Completed" || !task.completed_at || !task.due_date) return null;
  const completedLocal = String(task.completed_at).includes("T")
    ? getLocalDateString(new Date(task.completed_at))
    : String(task.completed_at).slice(0, 10);
  const deadline = (task.window_end_date
    ? String(task.window_end_date)
    : String(task.due_date)).slice(0, 10);
  return completedLocal > deadline ? deadline : null;
}

/** The LOCAL calendar day (YYYY-MM-DD) a task was completed on, or null.
 *  Companion to `lateCompletionDueDate` for the "· done N" chip copy. */
export function completedLocalDate(
  task: { completed_at?: string | null },
): string | null {
  if (!task.completed_at) return null;
  return String(task.completed_at).includes("T")
    ? getLocalDateString(new Date(task.completed_at))
    : String(task.completed_at).slice(0, 10);
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
    // Iterate in pure UTC: date-only strings parse as UTC midnight, so
    // formatting with local getters shifted the whole tint a day early
    // west of UTC (out of step with the string-compared window logic).
    const startMs = Date.parse(`${t.due_date.split("T")[0]}T00:00:00Z`);
    const endMs = Date.parse(`${t.window_end_date.split("T")[0]}T00:00:00Z`);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    if (endMs < startMs) continue;
    let cursorMs = startMs;
    let guard = 0;
    while (cursorMs <= endMs && guard++ < 400) {
      set.add(new Date(cursorMs).toISOString().split("T")[0]);
      cursorMs += 86_400_000;
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
        // Wave-20.x — tombstone fetch is no longer date-bounded. The
        // harvest ghost branch generates a ghost at the parent
        // blueprint's start_date, which can sit far outside the
        // current fetch range (e.g. a "Summer Harvest" blueprint
        // starts in June, but the Today quick link asks for July
        // only). The old range filter dropped tombstones at the
        // blueprint start_date, so a Skipped harvest task silently
        // failed to suppress its ghost and the user saw the same
        // task pop back onto Today's list. Skipped rows with
        // blueprint_id are rare enough that fetching them all is
        // negligible compared to the wrong-task pile-up.
        supabase
          .from("tasks")
          .select("blueprint_id, due_date")
          .eq("home_id", homeId)
          .eq("status", "Skipped")
          .not("blueprint_id", "is", null),
      ]);

      if (tError) throw tError;
      if (bpError) throw bpError;

      const tombstoneSet = new Set(
        (skippedTombstones ?? []).map(
          (t: any) => `${t.blueprint_id}:${t.due_date}`,
        ),
      );

      const physicalRows = physicalTasks || [];

      // Wave-20.3 — Suppression index built from EVERY physical task that
      // has a blueprint_id, BEFORE any visibility filter runs. This is
      // what the ghost loop checks below. The materialised-but-hidden
      // case (snoozed via next_check_at, or completed-outside-window) MUST
      // still suppress the ghost, otherwise the engine emits a duplicate
      // ghost at the same (blueprint_id, due_date) key and the next
      // materialisation INSERT trips the `unique_blueprint_date`
      // constraint. See docs/plans/harvest-snooze-duplicate-ghost-fix.md.
      const materialisedKeys = new Set(
        physicalRows
          .filter((t: any) => t.blueprint_id && t.due_date)
          .map((t: any) => `${t.blueprint_id}:${t.due_date}`),
      );

      // Filter historical completed tasks out of the window.
      //
      // We deliberately do NOT hide snoozed window tasks here anymore.
      // The previous filter (which dropped Pending tasks where
      // `next_check_at > today`) made the task disappear from the
      // calendar entirely — the user lost the harvest dot on its due
      // date and the row from each day's agenda for the whole window.
      // Consumers that need to suppress snoozed tasks from a
      // task-action view (the dashboard's "1 overdue" counter, the
      // home-nav badge, the today-focus card) filter on next_check_at
      // themselves so the badge counts stay clean.
      const rawTasks = physicalRows.filter((task) => {
        if (task.status !== "Completed") return true;
        const isDueInWindow =
          task.due_date >= startDateStr && task.due_date <= endDateStr;
        const timestamp = task.updated_at || task.created_at || task.due_date;
        // updated_at/created_at are UTC timestamptz — slicing the UTC date
        // and comparing to the LOCAL window strings drops/includes tasks
        // off by one day at range edges (evening completions in the
        // Americas). Convert real timestamps to the local calendar day;
        // date-only fallbacks pass through untouched.
        const completedDateStr = timestamp.includes("T")
          ? getLocalDateString(new Date(timestamp))
          : timestamp;
        const isCompletedInWindow =
          completedDateStr >= startDateStr && completedDateStr <= endDateStr;
        return isDueInWindow || isCompletedInWindow;
      });

      const bps = blueprints || [];

      // ── Harvest canonical-window dedup ──────────────────────────────────
      // Wave-21.0004 — defence-in-depth against the pre-fix `generate-tasks`
      // cron that materialised daily Pending tasks for harvest blueprints
      // without `window_end_date`. Those duplicates appear alongside the
      // canonical window task across every in-window day (the same plant
      // chip on the same day, what the user saw as "doubled up after
      // skipping"). The cron is fixed in this release + a one-shot prod
      // cleanup removes the bad rows, but this pass drops any non-window
      // Pending harvest task whose due_date falls inside a canonical
      // window from the same blueprint — so old data on cached browsers
      // or any future drift can't resurface the duplicate.
      const canonicalWindow = new Map<string, { start: string; end: string }>();
      for (const t of rawTasks) {
        if (
          (t.type === "Harvesting" || t.type === "Harvest")
          && t.window_end_date
          && t.blueprint_id
          && t.status === "Pending"
        ) {
          const existing = canonicalWindow.get(t.blueprint_id);
          if (!existing || t.due_date < existing.start) {
            canonicalWindow.set(t.blueprint_id, {
              start: t.due_date,
              end: t.window_end_date,
            });
          }
        }
      }
      const dedupedRawTasks = rawTasks.filter((t) => {
        if (!t.blueprint_id) return true;
        if (t.status !== "Pending") return true;
        if (t.type !== "Harvesting" && t.type !== "Harvest") return true;
        if (t.window_end_date) return true;
        const c = canonicalWindow.get(t.blueprint_id);
        if (!c) return true;
        return !(t.due_date >= c.start && t.due_date <= c.end);
      });

      // Generate ghost tasks from blueprints (pure JS — no DB calls).
      const ghosts: any[] = [];
      bps.forEach((bp) => {
        if (!bp.frequency_days || !bp.start_date) return;

        // Pause handling: occurrences BEFORE paused_until are skipped
        // permanently (so a past pause window never resurrects its ghosts
        // as overdue), while occurrences on/after paused_until still emit —
        // a one-week pause must not blank next month's calendar. Date-string
        // compares keep this timezone-safe.
        const pausedUntilStr = bp.paused_until
          ? String(bp.paused_until).split("T")[0]
          : null;

        // ── Harvest window branch ────────────────────────────────────────
        // Harvest blueprints with both a start_date AND end_date emit ONE
        // ghost per window — due_date is the window start, window_end_date
        // is the window close. The engine + UI then treat the task as
        // "active in window" rather than overdue-by-default. See
        // docs/app-reference/04-schedule/01-blueprint-manager.md.
        // Wave-20.6 — accept both "Harvesting" (plantScheduleFactory + the
        // current canonical name) AND the legacy "Harvest" (no -ing) used
        // by Save-to-Shed and Companion plants. Both refer to the same
        // concept; treating only one of them as windowed was the root
        // cause of "summer harvest" tasks never getting the window model.
        if (
          (bp.task_type === "Harvesting" || bp.task_type === "Harvest")
          && bp.end_date
        ) {
          // A window ghost is one long-lived task, not a per-day grid —
          // suppress it while the pause is actually active; once the pause
          // lapses the still-open window is relevant again.
          if (pausedUntilStr && todayStr < pausedUntilStr) return;

          const ghostStartIso = bp.start_date;
          const intersectsRange =
            ghostStartIso <= endDateStr && bp.end_date >= startDateStr;
          if (!intersectsRange) return;

          const alreadyExists =
            materialisedKeys.has(`${bp.id}:${ghostStartIso}`)
            || tombstoneSet.has(`${bp.id}:${ghostStartIso}`);
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

        // Grid math in pure UTC milliseconds. Date-only strings parse as
        // UTC midnight, so the previous local-getter formatting
        // (getLocalDateString) emitted every ghost a day early west of UTC
        // — which broke the (blueprint_id:due_date) dedup against
        // cron-materialised tasks and inserted wrong-date rows on
        // materialisation.
        const MS_PER_DAY = 86_400_000;
        const parseUtcMs = (s: string) =>
          Date.parse(`${String(s).split("T")[0]}T00:00:00Z`);
        const stepMs = freq * MS_PER_DAY;

        let ghostMs = parseUtcMs(bp.start_date);
        const rangeStartMs = parseUtcMs(startDateStr);
        const rangeEndMs = parseUtcMs(endDateStr);
        if (Number.isNaN(ghostMs)) return;

        if (ghostMs < rangeStartMs) {
          const diffDays = Math.ceil((rangeStartMs - ghostMs) / MS_PER_DAY);
          const cyclesToSkip = Math.ceil(diffDays / freq);
          ghostMs += cyclesToSkip * stepMs;
        }

        while (ghostMs <= rangeEndMs) {
          const ghostDateStr = new Date(ghostMs).toISOString().split("T")[0];
          if (bp.end_date && ghostDateStr > bp.end_date) break;

          // Skip occurrences inside the pause window (see comment above).
          if (pausedUntilStr && ghostDateStr < pausedUntilStr) {
            ghostMs += stepMs;
            continue;
          }

          const alreadyExists =
            materialisedKeys.has(`${bp.id}:${ghostDateStr}`)
            || tombstoneSet.has(`${bp.id}:${ghostDateStr}`);

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
          ghostMs += stepMs;
        }
      });

      // Phase 1 complete — fire all subscribers with the partial snapshot.
      const tasks = [...dedupedRawTasks, ...ghosts];
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
