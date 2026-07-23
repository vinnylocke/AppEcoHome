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

**Materialisation must carry the blueprint's ownership/visibility fields.** Both the frontend materialiser (`buildGhostPayload`) and the `generate-tasks` cron copy `scope`, `created_by`, `assigned_to` (and `plan_id`) from the blueprint onto the new `tasks` row. Dropping them lets the row take the DB defaults (`scope='home'`, `created_by=NULL`), which made a **personal** routine's occurrence home-visible to every member and dropped it from the author's "Mine" filter, and made plan-linked routines vanish from plan views (bug-audit-2026-07-10 #5). Completion visibility keys off `tasks.completed_at` — the table has **no `updated_at` column**, so any code reading `updated_at` silently gets `undefined` (bug-audit-2026-07-10 #11).

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
| `weather_event_key` | text? | **2026-07-10 weather-driven tasks.** Set on standalone tasks created by `analyse-weather` from a weather event (`heatwave:{date}:area:{id}` / `:loc:{id}`). Drives the TaskList "Weather task" chip and the automation `complete_task` weather sweep. NULL on every other task. Created rows always carry a real `location_id` (dashboard count safety). See [Weather](./27-weather.md). |

### Seasonal window-task semantics (Wave 20; Pruning added 2026-07)

Harvesting blueprints used to fire a ghost every day inside the window (`frequency_days: 1`) — a 90-day harvest window meant 90 overdue tasks if the user couldn't harvest on day one. Wave 20 fixed this for harvest; **2026-07 extended the same model to Pruning** (seasonal pruning is one window task, not a task per day). The set of "seasonal window" task types lives in [`src/lib/windowTasks.ts`](../../../src/lib/windowTasks.ts) (`isSeasonalWindowType` → `Harvesting` / `Harvest` / `Pruning`), mirrored in the `generate-tasks` cron.

- The ghost engine ([`src/lib/taskEngine.ts`](../../../src/lib/taskEngine.ts) — seasonal window branch) now emits **one ghost per window** when `isSeasonalWindowType(bp.task_type) && bp.end_date`. The ghost's `due_date` is the window start; `window_end_date` is the window close.
- **Window-aware suppression:** the ghost is suppressed if the blueprint has **any** real task whose `due_date` sits anywhere in `[window_start, window_end]` — not just one exactly at the window start. Pre-existing rows (daily-materialised then completed) land on arbitrary in-window days; an exact-date check emitted a **phantom** window ghost alongside the completed task (fixed 2026-07-09). A **completed** window task also stays visible while its window is still open (`window_end_date >= rangeStart`), rather than vanishing the day after completion.
- **Transition backfill:** existing pruning tasks predate the window field. `20260908000000_backfill_pruning_window_end_date.sql` sets `window_end_date` from the blueprint on non-Skipped pruning tasks of windowed blueprints — so a completed pruning is recognised as in-window (the dashboard "remaining today" query fetches it → it suppresses the ghost in the count).
- **Everything downstream is generic** (`window_end_date`-keyed), not type-keyed: visibility, overdue, day-strip bucketing, `computeDoneToday`, calendar tinting, TaskList "in-window" styling — so pruning windows inherited them for free.
- **The Garden Brain Daily Brief is a completion-aware consumer (2026-07-23).** `generate-daily-brief` `gatherSignals` builds its `windows` signal from `task_blueprints`, but now also cross-checks `tasks`: a window whose task is `Completed`/`Skipped` and still covers today (blueprint_id match, `window_end_date >= today`) is dropped, so the brief stops showing "{title} window is open" once the user has finished it — mirroring the ghost engine's window-aware suppression. See [Garden Brain](./39-garden-brain.md).
- **Completion UX:** harvest uses the yield/AI footer (`HarvestWindowFooter`). Pruning has no yield, so it uses `PruningWindowFooter` — **"Done pruning"** (complete) + **"Still pruning"** (snooze 3/5/7, capped at window end → chip away, task stays open). Window-closed: `PruningWindowClosedFooter` = "Mark done" / "Mark missed" (Skipped). Completed windowed tasks show a "Harvest completed {date}" / "Pruning completed {date}" chip.
- Visibility queries include the task as long as `window_end_date >= startDate AND due_date <= endDate`.
- `isTaskOverdue(task, today)` returns false while `today <= window_end_date`.
- "Not yet" snoozes set `next_check_at = today + N` (3 / 5 / 7 days, capped at `window_end_date`). The task disappears from Today until then.
- AI ripeness path: `HarvestRipenessSheet` (new component) sends one photo through `analyse_comprehensive`, reads `edibility.ripeness`, and either completes the task or sets `next_check_at` automatically.
- Window-end behaviour: when `today > window_end_date` and the task is still Pending, the modal switches to "Log yield anyway / Mark missed" (the latter sets `status = 'Skipped'`).

### Harvest canonical-window invariant (Wave 21.0004)

Wave 20 introduced the window model on the frontend ghost engine + `buildGhostPayload`, but the **`generate-tasks` cron was never updated** — it kept materialising one daily Pending task per harvest blueprint with `window_end_date = NULL`. Those daily tasks appeared alongside the canonical window task across every in-window day and looked like duplicates (the user-reported "doubled up after skipping" bug).

Wave 21.0004 closes this with three reinforcing changes:

1. **`generate-tasks` skips seasonal-window blueprints with `end_date`** (`SEASONAL_WINDOW_TYPES` = Harvesting/Harvest/**Pruning**) — they're owned by the frontend ghost engine now. The cron logs `harvestSkipped` per run for observability. (2026-07: a one-shot migration `20260907000000_cleanup_daily_pruning_tasks.sql` deleted the leftover daily Pending pruning rows the cron had already made, so the single window task takes over.)
2. **`taskEngine` defensive dedup** — after fetch, if a Pending harvest task with `window_end_date` set exists for a blueprint, any Pending non-window harvest task for the SAME blueprint whose `due_date` falls inside the canonical window is dropped from the rendered list. Belt-and-braces for cached browser sessions and any future drift.
3. **One-shot prod cleanup** — `DELETE FROM tasks WHERE status='Pending' AND window_end_date IS NULL AND blueprint_id IN (harvest blueprints with end_date)` ran post-deploy. The DELETE scope is narrow enough that watering / pruning / planting tasks are untouched.

Invariant going forward: **at most one Pending harvest task per blueprint at any time**, with `window_end_date` matching `blueprint.end_date`.

### Annual carry-over — `recurrence_kind` (Track B, 2026-07)

Before this, `task_blueprints.start_date` / `end_date` were **frozen single-year dates**: once `end_date` passed, the ghost engine stopped and nothing recreated the routine next year (harvest/pruning/seasonal-watering all expired after one season). Two columns fix that (`20261021000000_blueprint_recurrence_kind.sql`):

| Column | Type | Meaning |
|--------|------|---------|
| `recurrence_kind` | text NOT NULL DEFAULT `'once'` (CHECK in `once` / `annual` / `lifecycle_capped`) | `once` = terminal at `end_date` (today's behaviour + manual one-offs). `annual` = the stored `start_date`/`end_date` are a **MM-DD template**; the engine projects one occurrence per year on the same fixed calendar boundaries. `lifecycle_capped` = `annual` but stops after `recurs_until` (e.g. biennials). |
| `recurs_until` | date? | Terminal date for `lifecycle_capped` (NULL = uncapped). |

**Backfill** set existing recurring **Harvesting/Harvest/Pruning/Watering** blueprints with an `end_date` to `annual`; everything else stays `once`.

**Projection (`projectAnnualWindows`).** The single source of the roll is `src/lib/windowTasks.ts` (mirrored, byte-for-byte in logic, into `supabase/functions/_shared/annualWindows.ts` since Deno can't import from `src/`). It rolls the template MM-DD into each occurrence year — fixed boundaries (same dates every year), wrap-aware (a Nov→Feb window puts its end in year+1), leap-day-safe (02-29 → 02-28 in non-leap years), capped at `today + ANNUAL_PROJECTION_MAX_YEARS` (**5**, in `windowTasks.ts`), and never past `recurs_until`.

**Year-scoped completion — the load-bearing invariant.** Every projected occurrence embeds its year in its `due_date` (and thus its ghost id `ghost-{bp.id}-{YYYY-MM-DD}`), so the existing `unique_blueprint_date(blueprint_id, due_date)` UNIQUE index isolates each year's Completed/Skipped tombstone. Completing (or "complete all"-ing) a 2026 window writes 2026-dated rows that **cannot** suppress the 2027 occurrence — the ghost engine's window-aware suppression (`hasWindowTask`) now tests the specific projected year's `[start, end]`, not the blueprint's literal span.

**Consumers of the projection** (all roll to the current year rather than reading the literal stored dates):
- `taskEngine.buildRenderTasks` — window branch emits one ghost per projected year; the frequency branch (seasonal watering) re-anchors its grid at each year's season start. Runs online **and** against the offline snapshot (pure JS).
- `locationTaskCounts.buildLocationTaskCounts` — the "remaining today" count rolls to the occurrence covering today instead of dying at the literal `end_date`.
- `generate-tasks` cron — annual seasonal-frequency routines re-materialise each year within the today+7d horizon (window types are still frontend-owned / skipped).
- `generate-daily-brief` (`buildWindowSignals`) + `generate-weekly-overviews` — roll each blueprint into its current occurrence before deciding whether its window is open / opening; see [Garden Brain](./39-garden-brain.md).

**Authoring.** `recurrence_kind` is set automatically at schedule-generation time from the plant lifecycle (`src/lib/plantScheduleGenerator.ts` `buildBlueprintFromSchedule` + its mirror in `PlantScheduleTab.getDatesForBlueprint`: perennial → `annual`, biennial → `lifecycle_capped`, annual/unknown → `once`), and can be overridden by a **"Repeat every year"** toggle in the routine editors — `AddTaskModal` (which also backs BlueprintManager's edit, all four blueprint write paths) and `InstanceCareRoutine` (create path; the inline edit preserves the stored value). The toggle appears only when an `end_date` is set and writes `annual` / `once`; clearing the end date resets it to `once`. `BlueprintManager`'s "Next:" schedule preview rolls an `annual` blueprint's window into the current occurrence via `projectAnnualWindows` so it never shows the expired one.

A blueprint with a missing/null `recurrence_kind` (e.g. a pre-migration cached snapshot) safely degrades to `once` everywhere.

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
