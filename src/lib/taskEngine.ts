import { supabase } from "./supabase";
import { readSnapshot, writeSnapshot } from "./snapshotCache";
import { isOffline } from "../hooks/useOnline";
import { isSeasonalWindowType } from "./windowTasks";

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
// Offline-first (Phase 5): persistent raw-input snapshot
// ---------------------------------------------------------------------------
//
// Every other screen has a localStorage snapshot; the task engine was the
// last one that fetched-on-mount and so couldn't render offline. We cache
// the RAW fetch inputs (physical tasks + full blueprint list + skip
// tombstones) per home, then rebuild the rendered list — including ghost
// generation, which is pure JS — from the cache when a fetch fails offline.
// Caching raw inputs (not the rendered output) means an offline-created
// one-off task or routine can be injected and every view re-derives ghosts
// from it consistently.

const TASKS_SNAPSHOT = "tasks";

interface RawTaskSnapshot {
  physicalTasks: any[];
  blueprints: any[];
  skippedTombstones: any[];
}

/** Mirror of the SQL predicate in `run()`'s tasks query, applied to cached
 *  rows in the offline path so a narrower/wider requested range still shows
 *  the right physical tasks. Online rows are already SQL-filtered, so this is
 *  offline-only — `buildRenderTasks` receives range-filtered physicals in
 *  both paths and its output stays identical. */
function filterPhysicalsToRange(rows: any[], args: FetchArgs): any[] {
  const { startDateStr, endDateStr, includeOverdue = false } = args;
  return rows.filter((t) => {
    if (t.status === "Skipped") return false;
    if (!t.due_date) return false;
    if (t.due_date > endDateStr) return false;
    if (!includeOverdue) {
      const inWindow =
        t.due_date >= startDateStr ||
        (t.window_end_date && t.window_end_date >= startDateStr);
      if (!inWindow) return false;
    }
    return true;
  });
}

/**
 * The pure-JS core of the engine: given the raw fetch inputs, produce the
 * rendered task list (physical rows + generated ghosts) plus the blueprint
 * list. Extracted verbatim from `run()` so BOTH the online path (post-fetch)
 * and the offline path (from the cached snapshot) produce identical output.
 * No DB calls, no side effects.
 */
export function buildRenderTasks(input: {
  physicalTasks: any[];
  blueprints: any[];
  skippedTombstones: any[];
  startDateStr: string;
  endDateStr: string;
  todayStr: string;
}): { tasks: any[]; bps: any[]; rawTasks: any[] } {
  const { physicalTasks, blueprints, skippedTombstones, startDateStr, endDateStr, todayStr } = input;

  const tombstoneSet = new Set(
    (skippedTombstones ?? []).map(
      (t: any) => `${t.blueprint_id}:${t.due_date}`,
    ),
  );

  const physicalRows = physicalTasks || [];

  const materialisedKeys = new Set(
    physicalRows
      .filter((t: any) => t.blueprint_id && t.due_date)
      .map((t: any) => `${t.blueprint_id}:${t.due_date}`),
  );

  // Per-blueprint list of every real (physical + skip-tombstone) task due_date,
  // so the seasonal-window branch can suppress its ghost when the blueprint
  // already has ANY task inside the window — not only one exactly at the window
  // start. Pre-existing pruning/harvest rows sit on arbitrary in-window days
  // (materialised daily by the old cron, then completed), so an exact-date
  // check emitted a phantom window ghost alongside the completed task.
  const dueDatesByBlueprint = new Map<string, string[]>();
  const pushDue = (bpId?: string | null, due?: string | null) => {
    if (!bpId || !due) return;
    const arr = dueDatesByBlueprint.get(bpId);
    if (arr) arr.push(due);
    else dueDatesByBlueprint.set(bpId, [due]);
  };
  physicalRows.forEach((t: any) => pushDue(t.blueprint_id, t.due_date));
  (skippedTombstones ?? []).forEach((t: any) => pushDue(t.blueprint_id, t.due_date));

  const rawVisible = physicalRows.filter((task) => {
    if (task.status !== "Completed") return true;
    const isDueInWindow =
      task.due_date >= startDateStr && task.due_date <= endDateStr;
    // Use completed_at for "when was this completed" — tasks has NO updated_at
    // column, so the old `task.updated_at` was always undefined and this fell
    // back to created_at, making a task completed today but due earlier vanish
    // from today's list instead of showing "completed today" (bug-audit
    // 2026-07-10 #11).
    const timestamp = task.completed_at || task.created_at || task.due_date;
    const completedDateStr = timestamp.includes("T")
      ? getLocalDateString(new Date(timestamp))
      : timestamp;
    const isCompletedInWindow =
      completedDateStr >= startDateStr && completedDateStr <= endDateStr;
    // A completed SEASONAL WINDOW task (harvest/pruning) stays visible for the
    // whole time its window overlaps the range — otherwise a task completed
    // early in the window vanished the next day ("it disappeared"). It renders
    // with its "Harvest/Pruning completed {date}" chip until the window closes.
    const windowStillOpen =
      !!task.window_end_date &&
      task.window_end_date >= startDateStr &&
      task.due_date <= endDateStr;
    return isDueInWindow || isCompletedInWindow || windowStillOpen;
  });

  // Collapse duplicate COMPLETED window tasks to ONE per (blueprint_id,
  // window_end_date). Under the pre-window model a pruning/harvest blueprint
  // materialised a task PER DAY; a user who completed several now has multiple
  // completed rows for the same window, and the "stays visible in-window" rule
  // above would render all of them (e.g. "8 completed pruning today"). Keep the
  // earliest-due representative so a single "…completed" entry shows. Distinct
  // blueprints/windows are untouched (different keys).
  const completedWindowRep = new Map<string, any>();
  for (const t of rawVisible) {
    if (t.status !== "Completed" || !t.blueprint_id || !t.window_end_date) continue;
    const key = `${t.blueprint_id}:${t.window_end_date}`;
    const cur = completedWindowRep.get(key);
    if (!cur || (t.due_date && cur.due_date && t.due_date < cur.due_date)) {
      completedWindowRep.set(key, t);
    }
  }
  const rawTasks =
    completedWindowRep.size === 0
      ? rawVisible
      : rawVisible.filter((t) => {
          if (t.status !== "Completed" || !t.blueprint_id || !t.window_end_date) return true;
          return completedWindowRep.get(`${t.blueprint_id}:${t.window_end_date}`) === t;
        });

  const bps = blueprints || [];

  // ── Harvest canonical-window dedup ──────────────────────────────────
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

    const pausedUntilStr = bp.paused_until
      ? String(bp.paused_until).split("T")[0]
      : null;

    // ── Seasonal window branch (Harvesting/Harvest + Pruning) ─────────
    // A windowed blueprint with start_date + end_date emits ONE ghost per
    // window (due_date = window start, window_end_date = close), active
    // across the whole window rather than overdue-by-default. Pruning
    // joined harvest here in 2026-07 — a seasonal pruning is one window
    // task, not a task per day. Single source: `windowTasks.ts`.
    if (isSeasonalWindowType(bp.task_type) && bp.end_date) {
      if (pausedUntilStr && todayStr < pausedUntilStr) return;

      const ghostStartIso = bp.start_date;
      const intersectsRange =
        ghostStartIso <= endDateStr && bp.end_date >= startDateStr;
      if (!intersectsRange) return;

      // Window-aware suppression: a real task ANYWHERE inside [start, end]
      // means this window already has its representative task — don't emit a
      // duplicate ghost. (Covers the exact-window-start case too.)
      const hasWindowTask = (dueDatesByBlueprint.get(bp.id) ?? []).some(
        (d) => d >= ghostStartIso && d <= bp.end_date,
      );
      if (hasWindowTask) return;

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

  return { tasks: [...dedupedRawTasks, ...ghosts], bps, rawTasks };
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
   * Offline-first (Phase 5): inject an offline-created one-off task into the
   * persistent raw snapshot and drop the in-memory cache for the home, so the
   * next fetch/peek from ANY task view rebuilds from the snapshot and shows
   * the task immediately (before its queued insert syncs). The queued insert
   * reconciles on reconnect (idempotent upsert). Safe no-op if no snapshot
   * exists yet (nothing has been fetched for the home).
   */
  injectOfflineTask(homeId: string, taskRow: any): void {
    const snap = readSnapshot<RawTaskSnapshot>(TASKS_SNAPSHOT, homeId);
    if (!snap) return;
    // Replace-by-id (dedupe then prepend) so re-injecting an edited row
    // updates in place instead of duplicating; harmless for a fresh create.
    const physicalTasks = [
      taskRow,
      ...(snap.data.physicalTasks || []).filter((t: any) => t.id !== taskRow.id),
    ];
    writeSnapshot<RawTaskSnapshot>(TASKS_SNAPSHOT, homeId, { ...snap.data, physicalTasks });
    TaskEngine.invalidateCache(homeId);
  },

  /**
   * Offline-first (Phase 5): inject an offline-created recurring blueprint
   * into the snapshot. Because ghosts are generated purely in JS from the
   * blueprint list, this makes the routine's upcoming tasks appear across
   * every view instantly — no persisted task rows needed until the
   * `generate-tasks` cron / a reconnect materialises them.
   */
  injectOfflineBlueprint(homeId: string, blueprintRow: any): void {
    const snap = readSnapshot<RawTaskSnapshot>(TASKS_SNAPSHOT, homeId);
    if (!snap) return;
    // Replace-by-id so an offline routine EDIT updates the blueprint in place
    // (its ghosts then regenerate from the new values) rather than adding a
    // duplicate; a fresh create simply prepends.
    const blueprints = [
      blueprintRow,
      ...(snap.data.blueprints || []).filter((b: any) => b.id !== blueprintRow.id),
    ];
    writeSnapshot<RawTaskSnapshot>(TASKS_SNAPSHOT, homeId, { ...snap.data, blueprints });
    TaskEngine.invalidateCache(homeId);
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

      // Offline fallback (offline-first Phase 5): serve the cached raw
      // snapshot instead of hitting the network, so every task view renders
      // offline from one shared source and offline-created tasks/routines
      // (injected into the snapshot) show immediately. Round 2 (inventory
      // thumbnails + dependency badges) is skipped offline and fills in on
      // reconnect. Two triggers: known-offline before we attempt, and a
      // thrown/returned fetch error while offline (flaky signal).
      const serveOffline = (): FullResult | null => {
        const snap = readSnapshot<RawTaskSnapshot>(TASKS_SNAPSHOT, homeId);
        if (!snap) return null;
        const offline = buildRenderTasks({
          physicalTasks: filterPhysicalsToRange(snap.data.physicalTasks || [], args),
          blueprints: snap.data.blueprints || [],
          skippedTombstones: snap.data.skippedTombstones || [],
          startDateStr,
          endDateStr,
          todayStr,
        });
        const offlineSnapshot: Phase1Snapshot = { tasks: offline.tasks, blueprints: offline.bps };
        entry.phase1Snapshot = offlineSnapshot;
        for (const cb of entry.phase1Callbacks) {
          try { cb(offlineSnapshot); } catch { /* swallow — callback must not break the engine */ }
        }
        const offlineFull: FullResult = {
          tasks: offline.tasks,
          inventoryDict: {},
          blockedTaskIds: new Set<string>(),
        };
        cache.set(key, { full: offlineFull, fetchedAt: Date.now() });
        return offlineFull;
      };

      // Known-offline: don't even attempt the network — serve the snapshot if
      // we have one (a fresh install with no snapshot falls through and lets
      // the fetch surface its own error).
      if (isOffline()) {
        const served = serveOffline();
        if (served) return served;
      }

      let physicalTasks: any[] | null;
      let blueprints: any[] | null;
      let skippedTombstones: any[] | null;
      let tError: unknown;
      let bpError: unknown;
      let tsError: unknown;
      try {
        [
          { data: physicalTasks, error: tError },
          { data: blueprints, error: bpError },
          { data: skippedTombstones, error: tsError },
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
      } catch (netErr) {
        // Network threw (real offline / dropped signal). Serve the snapshot
        // if we have one; otherwise surface the error.
        const served = serveOffline();
        if (served) return served;
        throw netErr;
      }

      // Returned (non-throwing) error while offline — same fallback.
      if ((tError || bpError || tsError) && isOffline()) {
        const served = serveOffline();
        if (served) return served;
      }

      if (tError) throw tError;
      if (bpError) throw bpError;

      // Persist the raw fetch inputs so task views render offline next time,
      // and so an offline-created one-off task / routine can be injected into
      // them (see injectOfflineTask / injectOfflineBlueprint). SKIP the write if
      // the tombstones query errored (returns null without throwing) — persisting
      // an empty suppression set poisons the snapshot so Skipped/postponed
      // occurrences resurrect on every offline render (bug-audit-2026-07-10 #15).
      // Keep the previous good snapshot; this render tolerates the gap and the
      // next clean fetch repairs it.
      if (!tsError) {
        writeSnapshot<RawTaskSnapshot>(TASKS_SNAPSHOT, homeId, {
          physicalTasks: physicalTasks || [],
          blueprints: blueprints || [],
          skippedTombstones: skippedTombstones || [],
        });
      }

      // Pure-JS render (ghost generation + harvest dedup) — shared with the
      // offline path above so both produce identical output.
      const built = buildRenderTasks({
        physicalTasks: physicalTasks || [],
        blueprints: blueprints || [],
        skippedTombstones: skippedTombstones || [],
        startDateStr,
        endDateStr,
        todayStr,
      });
      const rawTasks = built.rawTasks;
      const bps = built.bps;

      // Phase 1 complete — fire all subscribers with the partial snapshot.
      const tasks = built.tasks;
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
