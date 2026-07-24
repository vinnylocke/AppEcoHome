// Pure resolver for "a home's actionable tasks for a given day" — the data the
// Wear companion (and any thin client) needs without re-implementing the
// browser ghost engine (src/lib/taskEngine.ts).
//
// Two kinds of ghost are projected here so the watch matches the app for ANY
// day the user browses to:
//   • Seasonal WINDOW ghosts (Harvesting/Harvest/Pruning) — the frontend engine
//     owns these as ONE task per window; the cron never materialises them.
//   • FREQUENCY recurring ghosts — the `generate-tasks` cron only materialises
//     these ~7 days ahead, so a day further out (e.g. browsing three weeks on)
//     has no persisted row yet. We mirror that cron's grid (start + k·freq,
//     window-bounded, pause-aware, annual re-anchored) for the single viewed
//     day so upcoming recurring tasks show. For today+past those rows are
//     already materialised, so this pass only runs for date >= today (and
//     suppresses itself when a real row exists).
// See docs/wear-os-companion-plan.md §6.

import { projectAnnualWindows } from "./annualWindows.ts";

const DAY_MS = 86_400_000;

/** Parse a YYYY-MM-DD at noon UTC — matches generate-tasks' parseSafeDate so
 *  day arithmetic is exact and DST-free. */
function dayMs(dateStr: string): number {
  return Date.parse(`${String(dateStr).slice(0, 10)}T12:00:00Z`);
}

/** Seasonal window task types — mirror of generate-tasks / windowTasks. */
export const SEASONAL_WINDOW_TYPES = new Set(["Harvesting", "Harvest", "Pruning"]);

export interface PersistedTaskRow {
  id: string;
  blueprint_id: string | null;
  title: string;
  type?: string | null;
  task_type?: string | null;
  due_date: string;
  status: string;
  window_end_date?: string | null;
}

export interface WindowBlueprintRow {
  id: string;
  title: string;
  task_type: string;
  start_date: string;
  end_date: string;
  recurrence_kind?: string | null;
  recurs_until?: string | null;
}

/** A recurring blueprint with a frequency grid (Watering, Feeding, …). */
export interface FreqBlueprintRow {
  id: string;
  title: string;
  task_type: string;
  start_date: string;
  end_date: string | null;
  frequency_days: number | null;
  paused_until?: string | null;
  recurrence_kind?: string | null;
  recurs_until?: string | null;
}

export interface WatchTask {
  /** Real task id, or `ghost-<blueprintId>-<windowStart>` for a window ghost. */
  id: string;
  blueprint_id: string | null;
  title: string;
  type: string | null;
  /** YYYY-MM-DD. */
  due_date: string;
  status: string;
  is_ghost: boolean;
  /** Populated for seasonal-window ghosts (the window end). */
  window_end_date: string | null;
  overdue: boolean;
}

/** Is a persisted (pending) task overdue as of `today`? A window task
 *  (harvest/pruning) is NOT overdue while its window is still open. */
function isOverdue(t: PersistedTaskRow, today: string): boolean {
  const due = t.due_date.slice(0, 10);
  const windowOpen = t.window_end_date != null && t.window_end_date.slice(0, 10) >= today;
  return t.status === "Pending" && due < today && !windowOpen;
}

function toWatchTask(t: PersistedTaskRow, today: string): WatchTask {
  return {
    id: t.id,
    blueprint_id: t.blueprint_id ?? null,
    title: t.title,
    type: t.type ?? t.task_type ?? null,
    due_date: t.due_date.slice(0, 10),
    status: t.status,
    is_ghost: false,
    window_end_date: t.window_end_date ?? null,
    overdue: isOverdue(t, today),
  };
}

/** Is `date` an occurrence on the frequency grid anchored at `anchor`
 *  (anchor + k·freq days), within [anchor, windowEnd], honouring `pausedUntil`?
 *  Mirrors generate-tasks' materialiseGrid for a single day. */
function onFrequencyGrid(
  date: string,
  anchor: string,
  freq: number,
  windowEnd: string | null,
  pausedUntil: string | null,
): boolean {
  const d = dayMs(date);
  const a = dayMs(anchor);
  if (d < a) return false;
  if (windowEnd && d > dayMs(windowEnd)) return false;
  // Occurrences inside a pause window are skipped permanently.
  if (pausedUntil && d < dayMs(pausedUntil)) return false;
  return (d - a) % (freq * DAY_MS) === 0;
}

/**
 * Resolve the tasks for a single calendar day `date` — across ALL statuses, so
 * the watch can show To-do (Pending), Done (Completed) and Overdue. When `date`
 * is today, pending tasks that were due earlier are also carried in as overdue.
 *
 * @param date      YYYY-MM-DD — the day being viewed.
 * @param today     YYYY-MM-DD — the caller's actual local today (for overdue).
 * @param dayTasks  Tasks with `due_date == date` (any status), scope-filtered by the caller.
 * @param overdueTasks  Pending tasks with `due_date < today` (only when date == today), scope-filtered.
 * @param windowBlueprints  Active seasonal-window blueprints (scope-filtered).
 * @param freqBlueprints  Active recurring frequency blueprints (scope-filtered). Optional.
 * @param suppressed  Set of `${blueprint_id}|${date}` that already have a task row.
 */
export function resolveDayTasks(args: {
  date: string;
  today: string;
  dayTasks: PersistedTaskRow[];
  overdueTasks: PersistedTaskRow[];
  windowBlueprints: WindowBlueprintRow[];
  freqBlueprints?: FreqBlueprintRow[];
  suppressed: Set<string>;
}): WatchTask[] {
  const { date, today, dayTasks, overdueTasks, windowBlueprints, suppressed } = args;
  const freqBlueprints = args.freqBlueprints ?? [];

  const out: WatchTask[] = [
    ...overdueTasks.map((t) => toWatchTask(t, today)),
    ...dayTasks.map((t) => toWatchTask(t, today)),
  ];

  // Seasonal-window ghosts whose window contains `date` (suppressed if acted on).
  for (const bp of windowBlueprints) {
    if (!SEASONAL_WINDOW_TYPES.has(bp.task_type) || !bp.end_date) continue;

    const isAnnual =
      bp.recurrence_kind === "annual" || bp.recurrence_kind === "lifecycle_capped";
    const windows = isAnnual
      ? projectAnnualWindows(bp.start_date, bp.end_date, date, date, today, {
          recursUntil: bp.recurs_until ?? null,
        })
      : [{ start: bp.start_date.slice(0, 10), end: bp.end_date.slice(0, 10) }];

    for (const w of windows) {
      if (date < w.start || date > w.end) continue;
      if (suppressed.has(`${bp.id}|${w.start}`)) continue;
      out.push({
        id: `ghost-${bp.id}-${w.start}`,
        blueprint_id: bp.id,
        title: bp.title,
        type: bp.task_type,
        due_date: w.start,
        status: "Pending",
        is_ghost: true,
        window_end_date: w.end,
        overdue: false,
      });
    }
  }

  // Frequency-recurring ghosts — only for today+future (the cron has already
  // materialised today+past). Mirrors generate-tasks' grid so the watch shows
  // the same upcoming recurring tasks the app projects beyond the cron horizon.
  if (date >= today) {
    for (const bp of freqBlueprints) {
      // Seasonal window types are handled by the window pass above (mirror the
      // cron's skip so we never emit both a window ghost and a freq ghost).
      if (SEASONAL_WINDOW_TYPES.has(bp.task_type) && bp.end_date) continue;
      const freq = bp.frequency_days;
      if (!freq || freq <= 0) continue;
      if (suppressed.has(`${bp.id}|${date}`)) continue;

      const pausedUntil = bp.paused_until ? bp.paused_until.slice(0, 10) : null;
      const isAnnual =
        bp.recurrence_kind === "annual" || bp.recurrence_kind === "lifecycle_capped";

      let hit = false;
      if (isAnnual && bp.end_date) {
        // Re-anchor the grid at each projected year's window start (like the cron).
        const windows = projectAnnualWindows(bp.start_date, bp.end_date, date, date, today, {
          recursUntil: bp.recurs_until ?? null,
        });
        for (const w of windows) {
          if (onFrequencyGrid(date, w.start, freq, w.end, pausedUntil)) {
            hit = true;
            break;
          }
        }
      } else {
        hit = onFrequencyGrid(
          date,
          bp.start_date.slice(0, 10),
          freq,
          bp.end_date ? bp.end_date.slice(0, 10) : null,
          pausedUntil,
        );
      }
      if (!hit) continue;

      out.push({
        id: `ghost-${bp.id}-${date}`,
        blueprint_id: bp.id,
        title: bp.title,
        type: bp.task_type,
        due_date: date,
        status: "Pending",
        is_ghost: true,
        window_end_date: null,
        overdue: false,
      });
    }
  }

  // Group order: overdue → to-do (Pending) → done (Completed) → other; title within.
  const rank = (t: WatchTask) =>
    t.overdue ? 0 : t.status === "Pending" ? 1 : t.status === "Completed" ? 2 : 3;
  out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title));
  return out;
}
