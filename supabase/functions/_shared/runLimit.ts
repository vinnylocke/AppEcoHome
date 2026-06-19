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

// ── Mute-until + single skip row ────────────────────────────────────────────
// Once over the run-limit we compute the exact next-eligible time and mute the
// automation until then (no per-tick re-eval/skip-logging). We keep ONE skip
// row between real runs: collapse onto the most recent run when it's already a
// rate-limited skip, otherwise insert a fresh one.

/** True when a new rate-limited skip should COLLAPSE into the most recent run
 *  (i.e. update it) rather than insert a new row. */
export function shouldCollapseRateLimitSkip(lastStatus: string | null | undefined): boolean {
  return lastStatus === "skipped_rate_limited";
}

/** The instant the run-limit next clears: the `limit`-th most-recent in-window
 *  fire ages out at its timestamp + window. `firedDescIso` is the in-window
 *  fired-run timestamps, newest-first (length ≥ limit when actually limited).
 *  Returns null when not actually over the limit / inputs are unusable. */
export function nextEligibleAt(
  firedDescIso: string[],
  limit: number | null | undefined,
  windowHours: number,
): string | null {
  if (limit == null || limit <= 0) return null;
  if (firedDescIso.length < limit) return null;
  const hours = windowHours > 0 ? windowHours : 24;
  const t = new Date(firedDescIso[limit - 1]).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t + hours * 60 * 60 * 1000).toISOString();
}
