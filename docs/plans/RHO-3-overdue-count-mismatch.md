# RHO-3 — Dashboard summary overdue count ≠ overdue task list count

**Jira:** RHO-3 · Bug · Medium · Sprout dashboard.

## Problem
The Daily Brief summary panel's "Overdue N" chip and the "Today's Tasks" list below it show
different overdue counts (reported 13 vs 12; reproduced 2026-07-01 as **21** in the summary
vs the list showing **"All caught up"**). They should be one number.

## Reproduction
Sprout account, `/dashboard`. Summary chip (Daily Brief) and the task list disagree — the two
counts come from two entirely separate queries that never share logic.

## Root cause
Two independent overdue computations:
- **Summary chip** → `overdueTaskCount` computed in [App.tsx:744-757](../../src/App.tsx#L744-L757):
  pure SQL, **location-scoped** (`.in("location_id", locationIds)`, line 747), counts only
  **persisted** `tasks` rows. Any overdue task with `location_id = NULL` (home/personal scope)
  is excluded. Passed to `DailyBriefCard` at [App.tsx:1486](../../src/App.tsx#L1486).
- **Task list** → [taskEngine.ts:246-256](../../src/lib/taskEngine.ts#L246-L256): **home-scoped**
  (`.eq("home_id", homeId)`) and **ghost-aware** (materialises virtual blueprint instances).
- They diverge on (a) location-less tasks, (b) ghost vs persisted rows, (c) harvest/snooze filter
  wording (App's chained `.or()` vs `taskFilters.isTaskOverdueToday`).

Doc drift: [02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)
line 62 says `overdueTaskCount` is "across home" — the code contradicts it (location-scoped).

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)
- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md)

## Recommended fix
Define **one canonical overdue computation** (home-scoped, ghost-aware, using
`taskFilters.isTaskOverdueToday`) and have both the chip and the list read it — ideally the chip
reads the same `TaskEngine` result the list already computes, rather than issuing its own query.
Minimum viable: change [App.tsx:747](../../src/App.tsx#L747) from `.in("location_id", …)` to
`.eq("home_id", homeId)` and align the harvest/snooze filters with `taskFilters.ts`. Fix the
app-reference line 62 wording either way.

## Tests
- Vitest for the canonical overdue helper (location-less + ghost cases).
- E2E: assert the Daily Brief chip number equals the task-list overdue count on the dashboard.

## Risks
- Ghost vs persisted double-count for the same blueprint/date — the canonical count must dedupe.
- Related but distinct from RHO-14 (which fixes the `home-dashboard-stats` week bound); this is the
  Daily-Brief chip vs TaskEngine list divergence.
