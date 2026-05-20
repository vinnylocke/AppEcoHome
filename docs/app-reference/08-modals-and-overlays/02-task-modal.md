# Task Detail Modal

> The modal that opens when you tap any task — on dashboard, calendar, area card, plant instance. Shows the task in full, with complete/uncomplete, postpone, edit-blueprint-link, delete, and per-task completion photo upload.

**Source file:** `src/components/TaskModal.tsx` (~1,280 lines)

---

## Quick Summary

A modal with sections:
- **Header** — title + type icon + status chip.
- **Details** — date, location, area, plan, linked plants.
- **Actions** — Complete/Uncomplete, Postpone, Edit Blueprint, Delete.
- **Completion photo** — optional, uploaded after completion to `task-photos` bucket.
- **Linked instances** — list of plant instances this task touches.
- **Weather context** — if the day's weather data exists, shown inline.
- **Members** — who can see/work this task (home tasks only).

Handles ghost tasks: when you complete a ghost (virtual task from a blueprint), it gets materialised into `tasks` first, then marked complete.

---

## Role 1 — Technical Reference

### Component graph

```
TaskModal (Portal, focus-trapped)
├── Header (close, title, status)
├── Date row (CalendarClock)
├── Location → Area → Plan chips
├── Linked plant instances list
├── Action buttons row
│   ├── Complete / Uncomplete
│   ├── Postpone (date picker)
│   ├── Edit Blueprint (if from blueprint)
│   └── Delete (with confirm)
├── Completion photo (PhotoUploader)
├── Weather context (if available)
└── Members & visibility
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `task` | `any` | parent | The task or ghost row |
| `homeId` | `string` | parent | Scope |
| `inventoryDict` | `Record<string, any>` | parent | Plant name lookup |
| `isBlocked` | `boolean` | parent | Dependency-blocked tasks (can't complete) |
| `isUpdating` | `boolean` | parent | Action in flight |
| `onClose` | `() => void` | parent | Hide |
| `onDelete` | `() => void` | parent | Delete trigger |
| `onPostpone` | `() => void` | parent | Postpone trigger |
| `onToggleComplete` | `() => void` | parent | Complete trigger |
| `materializeTask` | `(task) => Promise<task>` | parent | Ghost → real row |
| `onTasksUpdated` | `() => void` | parent | Refresh parent |

### Data flow — write paths

- Completion photo: `tasks.update({ completion_photo_url }).eq("id", id)`.
- Toggle complete: parent's `onToggleComplete` (materialises ghost if needed).
- Postpone: parent's `onPostpone` (updates `tasks.due_date`).
- Delete: parent's `onDelete`.

### Edge functions invoked

None.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `generate-tasks` | Reads blueprints; ghosts manifest here |

### Realtime channels

None directly — parent refetches.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `tasks.edit_own` / `tasks.edit_any` / `tasks.delete_own` / `tasks.delete_any` — gate the action buttons.

### Error states

| State | Result |
|-------|--------|
| Photo upload fails | Toast |
| Action fails | Toast; UI reverts |

### Performance

- Single modal with focus trap.
- Photo upload streams; doesn't block other interactions.

### Linked storage buckets

- `task-photos` — completion photos.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

Every task on your dashboard/calendar opens to this view when tapped. Use it to:
- Mark complete (and snap a photo to remember).
- Postpone to a more sensible date.
- Edit the underlying schedule.
- Delete a one-off.

### Every flow on this modal

#### 1. Complete

- Tap "Complete" → task closes. If from a blueprint, ghost gets materialised first.

#### 2. Add completion photo

- After completing, the PhotoUploader appears. Optional.
- Snap a photo of the result — pruned hedge, harvested basket, etc.

#### 3. Postpone

- Tap "Postpone" → date picker → moves to a later date.

#### 4. Edit blueprint

- Only shown for blueprint-derived tasks.
- Opens AddTaskModal in blueprint-edit mode.

#### 5. Delete

- Tap trash → confirm. Removes the row (or unlinks the ghost from the blueprint).

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Status chip | Pending / Completed / Postponed / Skipped |
| Date | When it's due |
| Plant chips | Linked inventory items |
| Plan chip | If part of a plan |
| Weather row | Forecast for the due date |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Postponing instead of completing.** Postpone moves the task — it stays open. Use Complete to close it.
- **Deleting a blueprint-derived task.** That deletes the ghost; the blueprint keeps firing.
- **Marking complete out of order.** Some tasks have dependency chains — completing one out of order may not unlock the next.

### Recommended workflows

- **End-of-day tick-off:** open each completed task, mark Complete, snap a photo if proud.
- **Weather-driven postpone:** if rain is forecast and the task is "water", postpone with one tap.

### What to do if something looks wrong

- **Complete button disabled:** dependency blocked — check the blocking task.
- **Photo upload spinning:** large file. Try a smaller image.

---

## Related reference files

- [Add Task / Edit Schedule Modal](./01-add-task-modal.md)
- [Dashboard Tab](../02-dashboard/01-dashboard-tab.md)
- [Calendar Tab](../02-dashboard/03-calendar-tab.md)
- [Tasks Data Model (cross-cutting)](../99-cross-cutting/04-data-model-tasks.md)

## Code references for ongoing maintenance

- `src/components/TaskModal.tsx`
- `src/components/PhotoUploader.tsx`
- `src/hooks/useFocusTrap.ts`
- `task-photos` bucket policies
