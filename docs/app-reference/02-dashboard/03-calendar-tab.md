# Calendar Tab

> Month or Week view of every task in your home — past, today, future. The page where you decide *when* things happen, including drag-and-drop rescheduling and ICS export to your phone calendar.

**Route:** `/dashboard?view=calendar`
**Source files (entry points):**
- `src/components/TaskCalendar.tsx` — the calendar component
- `src/components/TaskList.tsx` — the right-hand agenda panel
- `src/components/AddTaskModal.tsx` — opened from the Add Task button
- `src/components/TaskModal.tsx` — opened when you tap a task
- `src/lib/icsExport.ts` — pure helper to build a .ics blob for export

---

## Quick Summary

A two-pane layout: calendar grid (month or week) on the left, agenda for the selected date on the right. The user picks dates, filters by task type / location / area / plan, drags tasks between days (week view), exports .ics for an external calendar, or adds a new task. All blueprints get rendered as ghost tasks until the user acts on them.

---

## Role 1 — Technical Reference

### Component graph

```
TaskCalendar.tsx
├── Header
│   ├── Title "Schedule"
│   ├── View toggle (Month / Week)        ← persisted in localStorage as rhozly_calendar_view
│   ├── Filter button (Type / Location / Area / Plan)
│   ├── Export ICS button
│   └── Today button
├── Filter panel (expanded only when toggled open)
│   ├── Task Type chips (TASK_CATEGORIES)
│   ├── Location dropdown
│   ├── Area dropdown (dependent on Location)
│   └── Plan dropdown
└── Main two-pane layout (flex flex-col lg:flex-row)
    ├── Calendar pane
    │   ├── Month / Week header (date string)
    │   ├── ← → navigation buttons (shifts month or week)
    │   ├── Weekday labels row
    │   └── Calendar grid
    │       ├── Month view: 7×6 cells, day numbers + dot indicators
    │       └── Week view: 7 columns of task chips, drag-and-drop enabled
    └── Agenda pane
        ├── Selected-date header
        ├── Add Task button
        └── TaskList (filtered to selectedDate, includes overdue if today)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope all queries |
| `preloadedLocations` | `any[]` | App.tsx | Avoid an extra round-trip |
| `aiEnabled` | `boolean` | App.tsx (`profile.ai_enabled`) | Threaded into AddTaskModal for the generate-from-photo feature |

### Major local state

| State | Type | Purpose |
|-------|------|---------|
| `currentDate` | `Date` | Driving month / week window |
| `selectedDate` | `Date` | The day shown in the right-pane agenda |
| `calendarView` | `"month" \| "week"` | View toggle, persisted in localStorage |
| `tasks` | `Task[]` | Physical + ghost tasks in the visible window |
| `overdueTasks` | `Task[]` | Pending tasks with due_date < today, regardless of window |
| `locations`, `plans`, `inventoryDict`, `blockedTaskIds` | various | Filter dropdowns + dependency check support |
| `selectedTypes`, `selectedLoc`, `selectedArea`, `selectedPlan` | filter state | Active filters |
| `draggingTaskId`, `dragOverDate`, `rescheduling` | drag state | HTML5 drag-and-drop in week view |
| `isAddingTask` | `boolean` | AddTaskModal open |

### Data flow — read paths

#### `fetchTasksAndBlueprints()` (the core fetch)

Fires on:
- Mount + every `currentDate` change (debounced via useEffect dep)
- Realtime task change (`useHomeRealtime` hook)
- After every successful mutation (toggle complete, drag-reschedule, delete, postpone)
- Refresh button

Steps:

1. Determine the visible window — currentDate's calendar grid bounds (the 42-day month grid window or 7-day week window).
2. **Round 1 — parallel calls**:
   - `supabase.from('tasks').select('...').eq('home_id', homeId).gte('due_date', startDate).lte('due_date', endDate)` — physical tasks in the window plus completed-in-window
   - `supabase.from('task_blueprints').select('*, locations(name,is_outside), areas(name), plans(name)').eq('home_id', homeId).eq('is_recurring', true).eq('is_archived', false)` — active blueprints (with `paused_until` filter applied client-side)
   - `supabase.from('tasks').select('blueprint_id, due_date').eq('status', 'Skipped').gte/lte` — skip tombstones
3. **Round 2 — derived fetch**:
   - All unique `inventory_item_ids` from physical + blueprint rows → `inventory_items` join to enrich tasks with plant name + thumbnail
   - All physical task IDs → `task_dependencies` to compute blocked tasks
4. **Generate ghost tasks** — pure JS loop in `TaskEngine` (no DB call). For each blueprint, compute upcoming `due_date` values from `start_date + frequency_days`. Skip paused blueprints and tombstoned dates.
5. **Compute `overdueTasks`** — separate fetch for `status='Pending'` AND `due_date < today` outside the window.

Output (loaded into state):
- `tasks` = physical + ghosts
- `overdueTasks` = all pending overdue across home
- `blockedTaskIds` = `Set<string>` of task IDs with unmet dependencies

**Caching:** none — every fetch hits Supabase. Considered for a future pass but realtime + small data volume makes caching unnecessary here.

**RLS:** standard `home_members` policy on tasks, blueprints, inventory_items.

#### Filter dropdowns

- Locations + areas: from `preloadedLocations` prop (no extra fetch).
- Plans: `supabase.from('plans').select('id, name').eq('home_id', homeId)` — one-off on mount.

### Data flow — write paths

#### Task toggle complete

Path: `TaskList.toggleTaskCompletion()` (not on TaskCalendar directly).

#### Drag-reschedule (week view)

Path: `TaskCalendar.handleDropOnDate(targetDate)`.

- If task is a ghost → `supabase.from('tasks').insert({...})` with the new due_date (materialises it).
- If real → `supabase.from('tasks').update({ due_date: newDateStr }).eq('id', task.id)`.
- After write: `await fetchTasksAndBlueprints()` to refresh state.

**Optimistic UI:** none on the calendar surface itself — the `rescheduling` spinner shows for ~200 ms while the update completes. The drag itself shows immediate visual feedback (dragged chip fades to 40% opacity).

**Offline behaviour:** does not currently route through `offlineQueue` — drag-reschedule fails outright when offline. Tracked in deferred items as "expand queue kinds".

#### ICS Export

Path: `handleExportIcs()` → `buildTasksIcs(tasks)` + `downloadIcs(ics, filename)`.

Includes all pending tasks with `due_date >= today AND due_date <= today + 90 days`. All-day VEVENT entries.

### Edge functions invoked

None directly. The Add Task Modal invokes `generate-task-from-photo` when used.

### Cron / scheduled jobs that affect this surface

| Cron | Cadence | Effect |
|------|---------|--------|
| `generate-tasks` | Daily AM | Materialises today's blueprint tasks; calendar shows them once visible window includes today |
| `update-plant-states` | Daily | Indirect — may complete planting tasks, advancing plant states |
| `run-automations` | Every 5 min | May complete tasks via integrations (e.g. valve opened → watering task done) |
| `pattern-scan` | Daily | Indirect — pattern hits surface elsewhere |

### Realtime channels

`useHomeRealtime({ homeId })` subscribes to `postgres_changes` on `tasks` filtered by `home_id`. Any insert/update/delete triggers `fetchTasksAndBlueprints()`.

### Tier gating

| Tier | Differences |
|------|-------------|
| Sprout | Full calendar. AddTaskModal's "Generate from photo" panel shows "AI tier required" pill. |
| Botanist | Same as Sprout. |
| Sage | Full calendar + generate-from-photo works (calls `generate-task-from-photo` Gemini Vision edge fn). |
| Evergreen | Same as Sage. |

### Beta gating

None.

### Permissions / role-based UI

- Adding / deleting tasks gated via `tasks.create` / `tasks.delete` permission keys checked in AddTaskModal + TaskModal, not in TaskCalendar.

### Error states

| State | Visible result |
|-------|----------------|
| `fetchError = true` | Inline red banner with Retry button above the grid |
| Loading | Centered spinner overlay on the calendar grid |
| Rescheduling | Same centered spinner, "Moving task..." implicit |
| No tasks in selected date | TaskList shows its own "Free day" empty state |

### Performance notes

- Generating ghost tasks is O(blueprints × cycles_in_window). With < 50 blueprints and 42-day window this is well under 1 ms.
- Drag-and-drop uses native HTML5 events — no `@dnd-kit` dependency.
- TaskList in the agenda pane is `key={selectedDate.toISOString()}` so changing dates does a full remount; this is intentional for clean state.

### Linked storage buckets

None directly. AddTaskModal's photo flow touches `plant-images/task-completions`.

---

## Role 2 — Expert Gardener's Guide

### Why open this view

The Calendar tab answers "when does what need doing?" Where the Dashboard tab tells you about *today*, the Calendar lets you walk forwards and backwards across your gardening year. For a beginner, it's the discoverability of recurring tasks — "oh, I have watering set every 3 days, that's what those dots mean." For an experienced gardener, it's the planning canvas: drag the tomato pruning task from Tuesday to Saturday because you're away mid-week, export the whole next 90 days into your iPhone Calendar so it lives next to your work calendar, batch-look at when your spring planting tasks land.

### Every flow on this view

#### 1. Switch between Month and Week view

- **Month view:** 7×6 grid of days with task-count dots colour-coded by type. Best for "where are my busy weeks?"
- **Week view:** 7 vertical columns showing task chips inline with each day. Best for "I want to drag tasks around." Persists in localStorage.

#### 2. Navigate forward / back

- The ← → arrows shift by month (in month view) or week (in week view). The "Today" button jumps back to now.

#### 3. Filter

- Tap the Filters button to open a panel where you can pick:
  - **Task Type** (Watering / Pruning / etc.) — multi-select chips
  - **Location** → **Area** (cascading)
  - **Plan**
- Active filters show a `!` badge on the Filters button. "Clear All" resets.

#### 4. Tap a day cell

- The right-hand agenda updates to that date. If today is selected and there's overdue, the overdue tasks show first with a "carrying over since..." label.

#### 5. Drag a task to a different day (Week view only)

- **What you see:** task chips are draggable; day columns highlight on hover.
- **What happens:** drop changes `due_date`. Ghost tasks materialise automatically into real `tasks` rows.
- **Why a gardener cares:** the most common rescheduling case is "I'm not free Tuesday, push to Saturday." This is the one-gesture way.

#### 6. Mark a task complete (from the agenda pane)

- Tap the checkbox. Optimistically completes (instant tick), syncs in background. If offline, queues via the offline queue.

#### 7. Add Task

- Opens AddTaskModal. You can create a one-off task or a recurring schedule. Has the AI generate-from-photo button if you're on Sage/Evergreen.

#### 8. Export to Calendar (ICS)

- Tap the Export button → downloads `rhozly-tasks-YYYY-MM-DD.ics` with all pending tasks for the next 90 days as all-day events.
- Import that file into Google Calendar / Apple Calendar / Outlook.
- It's a one-shot snapshot, not a subscribed feed. Re-export to refresh.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Day number | Date in the month |
| Coloured dots in a day cell (month view) | One dot per pending task type, capped at 3 dots + "+N more" |
| Green ✓ | Task done on this date (on time) |
| Amber ✓ | Done, but late (completed after its original due date). Shown on **both** the completion day AND the original due day, so selecting the due day no longer reads as "on time" (RHO-19). Lateness is derived at render via `lateCompletionDueDate` (`src/lib/taskEngine.ts`): late ⟺ Completed AND `completed_at`'s **local** day > `window_end_date ?? due_date` — a harvest completed inside its open window is never late. The agenda chip reads `Completed late — due 1 Jul · done 2 Jul` (actual completion date shown). |
| Red ✗ | Overdue (pending, due date past) |
| Faint ✕ | Missed (overdue task whose due date is older than the cell's date) |
| Sparkles ✨ (top-right) | Day contains tasks involving plants matching your quiz preferences |
| Today | Subtly highlighted with primary-tint background |
| Selected day | Inverted colour (white text on primary bg) |
| Task chip (week view) | Coloured dot by type, truncated task name |
| Ghost task | Italic in week view, marked `isGhost` in code; same in agenda |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Calendar works fully. AddTaskModal's photo-generate panel is gated. |
| Botanist | Same. |
| Sage | Photo-generate works. |
| Evergreen | Photo-generate works. |

### New user vs returning user vs power user

- **Brand new user**: empty calendar. Today's cell is highlighted. The "Add Task" CTA in the agenda is the first action.
- **Returning user**: dotted days clearly mark recurring patterns (watering every 4 days = dots every 4 days). Agenda pane handles daily flow.
- **Power user**: drag-reschedule + filter chips become the daily driver. ICS export for sharing with a household.

### Beta user experience

No beta-only Calendar features.

### Common mistakes / pitfalls

- **Confusing ghost tasks with real ones.** Ghost tasks are virtual — generated on the fly from blueprints. They don't exist in the DB until you act on them (mark done, materialise via drag). Don't be confused if you "see 30 watering tasks" but the tasks table only has 5 rows.
- **Drag-and-drop in month view.** Currently only week view supports drag. Month view is a glance surface — open week view to reschedule.
- **ICS is one-shot, not live.** Importing the ICS into Google Calendar does not stay in sync. Re-export weekly if you want it fresh.
- **Pausing blueprints vs deleting them.** Going on holiday? Pause the blueprint (Blueprint Manager) instead of deleting. Paused blueprints stop generating ghosts until the pause ends.

### Recommended workflows

- **Weekly plan:** Week view → glance the next 7 columns → drag anything inconvenient to a better day → done.
- **End-of-day clean:** Today cell → tick anything completed. If everything done, tap "Today" colour goes green for the streak.
- **Going on holiday:** open Blueprint Manager → pause relevant blueprints for the duration → calendar shows clear days.
- **Sync to phone calendar:** Export ICS → email to yourself or AirDrop → import.

### What to do if something looks wrong

- **A task you completed still shows pending:** pull-to-refresh; if still wrong, check the `tasks` row directly. Probably a network failure between the toggle and the refresh.
- **Drag didn't move it:** check the offline indicator. Drag-reschedule doesn't queue offline yet (deferred item) — it only works online.
- **Recurring task missing days:** the blueprint may be paused. Open Blueprint Manager and check `paused_until`.

---

## Related reference files

- [Dashboard Tab](./01-dashboard-tab.md)
- [Blueprint Manager](../04-planner/07-blueprint-manager.md)
- [Add Task Modal](../08-modals-and-overlays/01-add-task-modal.md)
- [Task Detail Modal](../08-modals-and-overlays/02-task-modal.md)
- [Data Model — Tasks, Blueprints, Dependencies, Ghosts](../99-cross-cutting/04-data-model-tasks.md)
- [Offline Queue](../99-cross-cutting/16-offline-queue.md)

## Code references for ongoing maintenance

- `src/components/TaskCalendar.tsx` — entire component
- `src/lib/taskEngine.ts` — `fetchTasksWithGhosts` (ghost generation)
- `src/lib/icsExport.ts` — ICS string builder + download helper
- `src/components/TaskList.tsx` — right-pane agenda
- `supabase/functions/generate-tasks/index.ts` — daily cron that materialises blueprint tasks
- `supabase/migrations/20260602000000_blueprint_paused_until.sql` — pause feature schema
