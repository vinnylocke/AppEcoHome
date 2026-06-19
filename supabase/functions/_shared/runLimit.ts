// Per-window run-limit for automations (#7). An automation may set
// `run_limit_count` fires per `run_limit_window_hours`; the engine counts how
// many times it actually FIRED in the window and skips once the cap is hit.
// Pure boolean decision + the set of statuses that count as a real fire.

/** automation_runs statuses that represent an actual fire (not a skip/defer). */
export const FIRED_STATUSES = ["success", "ran", "partial"] as const;

/**
 * @param firedInWindow  count of fired runs since (now - window).
 * @param limit          run_limit_count; null/<=0 = unlimited.
 * @returns true when a new fire would exceed the limit (so it must be skipped).
 */
export function isRateLimited(firedInWindow: number, limit: number | null | undefined): boolean {
  if (limit == null || limit <= 0) return false;
  return firedInWindow >= limit;
}

/** ISO timestamp for the start of the rolling window. */
export function windowStartIso(now: Date, windowHours: number): string {
  const hours = windowHours > 0 ? windowHours : 24;
  return new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();
}

// ── Skip-row collapsing ────────────────────────────────────────────────────
// The event-driven engine + repeat-while-true firing would otherwise log a
// `skipped_rate_limited` run on every tick while the condition stays true,
// flooding the run history and burying real runs. We instead keep ONE rolling
// skip row between real runs: collapse onto the most recent run when it's
// already a rate-limited skip, otherwise insert a fresh one.

/** True when a new rate-limited skip should COLLAPSE into the most recent run
 *  (i.e. update it) rather than insert a new row. */
export function shouldCollapseRateLimitSkip(lastStatus: string | null | undefined): boolean {
  return lastStatus === "skipped_rate_limited";
}

/** Next `attempts` count when collapsing onto an existing skip row (≥ 2). */
export function nextSkipAttempts(prevAttempts: number | null | undefined): number {
  const n = Number(prevAttempts);
  return (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1) + 1;
}
