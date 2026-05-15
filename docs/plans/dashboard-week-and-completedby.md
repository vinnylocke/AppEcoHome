# Plan — Dashboard week bounds, date range display, and per-member completion fix

## Problems

1. **Week start day**: `getLocalWeekBounds()` computes Monday→Sunday. The calendar is Sunday-start. Dashboard needs to match.
2. **No date range shown**: The week bounds are computed in the hook but never surfaced to the component.
3. **Member completion counts always 0**: `buildGhostPayload` produces rows with `created_by = null`. Physical tasks have `created_by = task creator`, not completer. The edge function attributes via `assigned_to ?? created_by`, which is almost always wrong. Need a dedicated `completed_by` column set at the moment of completion.
4. **Day strip labels**: `DAY_LABELS = ["Mon", …, "Sun"]` is Monday-first; must be `["Sun", …, "Sat"]`.

---

## Fix 1 — Week bounds (Sunday → Saturday)

**`src/hooks/useHomeDashboardStats.ts`** — `getLocalWeekBounds()`:

```typescript
// Old: daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
// New:
const daysFromSunday = dayOfWeek; // 0=Sun means 0 days back
const weekSunday = new Date(now);
weekSunday.setHours(0, 0, 0, 0);
weekSunday.setDate(weekSunday.getDate() - daysFromSunday);

const weekSaturday = new Date(weekSunday);
weekSaturday.setDate(weekSaturday.getDate() + 6);
weekSaturday.setHours(23, 59, 59, 999);
```

Also return `weekStart` and `weekEnd` strings from the hook so the component can display the range.

---

## Fix 2 — Date range display

Return `{ stats, loading, error, refresh, weekStart, weekEnd }` from `useHomeDashboardStats`.

In `HomeDashboard.tsx`, under the "Tasks This Week" section header, show:
```
"May 11 – May 17"
```
formatted from `weekStart` / `weekEnd` ISO strings using `toLocaleDateString`.

---

## Fix 3 — `completed_by` column

### Migration (new file)

```sql
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES auth.users(id);
```

### `src/components/TaskList.tsx`

`toggleTaskCompletion` — two paths need `completed_by`:
- Ghost path (`buildGhostPayload` override): add `completed_by: newStatus === "Completed" ? currentUserId : null`
- Physical path (`.update({…})`): add `completed_by: newStatus === "Completed" ? currentUserId : null`

`handleBulkComplete`:
- Ghost path (`buildGhostPayload` override): add `completed_by: currentUserId`
- Physical path (`.update({…})`): add `completed_by: currentUserId`

### `supabase/functions/home-dashboard-stats/index.ts`

Tasks select: add `completed_by` to the selected columns.

Member breakdown loop: replace `t.assigned_to ?? t.created_by` with `t.completed_by`.

---

## Fix 4 — Day strip labels

**`src/components/HomeDashboard.tsx`**:
```typescript
// Old:
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// New:
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
```

---

## Files changed

| File | Change |
|------|--------|
| `src/hooks/useHomeDashboardStats.ts` | Sunday start, export weekStart/weekEnd |
| `src/components/HomeDashboard.tsx` | Sun-first labels, date range display |
| `src/components/TaskList.tsx` | Set `completed_by` on completion (both ghost + physical, single + bulk) |
| `supabase/functions/home-dashboard-stats/index.ts` | Use `completed_by` for member attribution |
| `supabase/migrations/YYYYMMDDHHMMSS_completed_by.sql` | Add column |
