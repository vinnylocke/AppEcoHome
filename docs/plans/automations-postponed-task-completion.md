# Plan — Automation: Complete Postponed Tasks

## Problem

When a task has been postponed to today, it exists as a row in `tasks` with
`status = 'Postponed'` and `due_date = today`. However the task's blueprint
schedule may not mathematically land on today (the original due date was
earlier). This causes two failures:

1. **`checkControllingTaskDue`** — evaluates schedule maths only. Today is not
   a schedule hit, so it returns `false` → automation is gated out and skips.

2. **`completeTasks`** — when it finds an existing task row with status other
   than `'Pending'`, it treats the task as `already_done` and skips it.
   `'Postponed'` should be treated the same as `'Pending'`.

## Fix

### `checkControllingTaskDue`

After the existing schedule-maths loop, add a second check: query `tasks` for
any row where `blueprint_id IN (bpIds) AND due_date = today AND status =
'Postponed'`. If any row exists, return `true` regardless of schedule maths.

```ts
// After the existing for-loop that returns false:
const { data: postponed } = await db
  .from("tasks")
  .select("id")
  .in("blueprint_id", bpIds)
  .eq("due_date", today)
  .eq("status", "Postponed")
  .limit(1);

if (postponed && postponed.length > 0) return true;
return false;
```

### `completeTasks` — scheduled path

Change the `already_done` guard to only skip statuses that are genuinely
terminal (`Completed`, `Skipped`). Treat `Postponed` the same as `Pending`:

```ts
// Old
if (existingTask.status !== "Pending") {
  results.push({ ..., already_done: true });
  continue;
}

// New
const terminalStatuses = ["Completed", "Skipped"];
if (terminalStatuses.includes(existingTask.status as string)) {
  results.push({ ..., already_done: true });
  continue;
}
// Falls through to update → completes Pending and Postponed alike
```

### `completeTasks` — manual path

Same change: the manual path currently skips any task where
`status !== 'Pending'`. Update to only skip `Completed` and `Skipped`.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/run-automations/index.ts` | `checkControllingTaskDue` + `completeTasks` (both paths) |

## No migration needed
