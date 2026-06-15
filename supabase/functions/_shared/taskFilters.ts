// Server-side mirror of `src/lib/taskFilters.ts` (the Wave 20+ snooze
// + harvest-window contract). The two must agree — if the client says
// a task is hidden today, the server must agree and skip sending push
// notifications for it. See `tests/unit/lib/taskFilters.test.ts` for
// the exhaustive case coverage; this file's Deno test mirrors them.

export interface SnoozeableTask {
  status?: string | null;
  due_date?: string | null;
  next_check_at?: string | null;
  window_end_date?: string | null;
}

function effectiveDueDate(task: SnoozeableTask): string | null {
  const due = task.due_date ?? null;
  const snooze = task.next_check_at ?? null;
  if (snooze && due && snooze > due) return snooze;
  return due;
}

function isInHarvestWindow(task: SnoozeableTask, today: string): boolean {
  if (!task.window_end_date || !task.due_date) return false;
  const effectiveStart = effectiveDueDate(task) ?? task.due_date;
  return effectiveStart <= today && today <= task.window_end_date;
}

/** Should this task appear in a list for `dateStr`? */
export function isTaskVisibleOnDate(
  task: SnoozeableTask,
  dateStr: string,
  opts: { includeOverdue?: boolean } = {},
): boolean {
  if (task.status === "Skipped") return false;
  if (task.window_end_date && task.due_date) {
    return isInHarvestWindow(task, dateStr);
  }
  const effective = effectiveDueDate(task);
  if (!effective) return false;
  if (opts.includeOverdue) return effective <= dateStr;
  return effective === dateStr;
}

/** Should a push reminder fire for this task today? Mirrors
 *  `isTaskOverdueToday` semantics from the client (effective_due ≤ today). */
export function isTaskActionableToday(
  task: SnoozeableTask,
  todayStr: string,
): boolean {
  if (task.status === "Completed" || task.status === "Skipped") return false;
  if (task.window_end_date && task.due_date) {
    // Harvest window: actionable while inside the window.
    if (isInHarvestWindow(task, todayStr)) return true;
    // Past window — task was missed; the user already skipped it implicitly
    // by letting the window close. Don't keep pestering.
    return false;
  }
  const effective = effectiveDueDate(task);
  return !!effective && effective <= todayStr;
}
