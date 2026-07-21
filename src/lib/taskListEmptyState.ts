export type TaskListEmptyVariant = "all-done" | "nothing";

/**
 * Which empty state should a task list show when it has no rows to render?
 * (dashboard-nav-tasks-tray Stage 3, B1.)
 *
 * - `"all-done"` — you had tasks and cleared them all: celebrate, DON'T pitch
 *   "Set up a Routine" (the old bug — clearing your last task was rewarded with
 *   a setup ad).
 * - `"nothing"` — a genuinely quiet day, or a brand-new / routine-less home:
 *   keep the gentle "Set up a Routine" CTA.
 *
 * Pure so the branch is unit-tested independently of TaskList's render.
 */
export function taskListEmptyVariant(
  pendingCount: number,
  completedCount: number,
): TaskListEmptyVariant {
  return completedCount > 0 && pendingCount === 0 ? "all-done" : "nothing";
}
