# Fix — "X of Y done today" double-counts completed recurring tasks

## The problem

On the new Home dashboard, the task breakdown (`HomeStatusStrip`) shows e.g. **"3 of 6 done today"** when the true state is 3 tasks, all completed. The "Today's tasks" list below correctly shows *"No tasks here yet"*. So the **count is wrong, the list is right** — they've diverged.

Reported symptom: "6 tasks today but there's only 3 and I've done them all… it says 3 of 6 done today but then when you scroll down it says no tasks here yet."

## Root cause

The breakdown is built in [HomeMain.tsx](../../src/components/home/HomeMain.tsx#L88) by `buildTodaySummary(todayTaskCount, todayBucket)`:

- `done` = server `dayStrip` today bucket (`completedOnTime + completedLate`) — **correct**, 3.
- `pending` = `todayTaskCount` = sum of `locationTaskCounts` (the ghost-aware client count from `App.tsx`).
- `total = done + pending`.

`locationTaskCounts` is built in [App.tsx](../../src/App.tsx#L812-L871). Its "today's tasks" query filters out completed rows:

```ts
supabase.from("tasks")
  .select("id, blueprint_id, location_id, status")
  .in("location_id", locationIds)
  .eq("due_date", todayStr)
  .neq("status", "Completed"),   // ← the bug
```

Because completed rows are excluded, a **completed recurring-blueprint task never lands in `existingByLocation`**. The ghost-generation loop below then thinks "this blueprint has no task today" and **re-adds a ghost**, which is counted as pending. So each completed recurring task is counted twice — once as `done` (server) and once again as a regenerated ghost in `pending` (client). Three completed recurring tasks → `done = 3`, `pending = 3`, `total = 6` → "3 of 6 done today".

The **TaskList is correct** because `TaskEngine.fetchTasksWithGhosts` keeps completed rows in its main query — [taskEngine.ts](../../src/lib/taskEngine.ts#L295) only does `.neq("status", "Skipped")` — so completed rows *do* suppress their blueprint's ghost. The engine hides completed rows from display but keeps them for suppression. The count builder in App.tsx simply diverged from that rule: it handles `Skipped` as a ghost-suppressing tombstone but drops `Completed` entirely.

## App-reference files consulted

- [02-dashboard/17-home-main.md](../app-reference/02-dashboard/17-home-main.md) — the new Home dashboard (HomeStatusStrip, RHO-20 breakdown). **Will need updating.**
- [02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) — Overview tab / DailyBriefCard (also consumes `locationTaskCounts`).
- [99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — ghost tasks + blueprint suppression rules (the canonical model the fix must respect).

## The fix

Mirror the TaskEngine (and the existing `Skipped` handling) for `Completed` in the App.tsx count builder:

1. **Fetch completed rows** — drop `.neq("status", "Completed")` from the `todayTasksResult` query so completed tasks are returned and can suppress their ghosts.
2. **Keep them out of the visible count** — in the `forEach`, exclude both `Skipped` *and* `Completed` from the `counts[…]++` increment, but still add their `blueprint_id` to `existingByLocation` so the ghost is suppressed.

Net effect on `locationTaskCounts`: it becomes a true "remaining today" count. This is correct for **all** consumers (the `HomeStatusStrip` breakdown, the `DailyBriefCard` "X tasks today" hero, and the per-location `LocationTile` / `GardenOverviewGrid` chips) — all of them should reflect tasks still to do, and all were previously over-counting completed recurring tasks by regenerating their ghosts. Walk-through with 3 completed recurring tasks after fix: `counts = 0`, `done = 3`, `total = 3` → **"3 of 3 done today"**; hero → "no tasks today"; chips → 0. Before completing any: `counts = 3`, `done = 0`, `total = 3` → "0 of 3 done today". After 1: "1 of 3 done today".

### Make it testable (recommended)

The count logic is currently inline inside a large `App.tsx` effect and can't be unit-tested. Extract it to a pure helper so the mandated test can pin the behaviour:

- **New:** `src/lib/locationTaskCounts.ts` → `buildLocationTaskCounts(todayTasks, blueprints, todayStr): Record<string, number>` — the exact loop moved out verbatim (with the fix applied). Pure, no Supabase.
- `App.tsx` calls the helper with the two query result arrays.

## Files to change

| File | Change |
|------|--------|
| `src/App.tsx` | Remove `.neq("status","Completed")` from the today-tasks query; call the new helper (or, minimal variant, apply the two-line guard inline). |
| `src/lib/locationTaskCounts.ts` *(new)* | Pure `buildLocationTaskCounts` with the completed-suppression fix. |
| `tests/unit/lib/locationTaskCounts.test.ts` *(new)* | Unit tests (see below). |

## Tests

New Vitest unit spec `tests/unit/lib/locationTaskCounts.test.ts`:
- All recurring tasks completed today → count is **0** (regression for this bug).
- No tasks acted on yet → count equals the number of blueprints due today (ghosts).
- Partial completion → count equals remaining only.
- A `Skipped` row suppresses its ghost and isn't counted (existing behaviour preserved).
- A `Completed` standalone (no `blueprint_id`) task isn't counted and doesn't affect ghosts.
- Harvest-window blueprint counts once; `paused_until` / `start_date` / `end_date` gates respected (port existing rules).

`tests/unit/lib/todaySummary.test.ts` needs **no change** — `buildTodaySummary` is correct; it was fed a bad `pending`.

## Test-doc updates

- [docs/e2e-test-plan/](../e2e-test-plan/) — dashboard surface file: add a row asserting the breakdown reads "N of N done today" (not double) once all of today's tasks are complete, and note the unit coverage.
- [TESTING.md](../../TESTING.md) § Current Test Inventory — add the new spec + bump the unit count.

## App-reference updates

- [02-dashboard/17-home-main.md](../app-reference/02-dashboard/17-home-main.md) — in the RHO-20 breakdown section, document that `pending` is *remaining* (completed rows are excluded from the count but still suppress their blueprint's ghost, mirroring `TaskEngine`), so `total = done + pending` never double-counts.

## Risks / notes

- `locationTaskCounts` also feeds the location chips and DailyBriefCard hero; this change makes those show *remaining* rather than *scheduled incl. completed*. That is the intended meaning of a "tasks today" chip and matches the list, but it is a visible behaviour change worth calling out.
- Aggregate `done` (whole-home, from the server) vs `pending` (location-scoped, client) can differ for tasks with no `location_id` (personal/home-scoped) — a pre-existing limitation, out of scope for this fix.
