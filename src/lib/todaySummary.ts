// ─── Today task summary (RHO-20; completion-aware since 2026-07) ────────────
//
// The Home status strip shows "X of Y done today". It combines two sources,
// each authoritative for a different half:
//
//   - PENDING comes from the ghost-aware CLIENT count (locationTaskCounts):
//     open tasks DUE today. Recurring blueprint tasks are virtual "ghosts"
//     until acted on, so only the client knows the true remaining count.
//   - DONE comes from the SERVER's completion-aware `tasks.doneToday`
//     (`computeDoneToday`): tasks Completed today (incl. an OVERDUE or harvest
//     task cleared today) OR due today and done. This deliberately does NOT
//     use the day-strip's today bucket — that buckets completions on their
//     DUE day, so an overdue task completed today never counted here. That
//     mismatch was the "2 of 3 instead of 3 of 3" bug.
//
// The two halves are disjoint (done = Completed, pending = open) so they never
// double-count.

export interface TodayBucketLike {
  skipped?: number;
  postponed?: number;
}

export interface TodaySummary {
  /** Tasks done that count toward today (completed today, or due-today & done). */
  done: number;
  /** Tasks still to do today (ghost-aware, open, due today). */
  pending: number;
  /** done + pending — the denominator of "X of Y done today". */
  total: number;
  /** Tasks skipped today (set aside — not counted in done/pending/total). */
  skipped: number;
  /** Tasks originally due today, snoozed forward (not in done/pending/total). */
  postponed: number;
}

/**
 * Combine the ghost-aware client pending count with the server's
 * completion-aware `doneToday`. `bucket` (the day-strip today bucket) is now
 * used only for the passthrough skipped/postponed tallies; it may be
 * null/undefined while the stats fetch is in flight — pending still renders
 * from the client and done falls back to 0.
 */
export function buildTodaySummary(
  pendingCount: number,
  doneToday: number | null | undefined,
  bucket?: TodayBucketLike | null,
): TodaySummary {
  const done = Math.max(0, doneToday ?? 0);
  const pending = Math.max(0, pendingCount);
  return {
    done,
    pending,
    total: done + pending,
    skipped: bucket?.skipped ?? 0,
    postponed: bucket?.postponed ?? 0,
  };
}
