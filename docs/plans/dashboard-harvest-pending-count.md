# Dashboard "done today" — completed harvest still counted as pending

**Date:** 2026-07-09 · **Reported:** headline shows "0 of 3 done" but one of the 3 is a **harvest task that was auto-completed** (on an earlier day, when the harvest was logged). It should either count as done or not be in the total — "not in the total" is right (it's already done).

## App-reference consulted
- [`02-dashboard/17-home-main.md`](../app-reference/02-dashboard/17-home-main.md) — the "X of Y done today" strip; pending = `locationTaskCounts` sum.
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — harvest window tasks (`due_date` = window start, `window_end_date` = close).

## Root cause
`pending` (the strip's denominator minus done) is `buildLocationTaskCounts` summed. Its input — the "today's tasks" query in `App.tsx` (`fetchDashboardData`) — fetches only rows with **`due_date == today`**:

```ts
supabase.from("tasks").select("id, blueprint_id, location_id, status")
  .in("location_id", locationIds)
  .eq("due_date", todayStr)          // ← misses in-window harvest rows
```

A harvest window task's `due_date` is the window **start** (days ago), so the auto-completed harvest row isn't fetched. `buildLocationTaskCounts` suppresses a blueprint's ghost only when it sees a persisted row for it (any status). With the completed harvest row missing, the harvest blueprint's ghost is **not** suppressed — and since its window still spans today, the ghost is counted as pending (in-window branch). Net: the completed harvest inflates the total by 1, while `computeDoneToday` correctly excludes it (completed on an earlier day) → "0 of 3" instead of "0 of 2".

The **engine's** actual today list already gets this right (it fetches `due_date <= today`, so the completed harvest row is present and suppresses the ghost, and the completed row itself is filtered out of today) — so the list and the count disagree. This is purely the lightweight count's narrower query.

## Fix
Widen the `App.tsx` today-tasks query to also fetch **in-window harvest rows** (a harvest whose window covers today), so a completed/skipped harvest suppresses its ghost:

```ts
  .in("location_id", locationIds)
  .or(`due_date.eq.${todayStr},and(due_date.lte.${todayStr},window_end_date.gte.${todayStr})`)
```

`buildLocationTaskCounts` needs **no change** — once the completed harvest row is in its input, the existing `blueprint_id` → ghost-suppression handles it, and the Completed row is excluded from the visible count.

Behaviour check (no regressions):
- **Open** in-window harvest (materialised Pending row): now counted via the physical row + ghost suppressed = 1 (was: ghost only = 1). Same.
- **Open** in-window harvest (pure ghost, no row): unchanged = 1.
- **Completed/skipped** in-window harvest: now suppressed = 0 (was: ghost counted = 1). **Fixed.**
- Non-harvest tasks: unaffected (no `window_end_date`).

## Files
- `src/App.tsx` — widen the today-tasks query in `fetchDashboardData`.
- `tests/unit/lib/locationTaskCounts.test.ts` — add: a **completed** harvest row (with `blueprint_id`, in-window) + its blueprint → count **0** (ghost suppressed); an **open** in-window harvest → count **1**. This locks the suppression that the widened query now enables.

## Why this pair of bugs happened
The 2026-07 fix corrected the *done* half (completion-date aware). This is the *pending* half of the same "harvest windows don't live on a single due day" issue — the count query assumed one due day per task. The new test closes it at the unit level; I'll also verify live that a completed in-window harvest drops out of the count.

## Rollout
One phase, one deploy, live-verified (auto-completed in-window harvest → not in today's total) before finishing.

## Delivered (2026-07-09)

Shipped. Widened the `App.tsx` today-tasks query to `or(due_date.eq.today, and(due_date.lte.today, window_end_date.gte.today))`; `buildLocationTaskCounts` unchanged. Verified live against the real DB, isolated to a single harvest blueprint: a **completed** in-window harvest gave **1** under the old `eq(due_date, today)` query (bug) and **0** under the new window-aware query (fixed); the old query never fetched the completed harvest row (`oldQueryFetchedHarvest: false`), the new one did. Tests: `locationTaskCounts.test.ts` +2 (completed in-window harvest → 0; open in-window harvest persisted row → 1).
