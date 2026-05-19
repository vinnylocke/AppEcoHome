# Plan — Manual Automation Run Should Complete Overdue Tasks

## Problem

In `completeTasks` (manual path), the query to find existing tasks uses:

```ts
.in("blueprint_id", bpIds)
.eq("due_date", today)
```

An overdue task has `due_date = yesterday` (or earlier). The strict `= today` filter
misses it. The function then falls into the "no tasks found" branch and inserts a generic
marker task ("Automation ran") for today, leaving the real overdue task still Pending.

The Postponed fix from the previous session handles tasks with `status = 'Postponed'`
and `due_date = today` but does not cover tasks that are simply overdue (still `Pending`
with a past `due_date`).

## Fix

**`supabase/functions/run-automations/index.ts`** — manual path in `completeTasks`

Change:
```ts
const { data: existingTasks } = await db
  .from("tasks")
  .select("id, status, blueprint_id, title")
  .in("blueprint_id", bpIds)
  .eq("due_date", today);
```

To:
```ts
const { data: existingTasks } = await db
  .from("tasks")
  .select("id, status, blueprint_id, title")
  .in("blueprint_id", bpIds)
  .lte("due_date", today)
  .not("status", "in", "(\"Completed\",\"Skipped\")");
```

This finds all pending/postponed tasks for these blueprints due today **or earlier**.
The existing `["Completed", "Skipped"].includes(task.status)` guard inside the loop
becomes a no-op (already filtered out) but is safe to leave.

The "if no tasks, insert generic marker" branch is preserved: if there genuinely are no
pending/postponed tasks at all (e.g. they were all already completed by the user), the
automation still records that it ran.

## No migration needed
## No new files
## One file changed: `supabase/functions/run-automations/index.ts`
