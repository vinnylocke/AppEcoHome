// Pure count helpers for the `home-dashboard-stats` edge function.
//
// Extracted so the RHO-14 / RHO-15 / RHO-16 logic is unit-testable in
// Deno without a live database (see supabase/tests/dashboardStats.test.ts).
// The edge function passes rows it has already fetched; these helpers
// never touch the network.
//
// Wave-20 task contract (mirrored from `_shared/taskFilters.ts`):
//   - A "Not yet" snooze sets `next_check_at = due + N`; the task's
//     EFFECTIVE due date shifts forward to `next_check_at` while snoozed.
//   - A harvest window task carries `window_end_date`; it is "active"
//     (not overdue) for every day from its effective start through
//     `window_end_date`.

export interface StatTask {
  id: string;
  status?: string | null;
  type?: string | null;
  due_date?: string | null;
  next_check_at?: string | null;
  window_end_date?: string | null;
  completed_at?: string | null;
  auto_completed_reason?: string | null;
  inventory_item_ids?: string[] | null;
  blueprint_id?: string | null;
}

const DONE = new Set(["Completed", "Skipped"]);
const HARVEST_TYPES = new Set(["Harvesting", "Harvest"]);

/**
 * The user's LOCAL calendar date of `completed_at`. The column is a UTC
 * timestamptz while weekStart/weekEnd/today are the client's local dates —
 * slicing the raw UTC date drops evening completions into the next local
 * day (a Saturday-20:00 completion in the Americas fell out of that week).
 * `tzOffsetMinutes` is the client's `new Date().getTimezoneOffset()`
 * (positive west of UTC).
 */
export function completedDateLocal(
  t: StatTask,
  tzOffsetMinutes: number,
): string | null {
  if (!t.completed_at) return null;
  const ms = Date.parse(t.completed_at);
  if (Number.isNaN(ms)) return t.completed_at.slice(0, 10);
  return new Date(ms - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Effective due date — shifted forward to the snooze date when snoozed. */
export function effectiveDueDate(t: StatTask): string | null {
  const due = t.due_date ?? null;
  const snooze = t.next_check_at ?? null;
  if (snooze && due && snooze > due) return snooze;
  return due;
}

function effectiveStart(t: StatTask): string | null {
  return effectiveDueDate(t) ?? t.due_date ?? null;
}

/** Is `t` a harvest-window task whose window covers `dateStr`? */
export function isWindowActiveOn(t: StatTask, dateStr: string): boolean {
  if (!t.window_end_date || !t.due_date) return false;
  const start = effectiveStart(t);
  return start != null && start <= dateStr && dateStr <= t.window_end_date;
}

/**
 * Overdue = an open task whose effective due date is strictly before
 * `today`, and which is neither snoozed past today nor inside an active
 * harvest window. This is unbounded in the past — RHO-14's "overdue no
 * matter how old" requirement is met because the caller now fetches
 * overdue rows from before weekStart too.
 */
export function isOverdue(t: StatTask, today: string): boolean {
  if (t.status && DONE.has(t.status)) return false;
  // Snoozed forward past today → hidden, not overdue.
  const snooze = t.next_check_at ?? null;
  if (snooze && snooze > today) return false;
  // Inside an active harvest window → active, not overdue.
  if (t.window_end_date && t.due_date && isWindowActiveOn(t, today)) return false;
  // Past a harvest window's end → overdue (window closed unactioned).
  if (t.window_end_date && t.due_date) {
    return t.window_end_date < today;
  }
  const eff = effectiveDueDate(t);
  return eff != null && eff < today;
}

/** Pending = open, not overdue, not snoozed-past-today. */
export function isPending(t: StatTask, today: string): boolean {
  if (t.status && DONE.has(t.status)) return false;
  const snooze = t.next_check_at ?? null;
  if (snooze && snooze > today) return false;
  return !isOverdue(t, today);
}

/** Does this task's effective span intersect the [weekStart, weekEnd] ISO week? */
export function intersectsWeek(t: StatTask, weekStart: string, weekEnd: string): boolean {
  const start = effectiveStart(t);
  if (start == null) return false;
  // Harvest window: [start .. window_end_date] must overlap the week.
  if (t.window_end_date) {
    return start <= weekEnd && t.window_end_date >= weekStart;
  }
  return start >= weekStart && start <= weekEnd;
}

export interface TaskStats {
  total: number;
  overdue: number;
  pending: number;
  /**
   * RHO-14 "additional count" (interpretation for on-device verification):
   * a lightweight carried-over/activity stat surfaced at the top of the
   * Tasks-This-Week section. `priorOverdue` = open tasks whose effective
   * due date is before weekStart (i.e. carried in from earlier weeks);
   * `completedThisWeek` = tasks completed within this week. These are NOT
   * folded into `total`/`pending` (which stay week-scoped) so the headline
   * numbers keep their existing meaning.
   *
   * NOTE: the Deno function does not materialise ghost (virtual) tasks, so
   * blueprints without a persisted row for this week are not reflected here
   * — a known limitation to verify on-device.
   */
  priorOverdue: number;
  completedThisWeek: number;
}

/**
 * Compute the "Tasks This Week" headline stats over the WIDENED task set
 * (`due_date <= weekEnd OR window_end_date >= weekStart`).
 *
 * - `total` / `pending` stay week-scoped: only tasks whose effective span
 *   intersects the current ISO week are counted, so the headline keeps its
 *   "this week" meaning.
 * - `overdue` is computed over the FULL set (all not-Completed/Skipped with
 *   effective due < today), so overdue-from-prior-weeks is reflected (RHO-14).
 */
export function computeTaskStats(
  tasks: StatTask[],
  weekStart: string,
  weekEnd: string,
  today: string,
  tzOffsetMinutes = 0,
): TaskStats {
  let overdue = 0;
  let pending = 0;
  let total = 0;
  let priorOverdue = 0;
  let completedThisWeek = 0;

  for (const t of tasks) {
    const inWeek = intersectsWeek(t, weekStart, weekEnd);

    if (isOverdue(t, today)) {
      overdue += 1;
      const eff = effectiveDueDate(t) ?? t.due_date ?? null;
      if (eff != null && eff < weekStart) priorOverdue += 1;
    }

    if (inWeek) {
      if (!t.status || t.status !== "Skipped") total += 1;
      if (isPending(t, today)) pending += 1;
    }

    if (t.status === "Completed") {
      const done = completedDateLocal(t, tzOffsetMinutes);
      if (done != null && done >= weekStart && done <= weekEnd) completedThisWeek += 1;
    }
  }

  return { total, overdue, pending, priorOverdue, completedThisWeek };
}

/**
 * "Done today" for the Home status strip's "X of Y done today" headline.
 *
 * Completion-oriented (NOT the day-strip's due-date bucketing): a task counts
 * if it is Completed AND either
 *   - it was completed today (local `completed_at` === today), so clearing an
 *     OVERDUE or harvest task today is reflected, or
 *   - its effective due date is today (so a today task ticked a touch early
 *     still counts).
 * Distinct per task, so a due-today-and-done-today task is counted once.
 *
 * This intentionally diverges from `computeDayStrip`, whose per-day
 * `completedOnTime/Late` buckets stay due-date-based (correct for the weekly
 * strip). Pending (the denominator's other half) still comes from the
 * ghost-aware CLIENT count; see `src/lib/todaySummary.ts`.
 */
export function computeDoneToday(
  tasks: StatTask[],
  today: string,
  tzOffsetMinutes = 0,
): number {
  let done = 0;
  for (const t of tasks) {
    if (t.status !== "Completed") continue;
    const completedToday = completedDateLocal(t, tzOffsetMinutes) === today;
    const dueToday = effectiveDueDate(t) === today;
    if (completedToday || dueToday) done += 1;
  }
  return done;
}

export interface DayBucket {
  date: string;
  total: number;
  completedOnTime: number;
  completedLate: number;
  overdue: number;
  pending: number;
  /** RHO-20 — tasks Skipped, bucketed on their effective due day. Skipped
   *  tasks are persisted tombstones (never ghosts), so the server sees them. */
  skipped: number;
  /** RHO-20 — open plain tasks snoozed forward off their ORIGINAL due day
   *  (counted on the original due day; the effective span sits later). */
  postponed: number;
  isPast: boolean;
  isToday: boolean;
}

/**
 * RHO-15 — build the 7-day Week Overview strip over the widened task set.
 *
 * - Prior-week overdue (effective due < weekStart, still open, not snoozed
 *   forward) rolls onto the FIRST day of the strip (the Sunday bucket).
 * - Harvest-window tasks count on EVERY in-window day, not just `due_date`.
 * - Each day shows both overdue and pending buckets.
 */
export function computeDayStrip(
  tasks: StatTask[],
  weekStart: string,
  weekEnd: string,
  today: string,
  tzOffsetMinutes = 0,
): DayBucket[] {
  const days: string[] = [];
  const cursor = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${weekEnd}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const sunday = days[0];
  const strip: DayBucket[] = days.map((ds) => ({
    date: ds,
    total: 0,
    completedOnTime: 0,
    completedLate: 0,
    overdue: 0,
    pending: 0,
    skipped: 0,
    postponed: 0,
    isPast: ds < today,
    isToday: ds === today,
  }));
  const byDate = new Map(strip.map((d) => [d.date, d]));

  // Prior-week overdue → roll onto the Sunday bucket.
  const sundayBucket = byDate.get(sunday);
  if (sundayBucket) {
    for (const t of tasks) {
      // Window tasks whose window reaches into this week are handled by the
      // per-day branch below — rolling them up here too double-counted a
      // closed straddling window (once on Sunday + once per in-window day).
      if (t.window_end_date && t.window_end_date >= weekStart) continue;
      if (!isOverdue(t, today)) continue;
      const eff = effectiveDueDate(t) ?? t.due_date ?? null;
      if (eff != null && eff < weekStart) {
        sundayBucket.overdue += 1;
        sundayBucket.total += 1;
      }
    }
  }

  for (const ds of days) {
    const bucket = byDate.get(ds)!;
    for (const t of tasks) {
      // RHO-20 — Skipped tasks are bucketed on their effective due day and
      // tallied separately (they're set-aside, not "to do" nor "done"). They
      // stay OUT of `total`/`pending`/`overdue` so those keep their meaning.
      if (t.status === "Skipped") {
        const effSkip = effectiveDueDate(t);
        if (effSkip != null && effSkip.slice(0, 10) === ds) bucket.skipped += 1;
        continue;
      }

      // RHO-20 — Postponed: an open plain task snoozed FORWARD off its original
      // due day. Counted on the ORIGINAL due day (its effective span now sits
      // later, so it isn't otherwise bucketed here). Additive: a snoozed-past-
      // today task is neither pending nor overdue for this bucket.
      if (!t.window_end_date && !(t.status && DONE.has(t.status))) {
        const snooze = t.next_check_at ?? null;
        const orig = t.due_date ? t.due_date.slice(0, 10) : null;
        if (snooze && t.due_date && snooze > t.due_date && snooze > today && orig === ds) {
          bucket.postponed += 1;
        }
      }

      // Harvest-window task: present on every in-window day within the week.
      if (t.window_end_date && t.due_date) {
        if (!isWindowActiveOn(t, ds)) continue;
        bucket.total += 1;
        if (t.status === "Completed") {
          // "Late" for a window task means completed AFTER the window
          // closed — not after the per-day cursor (which painted orange
          // "late" pips on in-window days before the completion date).
          const done = completedDateLocal(t, tzOffsetMinutes);
          if (done != null && done > t.window_end_date) bucket.completedLate += 1;
          else bucket.completedOnTime += 1;
        } else if (ds < today && !isWindowActiveOn(t, today)) {
          bucket.overdue += 1;
        } else {
          bucket.pending += 1;
        }
        continue;
      }

      // Plain task: bucket on its EFFECTIVE due day (snooze-aware).
      const eff = effectiveDueDate(t);
      if (eff == null || eff.slice(0, 10) !== ds) continue;
      bucket.total += 1;
      if (t.status === "Completed") {
        const done = completedDateLocal(t, tzOffsetMinutes);
        if (done != null && done <= ds) bucket.completedOnTime += 1;
        else bucket.completedLate += 1;
      } else if (ds < today) {
        bucket.overdue += 1;
      } else {
        bucket.pending += 1;
      }
    }
  }

  return strip;
}

/**
 * RHO-16 — subject-keyed dedup for harvest counts.
 *
 * "Harvests Due" = distinct plants + each unlinked harvest counts as 1.
 * A harvest task covering multiple plants counts once per distinct plant;
 * a harvest with no plant link still counts (as one), and recurring
 * unlinked harvests dedupe by blueprint.
 */
function harvestSubjectCount(tasks: StatTask[]): number {
  const keys = new Set<string>();
  for (const t of tasks) {
    if (t.inventory_item_ids && t.inventory_item_ids.length > 0) {
      for (const id of t.inventory_item_ids) keys.add(`plant:${id}`);
    } else {
      keys.add(`harvest:${t.blueprint_id ?? t.id}`);
    }
  }
  return keys.size;
}

export interface HarvestCounts {
  due: number;
  completed: number;
}

/**
 * RHO-16 — count harvests whose window overlaps this ISO week.
 *
 * `due`  = open harvests (status ∉ Completed/Skipped) overlapping the week,
 *          counted by distinct plant / unlinked-harvest subject.
 * `completed` = harvests completed this week, counted on the same basis.
 */
export function computeHarvestCounts(
  tasks: StatTask[],
  weekStart: string,
  weekEnd: string,
): HarvestCounts {
  const harvests = tasks.filter(
    (t) => HARVEST_TYPES.has(t.type ?? "") && intersectsWeek(t, weekStart, weekEnd),
  );
  const due = harvestSubjectCount(
    harvests.filter((t) => !(t.status && DONE.has(t.status))),
  );
  const completed = harvestSubjectCount(
    harvests.filter((t) => t.status === "Completed"),
  );
  return { due, completed };
}
