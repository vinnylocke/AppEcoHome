// Seasonal "window" task types — the single source of truth for which task
// types use the Wave-20 window model (ONE task spanning [start_date,
// end_date], active across the whole window, not a task per day).
//
// Harvesting and Pruning are both seasonal: you do them across a window, not
// on one fixed day. Keeping the set here means the ghost engine
// (`taskEngine.buildRenderTasks`), the "remaining today" count
// (`locationTaskCounts`), and any other window gate stay in lock-step instead
// of drifting apart (which is how Pruning ended up materialising a task every
// day of its season while Harvesting got one window task).
//
// NOTE: the `generate-tasks` Deno cron mirrors this list locally (it can't
// import from `src/`). Keep the two in sync — see
// `supabase/functions/generate-tasks/index.ts`.

export const SEASONAL_WINDOW_TYPES: ReadonlySet<string> = new Set([
  "Harvesting",
  "Harvest", // legacy synonym from Save-to-Shed / Companion Plants
  "Pruning",
]);

/** True for a task/blueprint type that uses the seasonal window model. A type
 *  only becomes a *window* task when it also carries an `end_date`; callers
 *  combine this with that check. */
export function isSeasonalWindowType(taskType?: string | null): boolean {
  return !!taskType && SEASONAL_WINDOW_TYPES.has(taskType);
}
