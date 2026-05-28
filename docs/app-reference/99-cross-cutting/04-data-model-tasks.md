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

### `unique_blueprint_date` constraint

Prevents duplicate materialised tasks for the same blueprint on the same date. Critical for seeded test data — physical tasks in seeds use `blueprint_id = NULL` to avoid violating this.

### Ghost tasks

`TaskEngine.fetchTasksWithGhosts(...)` returns a union of:
- Real `tasks` rows.
- Ghost objects synthesised from each active blueprint's projected dates.

Ghost id format: `ghost-{blueprint_id}-{YYYY-MM-DD}`. Frontend can distinguish via `task.isGhost`.

### Materialisation

When the user completes / postpones / edits a ghost, `materializeTask(ghost)` inserts a real `tasks` row and returns it.

### `generate-tasks` cron

Daily job that iterates active blueprints (start ≤ today ≤ end, not paused, not archived) and either:
- Materialises tasks for today (older flow), or
- Lets the ghost system handle it on the fly.

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

## Code references for ongoing maintenance

- `src/lib/taskEngine.ts` — `fetchTasksWithGhosts`, `materializeTask`
- `src/services/blueprintService.ts`
- `supabase/functions/generate-tasks/index.ts`
- `supabase/migrations/*_tasks.sql`, `*_task_blueprints.sql`
