# Plan — Day Strip Incorrectly Counts Skipped Tasks

## Problem

In `home-dashboard-stats`, the day strip is built from the raw `tasks` array which
includes Skipped tasks. Three calculations are wrong:

1. `total: dayTasks.length` — counts Skipped tasks → day cell says "4 tasks" for a day
   where 4 tasks were dismissed
2. `overdue: dayTasks.filter(t => t.status !== "Completed" && ds < today)` — Skipped
   tasks appear as overdue for past dates
3. `pending: dayTasks.filter(t => t.status !== "Completed" && ds >= today)` — Skipped
   tasks appear as pending for current/future dates

`tasks.total` stat card was fixed in the previous deploy to exclude Skipped, but the
day strip was not updated at the same time.

## Fix

**`supabase/functions/home-dashboard-stats/index.ts`** — inside the `while (stripDay <= stripEnd)` loop

Filter to non-Skipped tasks for all three counts:

```ts
const dayTasks = tasks.filter((t) => t.due_date.slice(0, 10) === ds && t.status !== "Skipped");
```

The overdue and pending calculations naturally follow from the same filtered set, so no
changes needed to those two lines — just the dayTasks assignment.

## No migration needed
## No new files
