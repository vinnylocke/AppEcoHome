import { formatDisplayDate } from "./dateUtils";

export interface TaskDueLabelInput {
  dueDate: string | null | undefined;
  windowEndDate: string | null | undefined;
  /** Today as YYYY-MM-DD (local). */
  todayStr: string;
  isCompleted: boolean;
  isOverdue: boolean;
  isInHarvestWindow: boolean;
  /** True when the row already renders the calendar's "Overdue since" chip
   *  (`overdueCarryoverSince`) — suppresses the overdue label to avoid doubling. */
  hasOverdueChip: boolean;
}

/**
 * Plain-language due label for a task row (dashboard-nav-tasks-tray Stage 2, B2).
 *
 * Pure + unit-tested: given a task's date fields + today, returns the label
 * string, or `null` when no label should show. Overdue is the key case — the
 * compact home/tray list otherwise signals it by red background ALONE (a colour-
 * only, a11y-poor signal). "Due today" is deliberately `null` (implied on a
 * today-scoped list); future dates read as "Due tomorrow" / "Due in N days" and
 * fall back to the formatted date beyond a week.
 */
export function taskDueLabel(input: TaskDueLabelInput): string | null {
  const {
    dueDate,
    windowEndDate,
    todayStr,
    isCompleted,
    isOverdue,
    isInHarvestWindow,
    hasOverdueChip,
  } = input;

  if (isCompleted) return null;

  if (isOverdue) {
    if (hasOverdueChip) return null;
    return `Overdue · was due ${formatDisplayDate(windowEndDate || dueDate || todayStr)}`;
  }

  if (isInHarvestWindow) {
    return windowEndDate ? `Window open · closes ${formatDisplayDate(windowEndDate)}` : null;
  }

  if (dueDate && dueDate !== todayStr) {
    const days = Math.round(
      (new Date(`${dueDate}T00:00:00`).getTime() -
        new Date(`${todayStr}T00:00:00`).getTime()) /
        86_400_000,
    );
    if (days === 1) return "Due tomorrow";
    if (days > 1 && days <= 6) return `Due in ${days} days`;
    return `Due ${formatDisplayDate(dueDate)}`;
  }

  return null;
}
