// Wave 20+ snooze + harvest-window task filters.
//
// `TaskEngine.fetchTasksWithGhosts` deliberately returns tasks regardless of
// their `next_check_at` (snooze) state — every consumer that renders a
// specific date or a "still actionable today" count has to decide for itself
// what to hide. Before this helper existed each call site copy-pasted the
// rules (TaskCalendar got it right, the Dashboard's Today list + the Shed
// plant-detail glance strip got it wrong). One source of truth here, one
// snooze contract changed in one place next time.
//
// Vocabulary:
// - "today" is the local date string YYYY-MM-DD on the user's device.
// - `due_date` is the original due date.
// - `next_check_at` is set when the user picks "Not yet → N days" (snooze)
//   or when the AI ripeness signal reschedules.
// - `window_end_date` is set on harvest-window tasks. While today is between
//   the effective start (due_date OR next_check_at if it was snoozed forward)
//   and window_end_date, the task is "in window" — not overdue, not future.

export interface SnoozeableTask {
  status?: string | null;
  due_date?: string | null;
  next_check_at?: string | null;
  window_end_date?: string | null;
}

/**
 * The "effective" due date — the date the task operationally needs doing.
 * For a snooze-forward task that's the new `next_check_at`; otherwise it's
 * the original `due_date`. (A `next_check_at` earlier than `due_date` is
 * effectively a no-op and gets ignored.)
 */
function effectiveDueDate(task: SnoozeableTask): string | null {
  const due = task.due_date ?? null;
  const snooze = task.next_check_at ?? null;
  if (snooze && due && snooze > due) return snooze;
  return due;
}

/** True if `today` falls inside this task's effective harvest window. */
function isInHarvestWindow(task: SnoozeableTask, today: string): boolean {
  if (!task.window_end_date || !task.due_date) return false;
  const effectiveStart = effectiveDueDate(task) ?? task.due_date;
  return effectiveStart <= today && today <= task.window_end_date;
}

/**
 * Should this task appear in a list for `dateStr`?
 *
 * Matches TaskCalendar's dot-rendering logic so every list-style consumer
 * (Dashboard Today, Calendar agenda, Location page, mobile shell) shows
 * the same picture for a given day.
 *
 * Snooze contract: a "Not yet → N days" snooze shifts the task's
 * effective due date forward. The task is hidden between the original
 * due date and the new snooze date, then reappears on the snooze date
 * itself — that's why we use the effective due date rather than the raw
 * `due_date` column.
 */
export function isTaskVisibleOnDate(
  task: SnoozeableTask,
  dateStr: string,
  opts: { includeOverdue?: boolean } = {},
): boolean {
  // Skipped tasks are user-archived; not actionable.
  if (task.status === "Skipped") return false;
  // Harvest window — visible from effective start through window end.
  if (task.window_end_date && task.due_date) {
    return isInHarvestWindow(task, dateStr);
  }
  const effective = effectiveDueDate(task);
  if (!effective) return false;
  if (opts.includeOverdue) return effective <= dateStr;
  return effective === dateStr;
}

/**
 * Is this task overdue *as of today* — i.e. should it count in an
 * "X overdue" badge?
 *
 * Definitions:
 * - Completed / Skipped → never overdue.
 * - Harvest still in window → not overdue (it's "ready", not "missed").
 * - Effective due date (snooze-aware) in the future or today → not overdue.
 * - Otherwise → overdue.
 */
export function isTaskOverdueToday(
  task: SnoozeableTask,
  todayStr: string,
): boolean {
  if (task.status === "Completed" || task.status === "Skipped") return false;
  // Harvest window: not overdue while we're still inside it.
  if (task.window_end_date && task.due_date) {
    if (isInHarvestWindow(task, todayStr)) return false;
    // Past the window — fall through to the standard "missed" check below.
  }
  const effective = effectiveDueDate(task);
  return !!effective && effective < todayStr;
}
