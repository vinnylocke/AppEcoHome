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

/** True if `today` falls inside this task's effective harvest window. */
function isInHarvestWindow(task: SnoozeableTask, today: string): boolean {
  if (!task.window_end_date || !task.due_date) return false;
  const effectiveStart =
    task.next_check_at && task.next_check_at > task.due_date
      ? task.next_check_at
      : task.due_date;
  return effectiveStart <= today && today <= task.window_end_date;
}

/**
 * Should this task appear in a list for `dateStr`?
 *
 * Matches TaskCalendar's dot-rendering logic so every list-style consumer
 * (Dashboard Today, Calendar agenda, Location page, mobile shell) shows
 * the same picture for a given day.
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
  // Non-window: snooze pushes the task off until next_check_at.
  if (task.next_check_at && task.next_check_at > dateStr) return false;
  // Standard: due exactly on this date, or earlier if we want overdue carry-in.
  if (opts.includeOverdue) {
    return (task.due_date ?? "") <= dateStr;
  }
  return task.due_date === dateStr;
}

/**
 * Is this task overdue *as of today* — i.e. should it count in an
 * "X overdue" badge?
 *
 * Definitions:
 * - Completed / Skipped → never overdue.
 * - Harvest still in window → not overdue (it's "ready", not "missed").
 * - Snoozed forward (next_check_at ≥ today) → not overdue.
 * - Otherwise → overdue if due_date < today.
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
  // Snoozed forward — the effective due date hasn't arrived yet.
  if (task.next_check_at && task.next_check_at >= todayStr) return false;
  return !!task.due_date && task.due_date < todayStr;
}
