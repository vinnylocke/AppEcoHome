# RHO-14 — "Tasks This Week" counts wrong (overdue-from-prior-weeks dropped)

**Jira:** RHO-14 · Bug · Medium. **Shares a root cause with [RHO-15](RHO-15-week-overview-counts.md) + [RHO-16](RHO-16-harvests-due-count.md).**

## Problem
The dashboard weekly task stats (Total / Overdue / Pending) are wrong — e.g. 24 real pending tasks
show as 11 total / 2 overdue / 9 pending. Overdue tasks from before this week are missing.

## Root cause
The `home-dashboard-stats` edge function fetches tasks **strictly within the current Sun–Sat window**
— [home-dashboard-stats/index.ts:60-65](../../supabase/functions/home-dashboard-stats/index.ts#L60-L65)
(`.gte("due_date", weekStart).lte("due_date", weekEnd)`). Every downstream count is then computed over
that in-week slice:
- `taskOverdue` ([:168-174](../../supabase/functions/home-dashboard-stats/index.ts#L168-L174)) filters
  `due_date < today` **within** the already-week-bounded set → only *this week's* overdue count; the
  older overdue tasks are dropped before the filter runs.
- `taskTotal` ([:148](../../supabase/functions/home-dashboard-stats/index.ts#L148)) and `taskPending`
  ([:175-180](../../supabase/functions/home-dashboard-stats/index.ts#L175-L180)) are likewise
  week-bounded. It also never materialises ghost tasks (a second undercount source).

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) (home-dashboard-stats output shape)

## Recommended fix
Broaden the tasks query to include overdue-from-any-date + open harvest windows: fetch where
`due_date <= weekEnd` **OR** `window_end_date >= weekStart` (mirroring
[taskEngine.ts:251-256](../../src/lib/taskEngine.ts#L251-L256)). Compute **overdue over the full set**
(all not-Completed/Skipped with effective due < today, snooze/window-aware via the same logic as
`taskFilters.isTaskOverdueToday`). Keep "this week" Total/Pending week-scoped. **Product decision to
confirm:** should Total/Pending also include all-time overdue, or stay week-only with overdue counted
separately? The ticket's expected result says overdue "no matter how old" must be reflected.

## Tests
- Deno test for `home-dashboard-stats`: seeded prior-week overdue + ghost tasks are counted.

## Risks
- Broad `due_date <= weekEnd` scan could be large for old homes — consider a floor (e.g. 90 days) for
  the non-overdue buckets while counting overdue unbounded. Dedupe ghosts vs persisted rows.
