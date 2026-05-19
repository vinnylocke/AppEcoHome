# Plan — Dashboard taskTotal Incorrectly Counts Skipped Tasks

## Problem

`home-dashboard-stats` calculates `taskTotal = tasks.length`, which includes tasks with
`status = 'Skipped'`. When a user "deletes" a task that has a `blueprint_id` (via TaskList),
the task is set to `status = 'Skipped'` rather than hard-deleted — this is intentional
(tombstoning prevents the ghost engine from regenerating the slot). But these Skipped tasks
are then invisible everywhere in the UI (TaskEngine filters them with `.neq("status", "Skipped")`)
while still being counted in the dashboard's "Total Tasks" stat.

Result: the user sees e.g. "4 Total Tasks" on the dashboard but 0 tasks in any task list.

## Fix

**`supabase/functions/home-dashboard-stats/index.ts`** — line 148

Change:
```ts
const taskTotal = tasks.length;
```
To:
```ts
const taskTotal = tasks.filter((t) => t.status !== "Skipped").length;
```

`completionRate` is already guarded against `taskTotal === 0` so no other change needed.

Rain-skipped tasks (`status = 'Skipped'` with `auto_completed_reason` containing "rain") are
already tracked separately via `taskSkippedByRain` — they correctly drop out of `taskTotal`
with this fix and keep their dedicated metric.

## No migration needed
## No new files
