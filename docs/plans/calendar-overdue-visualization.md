# Plan — Calendar Overdue Task Visualization

## Goal

Give the calendar tab a clear visual history of missed and late-completed tasks:
- A red ✗ on a task's original due date (with a count badge if multiple tasks)
- A faint red ✕ on every subsequent day it remained uncompleted (carryover)
- A red ✓ on the day a previously-overdue task was completed late
- A green ✓ on the day any task was completed on time
- The agenda list for past dates shows overdue carryover tasks (with "OVERDUE since X" badge)
- On the day a late completion happened, the task shows in the agenda with a "completed late" style

---

## Constraints & Assumptions

- **Ghost tasks that were silently missed** (never materialized in the DB) cannot be shown as overdue — they don't exist in the `tasks` table until the user acts on them. Only physical tasks with `status = 'Pending'` and `due_date < today` are fetchable.
- **`completed_at`** is already being set on task completion (`toggleTaskCompletion` and `handleBulkComplete`). Older tasks may have `completed_at = null`; those cannot be accurately placed on their completion date.
- **Lookback window** for overdue fetch: 90 days. Tasks missed more than 90 days ago won't appear (avoids unbounded queries).
- **Late completions** tracked from the existing `tasks` array (covers prev/curr/next month). Tasks completed late whose `due_date` is outside the 3-month window won't appear as late completions on their `completed_at` date (acceptable edge case).

---

## Data Strategy

### New query — `overdueTasks`

In `fetchTasksAndBlueprints` in `TaskCalendar.tsx`, run a parallel second query:

```typescript
const ninetyDaysAgo = new Date();
ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
const { data: overdueData } = await supabase
  .from("tasks")
  .select("id, home_id, blueprint_id, title, description, status, due_date, type, location_id, area_id, plan_id, inventory_item_ids, completed_at")
  .eq("home_id", homeId)
  .eq("status", "Pending")
  .lt("due_date", todayStr)
  .gte("due_date", getLocalDateString(ninetyDaysAgo));
setOverdueTasks(overdueData || []);
```

Store in new state: `const [overdueTasks, setOverdueTasks] = useState<Task[]>([]);`

### Calendar cell indicators computed from two sources

For a given `dateStr` (ISO date string of the cell):

| Indicator | Source | Condition |
|-----------|--------|-----------|
| Green ✓ (`greenCount`) | `tasks` array | `status='Completed'` and `completed_at` date === `dateStr` and `completed_at` date === `due_date` date |
| Red ✗ (`redXCount`) | `overdueTasks` | `due_date === dateStr` (their origin date) |
| Faint ✕ (`faintCount`) | `overdueTasks` | `due_date < dateStr` and `dateStr < todayStr` (carryover days) |
| Red ✓ (`redCheckCount`) | `tasks` array | `status='Completed'` and `completed_at` date === `dateStr` and `due_date` date < `dateStr` |

The existing pending-dot display is kept for **future cells** only. For today and past cells, replace dots with the new indicators.

### Agenda task list for past selected dates

For a past date `d`:
1. **Regular tasks**: `tasks` where `due_date === d` (unchanged)
2. **Overdue carryover**: `overdueTasks` where `due_date < d` — annotated with `overdueCarryoverSince: due_date`
3. **Late completions**: `tasks` where `status='Completed'`, `completed_at.slice(0,10) === d`, and `due_date.slice(0,10) < d` — annotated with `lateCompletionFrom: due_date`

All three sets merged and passed as `preloadedTasks` to `TaskList`.

The carryover and late completion annotations (`overdueCarryoverSince`, `lateCompletionFrom`) are extra fields on the task objects — `TaskList` renders special badges for them without needing new props.

---

## Files Changed

### `src/components/TaskCalendar.tsx`
- Add `overdueTasks` state
- Add overdue fetch to `fetchTasksAndBlueprints` (run in parallel with existing TaskEngine call)
- Add `getCellIndicators(dateStr)` helper returning `{greenCount, redXCount, faintCount, redCheckCount, futurePending}`
- Rewrite calendar cell bottom area: past/today → indicators; future → existing dots
- Rewrite `agendaTasks` computation to include carryover + late completions for past dates
- Update legend to document the new symbols

### `src/components/TaskList.tsx`
- In the task card render, check `task.overdueCarryoverSince`: if set, show a red `OVERDUE` badge with the original due date
- Check `task.lateCompletionFrom`: if set, the completion indicator turns red/amber and shows "completed [X] days late" style
- No new props needed — all communicated via task object fields

---

## Risks & Edge Cases

- **Filter propagation**: Carryover tasks have their original `location_id`/`area_id`. The existing filter checks already work because the carryover tasks carry those fields.
- **Future dates**: No overdue indicators shown for future cells (only colored dots).
- **Ghost tasks**: If a ghost was never acted on, it won't appear as overdue — documented limitation.
- **`completed_at` null**: Skip those tasks for green/red-check indicators (graceful degradation).
- **Carryover tasks in "Completed" tab**: They appear only in the Pending tab — they ARE pending (isOverdue = true, but status !== 'Completed').
- **Performance**: 90-day lookback query is small (filtered by homeId, status=Pending, date range) and runs in parallel.

---

## Out of Scope

- Tests (per project convention, this will be noted but I'll implement the feature first)
- E2E test coverage (no seed data change required since overdue state is derived from existing tasks)
