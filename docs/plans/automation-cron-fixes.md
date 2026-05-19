# Plan — Automation cron fixes + weather / task cadence

## Current state (what I found in the code)

### Weather + tasks cadence
- **`sync-weather` already runs daily at 01:00 UTC** and fetches **7 days of forecast** (open-meteo). One-hour idempotency guard.
- **`generate-tasks` already runs daily at 07:55 UTC** and materialises tasks **7 days ahead** of today per blueprint.
- **`analyse-weather`** runs automatically every time a weather snapshot is upserted (DB trigger) — so analysis happens daily too.

### Weather forecast UI bug (user-reported: only today→Sat showing)

The user sees Tue → Sat (5 days). The frontend slices `times.slice(startIdx, startIdx + 7)` from today — slice silently returns fewer entries when the array runs out. The most likely cause is that the DB snapshot was last refreshed several days ago (e.g. last Saturday). The slice from "today=Tue" only finds Tue–Sat in the data.

**Fix D — defensive refresh.** When the weather page loads (or the app's `fetchDashboardData` runs), if the snapshot's `updated_at` is more than 6 hours old, invoke `sync-weather` and re-fetch. The 1-hour idempotency guard inside `sync-weather` keeps this safe.

**Fix E — manual refresh.** Small refresh icon on the forecast page that triggers `sync-weather` and refetches.

### Automation issues (the actual bugs)

`run-automations/index.ts` has three problems that explain what you saw:

1. **Scheduled `completeTasks` never finds overdue tasks.** Lines 374–429 query only `eq("due_date", today)`. The overdue task (`due_date = yesterday`) doesn't match → the loop falls into the "no existing task" branch and **inserts a fresh task for today as Completed** instead of completing the overdue one. The overdue task stays Pending. *(This is the same bug we fixed for the manual path a few sessions ago — never patched for the scheduled path.)*

2. **No atomic "claim today" guard on the cron.** `last_run_date` is set only after the full happy path completes (line 653). If two cron ticks fire close together (or one fails late in the pipeline), both check `last_run_date !== today` and both proceed. Result: multiple runs, multiple notifications, multiple inserted tasks.

3. **Scheduled `completeTasks` materialises phantom tasks unconditionally.** Even when there's nothing legitimate to complete (e.g. an old task that was deleted or never generated), it inserts a new Completed task — so the user sees "4 tasks for today" they never set up.

The trigger check (`checkControllingTaskDue`) already correctly excludes overdue tasks from being a trigger reason — that part of your request 3 is already true.

## Fixes

### Fix A — Scheduled path completes overdue + today, never inserts phantom rows
File: `supabase/functions/run-automations/index.ts`, function `completeTasks`.

Replace the scheduled-path per-blueprint loop with a single query that mirrors the manual path:

```ts
// ── Scheduled run: complete any Pending/Postponed task for any linked blueprint,
//                  due today or earlier. NEVER insert new rows.
const bpIds = abps.map(r => r.blueprint_id);
const { data: existingTasks } = await db
  .from("tasks")
  .select("id, status, blueprint_id, title")
  .in("blueprint_id", bpIds)
  .lte("due_date", today)
  .not("status", "in", "(\"Completed\",\"Skipped\")");

for (const t of existingTasks ?? []) {
  await db.from("tasks").update({
    status: "Completed",
    completed_at: new Date().toISOString(),
    auto_completed_reason: "automation",
  }).eq("id", t.id);
  results.push({ blueprint_id: t.blueprint_id, title: t.title ?? "", already_done: false });
}
```

If `existingTasks` is empty, the function returns an empty array. The scheduled run wraps up as `success` (or `skipped_no_tasks` — we can flip the status code, doesn't really matter).

This means the auto-completion will:
- Mark today's Pending task done ✓
- Mark any overdue Pending task done (driven by the same linked blueprints) ✓
- Never create a phantom row ✓

### Fix B — Atomic "claim today" guard
At the top of `runAutomation` (for `triggeredBy === "schedule"` only), do a conditional update that returns the row only if it wasn't already today:

```ts
const { data: claimed } = await db
  .from("automations")
  .update({ last_run_date: today })
  .eq("id", automationId)
  .neq("last_run_date", today)  // only update if not already claimed
  .select("id");

if (!claimed || claimed.length === 0) {
  // Another cron tick already claimed today — bail silently.
  log(FN, "duplicate_run_blocked", { automationId, today });
  return { status: "duplicate_blocked" };
}
```

This atomically reserves the day. The existing tail-end `last_run_date = today` update becomes a no-op (it's already set), which is fine.

Trade-off: if the run then fails partway, it won't retry today. That's the right call — we'd rather skip than double-fire valves. The user can manually retry from the UI.

### Fix C — Tighten `skipped_no_tasks` exit
This already exists at line 610. With the atomic claim in fix B, this still works correctly because the claim happens before the gate, so a skipped run still consumes today.

Actually I'll put the claim *after* `checkControllingTaskDue` so we don't burn the claim on days where there's nothing to do — but I will still set `last_run_date = today` in the `skipped_no_tasks` branch (it already does this).

Ordering:
1. Weather check (early exit + set last_run_date)
2. Task-due check (early exit + set last_run_date)
3. **Atomic claim** — bail if another tick already claimed today
4. Fire valves + complete tasks + notify
5. (Cleanup updates last_run_date redundantly — fine)

### Optional — Task look-ahead bump from 7 → 14 days
One-line change in `generate-tasks/index.ts` (line 52: `sevenDaysAhead.setUTCDate(now.getUTCDate() + 14)`). Worth it if you find the planner ever shows an empty Week 2.

## Files changed
- `supabase/functions/run-automations/index.ts` — fixes A + B + C
- `src/App.tsx` — fix D: defensive sync-weather call when snapshot is >6h old
- `src/components/WeatherForecast.tsx` — fix E: manual refresh button

## Risks
- The atomic claim shifts behaviour: a failed mid-run won't retry. Manual retry from the UI still works.
- The scheduled completeTasks no longer materialises tasks. If a user's `generate-tasks` cron failed earlier today and no task was inserted, the automation will not insert one as a side effect. The user will need to materialise it via the normal task generation flow. *(This is the correct behaviour — the automation isn't a backstop for the task generator.)*

## No DB migrations
All changes are edge-function-only.

## Testing
- Existing manual-path coverage in `tests/unit/lib/` doesn't reach `completeTasks` (that lives in the Deno function). Will add a Deno test for the scheduled path's overdue/today completion logic if practical, otherwise verify in prod once deployed.
