// ─── Today task summary (RHO-20) ───────────────────────────────────────────
//
// The Home status strip used to show a single opaque "N tasks today" number
// that didn't move as tasks were done. This builds a "X of Y done today"
// breakdown by combining two sources, each authoritative for different parts:
//
//   - PENDING comes from the ghost-aware CLIENT count (locationTaskCounts).
//     Recurring blueprint tasks are virtual "ghosts" until acted on, so only
//     the client knows the true remaining count.
//   - DONE / SKIPPED / POSTPONED come from the SERVER `dayStrip` today bucket.
//     Those are always persisted rows (never ghosts), so the tested server
//     aggregation is the source of truth for them.

export interface TodayBucketLike {
  completedOnTime?: number;
  completedLate?: number;
  skipped?: number;
  postponed?: number;
}

export interface TodaySummary {
  /** Tasks scheduled today that are done (on-time + late). */
  done: number;
  /** Tasks still to do today (ghost-aware). */
  pending: number;
  /** done + pending — the denominator of "X of Y done today". */
  total: number;
  /** Tasks skipped today (set aside — not counted in done/pending/total). */
  skipped: number;
  /** Tasks originally due today, snoozed forward (not in done/pending/total). */
  postponed: number;
}

/**
 * Combine the ghost-aware client pending count with the server's today
 * `dayStrip` bucket into a single breakdown. `bucket` may be null/undefined
 * while the stats fetch is in flight — pending still renders from the client.
 */
export function buildTodaySummary(
  pendingCount: number,
  bucket: TodayBucketLike | null | undefined,
): TodaySummary {
  const done = (bucket?.completedOnTime ?? 0) + (bucket?.completedLate ?? 0);
  const pending = Math.max(0, pendingCount);
  return {
    done,
    pending,
    total: done + pending,
    skipped: bucket?.skipped ?? 0,
    postponed: bucket?.postponed ?? 0,
  };
}
