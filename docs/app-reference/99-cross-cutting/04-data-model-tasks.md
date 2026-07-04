# Data Model — Tasks, Blueprints, Dependencies, Ghosts

> Three concepts: **`tasks`** (real, persisted task instances), **`task_blueprints`** (recurring templates that fire daily via cron), and **"ghost tasks"** (virtual task instances generated at runtime from blueprints, not persisted until the user interacts).

---

## Quick Summary

```
task_blueprints (template, recurring)
├── title, task_type, frequency_days, start/end dates
├── scope: location / area / plant / inventory_item
├── paused_until?, is_archived
└── (cron generates →)
    tasks (real rows, one per fired instance)
    ├── due_date, status
    ├── completion_photo_url
    └── completed_at, completed_by

ghosts (virtual, not persisted)
└── id format: "ghost-{blueprint_id}-{YYYY-MM-DD}"
```

Ghost tasks are materialised into real `tasks` rows when the user acts on them (complete / edit / delete).

---

## Role 1 — Technical Reference

### `task_blueprints` columns (subset)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | |
| `user_id` | uuid? | For personal-scope blueprints |
| `title` | text | |
| `task_type` | text | Watering / Pruning / Harvesting / Maintenance / Planting |
| `description` | text | |
| `frequency_days` | int | |
| `start_date` | date | |
| `end_date` | date? | |
| `paused_until` | date? | |
| `location_id`, `area_id`, `plan_id` | uuid? | |
| `inventory_item_ids` | uuid[] | Multi-link |
| `seed_packet_id` | uuid? | FK → `seed_packets(id)` ON DELETE SET NULL. Set on `task_type = 'Planting'` to bridge the task → Nursery. See [Data Model — Nursery](./33-data-model-nursery.md). |
| `scope` | text | home / personal |
| `is_archived` | bool | Soft delete |
| `ai_generated` | bool | Tag |

### `tasks` columns (subset)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | |
| `blueprint_id` | uuid? | FK back to template |
| `user_id` | uuid? | Personal scope |
| `title`, `description`, `task_type` | text | |
| `due_date` | date | |
| `status` | text | Pending / Completed / Postponed / Skipped |
| `completion_photo_url` | text | |
| `completed_at` | timestamptz | |
| `completed_by` | uuid | |
| `location_id`, `area_id`, `plan_id`, `inventory_item_ids` | | |
| `seed_packet_id` | uuid? | FK → `seed_packets(id)`. Drives the inline `LogSowingFromTaskModal` on completion. Inserts a `seed_sowings` row with `task_id` set (unique partial index ensures idempotency). |
| `todo_list_id` | uuid? | FK → `todo_lists(id)` ON DELETE SET NULL. Back-link to the parent to-do list when the task was created via the [Add To-Do List modal](../08-modals-and-overlays/40-todo-lists.md). NULL for every other task. |
| `window_end_date` | date? | **Wave-20 harvest window model.** For tasks generated from a Harvesting blueprint with both `start_date` and `end_date`, this is the last day the harvest window is open. The task is "active" through `due_date..window_end_date` and only flags overdue afterwards. NULL on all other tasks. |
| `next_check_at` | date? | **Wave-20 snooze.** When the user (or AI ripeness check) defers a window task via "Not yet", this is the date the task should re-appear. While in the future, the task is hidden from Today / Calendar queries. NULL on completion / window close. |

### Harvest window-task semantics (Wave 20)

Harvesting blueprints used to fire a ghost every day inside the window (`frequency_days: 1`) — a 90-day harvest window meant 90 overdue tasks if the user couldn't harvest on day one. Wave 20 fixed this:

- The ghost engine ([`src/lib/taskEngine.ts`](../../../src/lib/taskEngine.ts) — harvest branch) now emits **one ghost per window** when `bp.task_type === "Harvesting" && bp.end_date`. The ghost's `due_date` is the window start; `window_end_date` is the window close.
- Visibility queries include the task as long as `window_end_date >= startDate AND due_date <= endDate`.
- `isTaskOverdue(task, today)` returns false while `today <= window_end_date`.
- "Not yet" snoozes set `next_check_at = today + N` (3 / 5 / 7 days, capped at `window_end_date`). The task disappears from Today until then.
- AI ripeness path: `HarvestRipenessSheet` (new component) sends one photo through `analyse_comprehensive`, reads `edibility.ripeness`, and either completes the task or sets `next_check_at` automatically.
- Window-end behaviour: when `today > window_end_date` and the task is still Pending, the modal switches to "Log yield anyway / Mark missed" (the latter sets `status = 'Skipped'`).

### Harvest canonical-window invariant (Wave 21.0004)

Wave 20 introduced the window model on the frontend ghost engine + `buildGhostPayload`, but the **`generate-tasks` cron was never updated** — it kept materialising one daily Pending task per harvest blueprint with `window_end_date = NULL`. Those daily tasks appeared alongside the canonical window task across every in-window day and looked like duplicates (the user-reported "doubled up after skipping" bug).

Wave 21.0004 closes this with three reinforcing changes:

1. **`generate-tasks` skips harvest blueprints with `end_date`** — they're owned by the frontend ghost engine now. The cron logs `harvestSkipped` per run for observability.
2. **`taskEngine` defensive dedup** — after fetch, if a Pending harvest task with `window_end_date` set exists for a blueprint, any Pending non-window harvest task for the SAME blueprint whose `due_date` falls inside the canonical window is dropped from the rendered list. Belt-and-braces for cached browser sessions and any future drift.
3. **One-shot prod cleanup** — `DELETE FROM tasks WHERE status='Pending' AND window_end_date IS NULL AND blueprint_id IN (harvest blueprints with end_date)` ran post-deploy. The DELETE scope is narrow enough that watering / pruning / planting tasks are untouched.

Invariant going forward: **at most one Pending harvest task per blueprint at any time**, with `window_end_date` matching `blueprint.end_date`.

### `todo_lists` table

Sibling table that groups N `tasks` rows under a shared `due_date`. Created by the user via the Add To-Do List modal; managed via the My To-Do Lists modal.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | FK → `homes(id)` ON DELETE CASCADE |
| `name` | text? | Optional; UI shows "To-do for {due_date}" when null |
| `due_date` | date | Single shared due date for every linked task |
| `created_by` | uuid? | FK → `auth.users(id)` ON DELETE SET NULL |
| `created_at` | timestamptz | Default `now()` |

Indexes: `todo_lists_home_created_idx (home_id, created_at desc)`, `tasks_todo_list_idx` partial index on `tasks(todo_list_id) where todo_list_id is not null`.

Status is **derived**, not stored — a list is complete iff every linked task is `Completed` or `Skipped`. No trigger, no drift. RLS mirrors `tasks`: `home_members` of the matching `home_id` get full CRUD.

### `unique_blueprint_date` constraint

Prevents duplicate materialised tasks for the same blueprint on the same date. Critical for seeded test data — physical tasks in seeds use `blueprint_id = NULL` to avoid violating this.

### Ghost tasks

`TaskEngine.fetchTasksWithGhosts(...)` returns a union of:
- Real `tasks` rows.
- Ghost objects synthesised from each active blueprint's projected dates.

Ghost id format: `ghost-{blueprint_id}-{YYYY-MM-DD}`. Frontend can distinguish via `task.isGhost`.

**Ghost date math is pure UTC.** Date-only strings parse as UTC midnight, so the old local-getter formatting (`getLocalDateString`) emitted every ghost a day early west of UTC — breaking the `(blueprint_id:due_date)` dedup against cron-materialised tasks and inserting wrong-date rows on materialisation. The grid is now projected in UTC milliseconds and formatted via `toISOString()`.

**Pause semantics (`paused_until`).** Occurrences strictly **before** `paused_until` are skipped *permanently* — a past pause window never resurrects its ghosts as overdue. Occurrences **on/after** `paused_until` still emit even while the pause is active, so a one-week pause doesn't blank next month's calendar. (Previously a paused blueprint emitted no ghosts at all during the pause, then resurrected in-pause occurrences as overdue once it lapsed.) The one-per-window harvest ghost is the exception: it's a single long-lived task, so it's suppressed entirely while `today < paused_until` and reappears once the pause lapses if the window is still open.

### Materialisation

When the user completes / postpones / edits a ghost, `materializeTask(ghost)` inserts a real `tasks` row and returns it.

### Shared mutation core — `src/lib/taskActions.ts` (RHO-17)

The complete / skip / postpone semantics that used to live inline in `TaskList.tsx` are extracted into `src/lib/taskActions.ts` so the Garden Walk and the task list share **one implementation**:

- `completeTask(task, {homeId, userId})` — ghost → INSERT a Completed row via `buildGhostPayload`; physical → UPDATE. Fires `logEvent(task_completed)` + `maybeCreateAutoEntry` (auto journal). Completion **keeps `due_date`** (the task stays on its due day) and sets `completed_at=now`. "Late" is never persisted — it is derived at render time via `lateCompletionDueDate` (`src/lib/taskEngine.ts`): late ⟺ Completed AND `completed_at`'s **local** day > `window_end_date ?? due_date` (snooze/`next_check_at` ignored). The calendar (both due-day + completion-day) and any `TaskList` surface show a "Completed late — due X · done Y" chip from this predicate (RHO-19).
- `skipTask(task)` — ghost → Skipped tombstone INSERT; physical → UPDATE `status='Skipped'`. Fires `task_skipped`.
- `postponeTask(task, newDate)` — ghost → tombstone + Pending at the new date; physical blueprint-linked → UPDATE Skipped + INSERT Pending; standalone → UPDATE `due_date`. Fires `task_postponed` with `delay_days`.
- `materialiseGhost(ghost, status, overrides, select)` — the ghost INSERT with a **`unique_blueprint_date` 23505 fallback**: if the slot was already materialised from another surface (walk + task list in two tabs), it recovers by UPDATEing the existing `(blueprint_id, due_date)` row instead of failing.

`TaskList.tsx` calls `materialiseGhost` (its ghost-complete branch) and `postponeTask`; its offline-queue, optimistic-UI, blueprint-shift and sowing/automation side-effects remain component-local. Any new surface adding task actions must call these functions, not re-implement the branches.

### `generate-tasks` cron

Daily job that materialises upcoming task rows from recurring blueprints. Current behaviour:

- Loads only `is_recurring = true` **and `is_archived = false`** blueprints — archived (soft-deleted) blueprints must never materialise (the cron re-creating tasks for a soft-deleted schedule was the "archived blueprint keeps watering" bug).
- Projects occurrences **strictly from the start_date grid** (`start_date + k·frequency_days`) — the same phase the frontend ghost engine uses. It no longer anchors on the last existing task (which drifted the grid after a postpone) or clamps new blueprints to today (which put them off-grid); both used to make the cron and the ghost engine emit the same schedule on different days (double-frequency duplicates).
- The old unbounded last-task scan is gone entirely — it was silently truncated at PostgREST's `max_rows=1000`, which restarted old blueprints from today. Dates that already have a task (including postponed originals) are dropped by the `unique_blueprint_date` constraint at insert time.
- **Skips occurrences before `paused_until` permanently**; the grid resumes at the first occurrence on/after it — matching the ghost engine's pause semantics.
- Still skips harvest blueprints with `end_date` (owned by the frontend ghost engine — see the Wave 21.0004 invariant above).

### Dependencies

Some tasks have `blocked_by_task_id` for chains (rare today).

---

## Role 2 — Expert Gardener's Guide

### Why ghosts exist

Blueprints can fire daily for years. If we materialised every future occurrence, the DB would balloon. Ghosts give the *illusion* of a populated calendar without the storage cost — only the ones you act on persist.

### Implications for users

- The dashboard / calendar shows both ghosts and real tasks.
- Marking a ghost complete actually creates a real task row in that moment.
- Deleting a ghost just hides it from the projection — doesn't affect the blueprint.

---

## Related reference files

- [Blueprint Manager](../04-planner/07-blueprint-manager.md)
- [Add Task / Edit Schedule Modal](../08-modals-and-overlays/01-add-task-modal.md)
- [Task Detail Modal](../08-modals-and-overlays/02-task-modal.md)
- [Optimise Tab](../04-planner/08-optimise-tab.md)
- [To-Do Lists — Add + Manage Modals](../08-modals-and-overlays/40-todo-lists.md)

## Code references for ongoing maintenance

- `src/lib/taskEngine.ts` — `fetchTasksWithGhosts`, `materializeTask`, `isTaskOverdue`, `isInsideHarvestWindow`, `daysLeftInWindow` (Wave 20)
- `src/lib/taskActions.ts` — shared complete/skip/postpone mutation core (RHO-17); `tests/unit/lib/taskActions.test.ts`
- `src/services/blueprintService.ts`
- `supabase/functions/generate-tasks/index.ts`
- `supabase/migrations/*_tasks.sql`, `*_task_blueprints.sql`
- `supabase/migrations/20260630000000_todo_lists.sql` — `todo_lists` table, `tasks.todo_list_id` column, RLS + grants
- `supabase/migrations/20260702000000_tasks_window_end_date.sql` — `window_end_date` + `next_check_at` columns + partial index (Wave 20 harvest model)
- `supabase/migrations/20260703000000_backfill_harvest_window_tasks.sql` — one-time backfill: sets `window_end_date` on existing pending Harvesting tasks AND collapses per-day duplicates per `(blueprint_id, window_end_date)` group by marking the extras `Skipped`
- `src/components/HarvestRipenessSheet.tsx` — AI photo-check sheet for in-window harvest tasks
- `src/components/HarvestPartialPickSheet.tsx` — partial-pick sheet (Wave 20.1): quantity + unit + notes form, inserts `yield_records` and snoozes the task without closing it
- `src/components/TaskCalendar.tsx` — Wave 20.2 harvest-window highlight: `collectHarvestWindowDates(tasks)` powers the green tint on every day inside an active harvest window; `localStorage["rhozly_calendar_harvest_windows"]` persists the on/off toggle in the calendar header
- `tests/unit/lib/taskOverdue.test.ts` — Vitest matrix for window-task overdue / in-window / days-left / collect-window-dates semantics
