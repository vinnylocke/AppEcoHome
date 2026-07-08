# Dashboard "today" task counts — completion-aware fix

**Date:** 2026-07-08 · **Reported:** "X of Y done today" shows *2 of 3* but I completed 4 tasks today (2 overdue, 1 harvest auto-completed a few days ago, 1 pruning today); completed overdue/harvest tasks no longer show on the dashboard. "How did this slip through — shouldn't there be tests?"

## App-reference consulted
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — tasks/blueprints/ghosts, effective due date, harvest windows.
- Dashboard surfaces: `src/components/home/HomeMain.tsx`, `HomeStatusStrip.tsx`, `src/components/HomeDashboard.tsx` (weekly stats panel).

## Root cause (mapped end-to-end)

The **"X of Y done today"** strip (`HomeStatusStrip`) is built by `buildTodaySummary(pendingCount, todayBucket)` (`src/lib/todaySummary.ts`) from two sources with a **due-date-only** notion of "today":

- **pending** = `buildLocationTaskCounts` (`src/lib/locationTaskCounts.ts`) — open tasks **due today** (ghost-aware). Excludes overdue and location-less tasks.
- **done** = the server day-strip *today* bucket's `completedOnTime + completedLate` (`_shared/dashboardStats.ts` `computeDayStrip`) — tasks whose **effective DUE date is today** and are completed.

So both halves are scoped to *due today*. When you complete an **overdue** task today, it's bucketed on its **past due date**, never in today's `done` — so today's ratio doesn't reflect it. If its due date was before this ISO week it falls off the strip entirely (the day array only spans this week; the Sunday roll-up only adds *overdue*, not *completed*). The harvest auto-completed days ago is bucketed on its window days, not today. Net: only the pruning (due today, done today) lands cleanly → a deflated, confusing ratio, and cleared overdue/harvest work seems to vanish.

This is a **semantics gap, not a code regression**: the day-strip's per-day, due-date bucketing is *correct for the weekly strip* (each day shows how many of that day's tasks are done). It's the wrong definition for a "what did I get done today" headline.

## Why tests didn't catch it
`tests/unit/lib/todaySummary.test.ts` (7) and `supabase/tests/dashboardStats.test.ts` (32) faithfully assert the **old** due-date semantics — including "completed task due today counts on-time" — but **none** covers *"an overdue task completed today"* or the coherence between the client `pending` and server `done`. The tests locked in a definition that was simply too narrow; they passed because the code matched that definition. The fix is new tests that lock the *completion-aware* definition.

## Proposed semantics (please confirm)

"**X of Y done today**" should describe today's plate + today's wins, coherently:
- **done** = tasks that are Completed **and** (completed today by local `completed_at`, **or** their effective due date is today). → counts overdue/harvest you cleared today, and today's tasks done (even if ticked a little early).
- **pending** = open tasks **due today**, ghost-aware (unchanged).
- **total** = done + pending.

For the reported case this yields **"3 of 3 done today"** (2 overdue + 1 pruning cleared today; pending 0). The harvest completed *a few days ago* correctly belongs to **that** day, not today — it will show as done on its own day in the weekly strip / calendar, not on today. (If you'd rather "today" also re-surface things completed on prior days, that's a bigger change — say so and I'll scope it.)

The **weekly day-strip and stat tiles are left as-is** — their due-date bucketing is the right per-day view; I'm only adding a completion-oriented "today" number for the headline.

## Approach

1. **Server** (`supabase/functions/_shared/dashboardStats.ts` + `home-dashboard-stats/index.ts`): add `doneToday: number` to the response = count of tasks with `status === "Completed"` where `completedDateLocal(t, tz) === today` **OR** `effectiveDueDate(t) === today` (reusing the existing helpers + `tzOffsetMinutes`). The stats query already fetches `completed_at >= weekStart`, so today's completions (even for long-overdue tasks) are in the set. Distinct-count so a due-today-and-completed-today task isn't double-counted.
2. **`buildTodaySummary`**: change to take an explicit `done` number instead of digging it out of the bucket: `buildTodaySummary(pendingCount, doneToday)` → `{ done, pending, total: done+pending }`. Keep `skipped`/`postponed` passthrough if any consumer uses them (verify `HomeStatusStrip`).
3. **`HomeMain`**: pass `dashStats?.tasks…`/new `doneToday` into `buildTodaySummary` instead of the day-strip today bucket.
4. **Today list visibility** (`TaskList` + `taskFilters.isTaskVisibleOnDate`): verify a task **completed today but due earlier** shows on the dashboard's Today list (the engine's `buildRenderTasks` already keeps completed-today rows via its `isCompletedInWindow` branch; confirm live). If a gap exists, widen the completed-task visibility to "completed today" so cleared overdue work stays visible for the day. The harvest completed days ago stays off today by design.

## Files
- `supabase/functions/_shared/dashboardStats.ts` — add `computeDoneToday` (or extend `computeTaskStats`) + export.
- `supabase/functions/home-dashboard-stats/index.ts` — include `doneToday` in the payload.
- `src/hooks/useHomeDashboardStats.ts` — add `doneToday` to the `HomeDashboardStats` type.
- `src/lib/todaySummary.ts` — new signature.
- `src/components/home/HomeMain.tsx` — wire it.
- (maybe) `src/lib/taskFilters.ts` / `src/components/TaskList.tsx` — completed-today visibility, only if the live check shows a gap.

## Tests (the point of "so it doesn't slip again")
- **Deno** `supabase/tests/dashboardStats.test.ts`: `doneToday` counts (a) an overdue task completed today, (b) a due-today task completed today, (c) a due-today task completed early yesterday, and does **not** count (d) a task completed days ago, (e) an open overdue task. Timezone-boundary case (evening completion).
- **Vitest** `tests/unit/lib/todaySummary.test.ts`: new signature — done+pending=total; overdue-completed-today reflected in done.
- **Vitest/engine**: `buildRenderTasks` (or `isTaskVisibleOnDate`) includes a task completed today though due earlier, in today's range.

## Risk
- Keep the weekly day-strip/tiles untouched → no regression to the tested weekly views.
- `doneToday` distinct-count avoids double counting the due-today-and-done-today overlap.
- localStorage/dashboard snapshot: `doneToday` is derived server-side each fetch; the snapshot just carries it.

## Rollout
One phase, one deploy, live-verified against the demo/local data (complete an overdue task → "done today" increments, task stays visible) before finishing.

## Delivered (2026-07-08)

Shipped. Added `computeDoneToday` (server) = tasks Completed AND (completed today by local `completed_at` OR effective due today); wired into `home-dashboard-stats` as `tasks.doneToday`. `buildTodaySummary` now takes an explicit `done` number; `HomeMain` feeds it `dashStats.tasks.doneToday`. The weekly day-strip and stat tiles were left untouched. Added a "Harvest completed {date}" chip to completed harvest tasks in `TaskList` (suppressed when the "Completed late" chip already shows a date).

**Verified live** against the real local edge function: an overdue task (due 3 days ago) completed today moved `tasks.doneToday` **0 → 1** — the exact scenario that previously read "2 of 3". Confirmed the Today list keeps a task completed today though due earlier (the engine keys completed-in-window visibility on `updated_at`, set on completion).

**Tests (so it can't silently regress):** Deno `DASH-DONE-001..007` (overdue-completed-today counts; due-today-completed counts once; completed-early still counts; completed-days-ago does NOT; open-overdue does NOT; timezone boundary; the full reported scenario → 3). Vitest `buildTodaySummary` new signature incl. "3 of 3 after clearing overdue". Engine `buildRenderTasks` visibility for completed-today-due-earlier. The gap that let this through — no test for *overdue completed today* — is now closed.
