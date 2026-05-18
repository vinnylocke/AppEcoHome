# Plan — Week Overview coloured task counts

## Goal

Replace the single number on each day in the Week Overview strip with up to 4 coloured numbers showing the breakdown of task states, and keep overdue tasks visible on the day they were due (not hidden).

## The 4 states

| State | Colour | When |
|-------|--------|------|
| Pending | black | not completed, due today or future |
| Completed on time | green | completed on or before due date |
| Completed late | orange | completed after due date |
| Overdue | red | not completed, due date is past |

Only non-zero counts are shown. A day with all tasks completed on time shows one green number.

## What changes

### 1. Edge function — `supabase/functions/home-dashboard-stats/index.ts`

**Tasks query** — add `completed_at` to the select so we can compare it to `due_date`:
```
.select("id, status, type, due_date, completed_by, auto_completed_reason, completed_at")
```

**dayStrip build** — replace `total` + `completed` with the four bucketed counts:
```ts
const completedOnTime = dayTasks.filter(t =>
  t.status === "Completed" && t.completed_at?.slice(0,10) <= ds
).length;
const completedLate = dayTasks.filter(t =>
  t.status === "Completed" && t.completed_at?.slice(0,10) > ds
).length;
const overdue = dayTasks.filter(t =>
  t.status !== "Completed" && ds < today
).length;
const pending = dayTasks.filter(t =>
  t.status !== "Completed" && ds >= today
).length;
```

Keep `total` for backwards compat (sum of all four). Remove `completed` (replaced by `completedOnTime` + `completedLate`).

### 2. TypeScript types — `src/hooks/useHomeDashboardStats.ts`

Update `DayStrip` interface:
```ts
export interface DayStrip {
  date: string;
  total: number;
  completedOnTime: number;
  completedLate: number;
  overdue: number;
  pending: number;
  isPast: boolean;
  isToday: boolean;
}
```

### 3. Component — `src/components/HomeDashboard.tsx`

Replace the single `<span>` number with a small cluster of coloured pills, one per non-zero state. Keep the existing card layout (day label, number area, sub-label). The sub-label changes to show `total` count: "X tasks".

The number area becomes a `flex gap-0.5` row of coloured spans. On today's card (white text background) the colours are lightened versions so they remain legible on the green background.

### 4. Migration — backfill `completed_at` for historical tasks

Auto-completed tasks (`analyse-weather`, `run-automations`) already write `completed_at: new Date().toISOString()` in all current code paths — no change needed there.

However, tasks completed before this field was actively written may have `completed_at IS NULL`. Without a backfill, those tasks would fall into the `completedLate` bucket (because `null?.slice(0,10)` is `undefined`, and `undefined > ds` is `false`, `undefined <= ds` is also `false` — both conditions fail, leaving them uncounted). To keep them correctly counted, we use their `due_date` as a safe default.

**New migration** `supabase/migrations/20260518100000_backfill_completed_at.sql`:
```sql
UPDATE public.tasks
SET completed_at = due_date
WHERE status = 'Completed'
  AND completed_at IS NULL
  AND due_date IS NOT NULL;
```

Tasks with no `due_date` either: they are excluded from the day-strip query entirely (no due date = no day to pin them to), so leaving them as `NULL` is safe.
