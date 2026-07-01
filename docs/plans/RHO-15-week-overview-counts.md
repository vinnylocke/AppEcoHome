# RHO-15 — "Week Overview" day-strip counts wrong

**Jira:** RHO-15 · Bug · Medium. **Same root cause as [RHO-14](RHO-14-tasks-this-week-counts.md) + [RHO-16](RHO-16-harvests-due-count.md).**

## Problem
The Week Overview day-strip counts are all wrong: Sunday doesn't carry previous-week overdue, and
harvest tasks are missing from the days they should span.

## Root cause
The `dayStrip` buckets the **same week-bounded task set** by exact `due_date` —
[home-dashboard-stats/index.ts:324-356](../../supabase/functions/home-dashboard-stats/index.ts#L324-L356)
(`tasks.filter(t => t.due_date.slice(0,10) === ds …)`, :328). Because the source array is already
`due_date >= weekStart` ([:64-65](../../supabase/functions/home-dashboard-stats/index.ts#L64-L65)):
- No prior-week overdue rows exist to place on the Sunday bucket.
- The per-day `overdue` bucket ([:335-341](../../supabase/functions/home-dashboard-stats/index.ts#L335-L341))
  can only fire for days both `< today` **and** `>= weekStart` (this week's earlier days only).
- Harvest-window tasks are keyed by `due_date` day only (no window spread); windows opening before
  `weekStart` are absent entirely.

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) (week-strip semantics)

## Recommended fix
On the widened query (per RHO-14), when building `dayStrip`: (1) aggregate all not-completed tasks
with effective due `< weekStart` into the **Sunday** bucket's `overdue` (unless postponed/window
moves them forward); (2) for harvest-window tasks, count on **every** in-window day
(`due_date <= ds <= window_end_date`), not just `due_date`; (3) show both overdue and pending per day
(the UI already renders multiple buckets — [HomeDashboard.tsx:213-218](../../src/components/HomeDashboard.tsx#L213-L218)).

## Tests
- Deno test: seeded prior-week overdue rolls onto Sunday; a harvest window spans its in-week days.

## Risks
- Confirm product wants the raw historical-overdue sum on Sunday. Keep the day-strip's per-day
  presence separate from RHO-16's distinct-plants count (different granularity).
