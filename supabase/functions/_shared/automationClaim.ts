/**
 * Optimistic-concurrency claim for an automation's firing edge.
 *
 * `evaluate-automations` runs from overlapping paths (the 5-min `time` cron + the
 * 15-min `all` sweep coincide every :15, plus the sensor event path). To fire an
 * automation EXACTLY ONCE per rising edge, the engine claims the row with a
 * conditional UPDATE keyed on the `last_fired_at` value it read: only the
 * invocation whose value still matches wins (Postgres re-checks the predicate
 * after the winner commits); the losers match 0 rows and skip firing.
 *
 * This helper applies that key to a query builder. Pulled out so the claim-key
 * logic is unit-testable without a live DB or importing the function's server.
 */
export function applyEdgeClaimFilter<
  Q extends { is(col: string, v: null): Q; eq(col: string, v: string): Q },
>(query: Q, lastFiredAt: string | null): Q {
  return lastFiredAt == null
    ? query.is("last_fired_at", null)
    : query.eq("last_fired_at", lastFiredAt);
}
