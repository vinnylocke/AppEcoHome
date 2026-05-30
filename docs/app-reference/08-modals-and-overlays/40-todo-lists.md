# To-Do Lists — Add + Manage Modals

> A "to-do list" in Rhozly is a named (or auto-named) bundle of `tasks` rows that share a single due date. Two modals deliver the feature: **Add To-Do List** (compose) and **My To-Do Lists** (manage). Both write to `public.todo_lists`; their child tasks live in the regular `public.tasks` table with a back-link via `tasks.todo_list_id`.

**Triggers:**
- Add → `?open=add-todo-list` on `/dashboard?view=calendar` and `/quick/calendar`, plus the **List** quick-add menu items.
- Manage → `?open=todo-lists` on `/dashboard?view=calendar`, the "My To-Do Lists" entry in the Global Quick Add menu, and the **From: …** pill on any `tasks` row inside the [Task Detail Modal](./02-task-modal.md).

**Source files:**
- `src/components/todo/AddToDoListModal.tsx`
- `src/components/todo/ToDoListsModal.tsx`

---

## Quick Summary

To-do lists exist for the *"five things I need to do on Saturday"* moment. The user types a date once, adds N task rows in one sheet, and saves. Each row lands in `tasks` as a normal one-off task — calendar, agenda, automations, and offline queue all treat them like any other task. The manage modal then lets the user tick rows off, edit titles/descriptions, delete individual tasks, or delete the entire list (with or without cascading to the tasks). The list's completion status is **derived**, not stored: complete iff every linked task is `Completed` or `Skipped`.

---

## Role 1 — Technical Reference

### Component graph

```
AddToDoListModal (Portal, focus-trapped sheet)
├── Backdrop (click-to-close, suppressed while saving)
├── Sheet
│   ├── Header — title + close ×
│   ├── Body
│   │   ├── Due-date input (required, defaults to today)
│   │   ├── Optional name input
│   │   ├── Task-row repeater (1..N)
│   │   │   ├── Title input (required for the row to count)
│   │   │   ├── Type <select> sourced from TASK_CATEGORIES
│   │   │   ├── Description textarea
│   │   │   └── Remove × (disabled when only one row)
│   │   ├── "+ Add another task" button
│   │   └── Inline error
│   └── Footer (Cancel | Add to-do list)

ToDoListsModal (Portal, focus-trapped sheet)
├── Backdrop
├── Sheet
│   ├── Header — title + close ×
│   ├── Body
│   │   ├── Loader / empty state
│   │   └── List rows (one per todo_lists row, newest first)
│   │       ├── Header — name | "To-do for {due_date}", status pill, expand chevron, delete ×
│   │       └── Expanded panel
│   │           └── Task rows
│   │               ├── Tick button (Pending ↔ Completed)
│   │               ├── Inline edit (title / description)
│   │               └── Delete × (single-task)
│   └── Delete-list dialog
│       ├── "Keep tasks, delete list only" (safe — sets tasks.todo_list_id = NULL, deletes list)
│       └── "Delete list and all its tasks" (destructive — deletes child tasks, then list)
```

### Props

#### `AddToDoListModal`

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope of the inserted list + tasks |
| `onClose` | `() => void` | parent | Hide without writing |
| `onSuccess` | `(newListId: string) => void?` | parent | Fired after a successful insert; parent refreshes its task list |
| `onViewLists` | `() => void?` | parent | Optional shortcut shown in the success toast — opens the Manage modal |

#### `ToDoListsModal`

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Filters the listing |
| `initialOpenListId` | `string?` | parent | If provided, auto-scrolls to + expands this list on mount |
| `onClose` | `() => void` | parent | Hide |
| `onChange` | `() => void?` | parent | Fired after a mutation succeeds; parents use it to remount the task list |

### State (local)

#### `AddToDoListModal`

| State | Purpose |
|-------|---------|
| `dueDate` | YYYY-MM-DD, defaults to today |
| `listName` | Optional; trimmed-empty becomes `null` in the insert |
| `rows[]` | `{ id, title, type, description }` — `id` is a client uuid for React keys |
| `saving` | Disables every interactive control |
| `error` | Inline error string |
| `canSave` | Derived: `dueDate && rows.some(r => r.title.trim()) && !saving` |

#### `ToDoListsModal`

| State | Purpose |
|-------|---------|
| `lists[]` | `{ id, name, due_date, tasks: TaskRow[] }`, newest-first |
| `expanded` | `Record<listId, boolean>` |
| `editing` | `Record<taskId, { title, description }>` — local-only until save |
| `deleting` | `{ kind: "task", id } \| { kind: "list", id } \| null` |
| `loading` | Initial fetch + per-mutation spinners |
| `error` | Inline error |

### Data flow — read paths

`ToDoListsModal` fetches in two queries, joined client-side:

```ts
supabase
  .from("todo_lists")
  .select("id, name, due_date, created_at")
  .eq("home_id", homeId)
  .order("created_at", { ascending: false });

supabase
  .from("tasks")
  .select("id, title, description, type, status, due_date, todo_list_id")
  .eq("home_id", homeId)
  .in("todo_list_id", listIds);
```

### Data flow — write paths

**Add (create list + N tasks):**

```ts
const { data: list } = await supabase
  .from("todo_lists")
  .insert({
    home_id: homeId,
    name: trimmedName || null,
    due_date: dueDate,
    created_by: callerUserId,
  })
  .select()
  .single();

await supabase.from("tasks").insert(
  rows.map(r => ({
    home_id: homeId,
    title: r.title.trim(),
    type: r.type,
    description: r.description.trim() || null,
    due_date: dueDate,
    status: "Pending",
    scope: "home",
    created_by: callerUserId,
    todo_list_id: list.id,
  })),
);
```

**Toggle task done:** `update tasks set status = 'Completed' | 'Pending' where id = $1`

**Edit task title/description:** `update tasks set title = $1, description = $2 where id = $3`

**Delete a task:** `delete from tasks where id = $1`

**Delete list — keep tasks** (safe default):
```sql
update tasks set todo_list_id = null where todo_list_id = $1;
delete from todo_lists where id = $1;
```

**Delete list — cascade:** `delete from tasks where todo_list_id = $1; delete from todo_lists where id = $1;`

### Edge functions invoked

None. All writes go straight through PostgREST under the existing RLS policies.

### Cron / scheduled jobs

None directly. Child task rows participate in the regular daily task cycle (overdue surfacing, notification dispatch, etc.) — see [Cron Jobs](../99-cross-cutting/11-cron-jobs.md).

### Realtime channels

None subscribed by either modal. Mutations call `onChange` so parents can refresh; the calendar parent does this by incrementing a `key` on `<TaskList />` to force a remount.

### Tier gating

None. Available on every tier.

### Beta gating

None.

### Permissions

- **`tasks.create_home`** — the entry-point buttons (List, Add To-Do List) are disabled when the caller lacks this permission. Mirrors the gating used by the Quick Add Task modal.
- All mutations inside Manage rely on the `todo_lists` and `tasks` RLS policies (membership in `home_members.home_id`) — see [RLS Patterns](../99-cross-cutting/19-rls-patterns.md).

### Error states

| State | Result |
|-------|--------|
| No row has a title | Save disabled |
| `dueDate` cleared | Save disabled |
| List insert fails | Inline error; tasks insert is skipped |
| Tasks insert fails after list inserted | Inline error; user can retry — duplicate rows are avoided because we don't reset on failure |
| Manage: any individual task mutation fails | Inline error in that row; the rest of the list keeps working |
| Manage: delete-list cascade partially fails | Inline error; user can retry the delete |

### Performance

- Both modals are lazy-loaded as part of the calendar bundle.
- Manage paginates implicitly via the newest-first query — the dominant case (≤20 lists per home) doesn't need a paginator yet.
- The `tasks_todo_list_idx` partial index keeps the child-task lookup cheap.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

You're planning a single afternoon in the garden — *Saturday morning* — and you want one quick, ordered list of jobs: prune the climbing rose, top-dress the rhubarb, sow the chard, water the runner beans, hose the new gravel. Typing five tasks one by one is fiddly. A to-do list is the answer: one date, five lines, done.

You also open the **My To-Do Lists** modal whenever you want to see your active bundles in one place, tick rows off as you complete them, fix a typo, or retire a finished list.

### Every flow on this modal

#### Adding a to-do list

1. **Pick the date.** Defaults to today; tap to change.
2. **Optional name.** Leave blank and the app calls it *"To-do for {date}"* — useful when you just want a Saturday list without naming it. Otherwise give it a meaningful name like *"Sunday seedling sow"* or *"Bed 3 turnaround"*.
3. **Add task lines.** Each row gets a title, a type (Watering / Pruning / Harvesting / Maintenance / Planting), and an optional note. Tap "+ Add another task" to keep going.
4. **Submit.** Every row becomes a normal task in your calendar — overdue if you saved a past date, due today if you saved today. The toast offers a shortcut to "Open the list" if you want to manage it immediately.

#### Managing existing to-do lists

1. **Expand a list.** Tap the chevron — you see every task on that list with its current status.
2. **Tick a row off.** The round button on the left flips a task between Pending and Completed. The list's status pill updates the moment every row is done.
3. **Edit a row.** Tap the pencil to change the title or description inline. Save with the tick, cancel with the ×.
4. **Delete a row.** The × beside the row removes that single task — the rest of the list is untouched.
5. **Delete the whole list.** The trash button on the list header opens a two-option confirmation:
   - **Keep tasks, delete list only** — the safe choice. Your tasks stay in the calendar; they just stop being grouped.
   - **Delete list and all its tasks** — clean sweep. Use this when the whole project was abandoned.

#### Opening a list from a task

Open any task on the calendar that came from a to-do list. The Task Detail modal shows a small "From: {list name}" pill above the title — tap it to jump straight to that list in the Manage modal.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Due date | The single day every task in this list shares. |
| List name | Optional label. Blank → app shows "To-do for {date}". |
| Task title | The user-visible label that appears on the calendar. |
| Task type | Drives the icon + colour everywhere the task shows up. |
| Task description | Free-text notes visible inside the task. |
| Status pill | **Pending** if any child task is Pending; **Complete** when every child task is Completed or Skipped. Derived — no manual "mark list complete" anywhere. |
| From: pill | Only visible inside the Task Detail modal when a task belongs to a list. Click to jump to the list. |

### Tier-by-tier experience

No differences. Every tier sees the same UI and the same limits.

### New user vs returning user vs power user

- **Brand new user**: the easiest way to populate a calendar — type five things on a Saturday, save once.
- **Returning user**: the weekly-prep tool. Sunday-night planning session for the week's gardening.
- **Power user**: combines lists with blueprints — the recurring schedules cover weekly watering, the list covers the *one-off* Saturday-special jobs.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Listing recurring jobs as a to-do.** If you'd type the same task again next week, use a Task Schedule (Blueprint) instead — see [Blueprint Manager](../04-schedule/01-blueprint-manager.md).
- **Saving with no row titles.** The save button stays disabled; the list won't insert with zero rows.
- **Deleting the wrong way.** "Delete list and all its tasks" is irreversible — choose "Keep tasks, delete list only" if you're at all unsure.
- **Status looks stuck on Pending.** That's because at least one row is still Pending — tick the last one and the pill flips automatically.

### Recommended workflows

- **Saturday-morning plan**: open Add To-Do List, leave the date on today, name it *"Saturday"*, type the jobs as they come to mind, save.
- **Weekly review**: open My To-Do Lists, tick off everything you finished, delete stale lists, leave the rest for next weekend.
- **Following a Sunday plan**: open the calendar on Sunday morning, open the list, tick rows as you go. The list flips to Complete when you're done — leave it in place as a record.

### What to do if something looks wrong

- **"You don't have permission to add tasks here."** The List / Add buttons are disabled — your home-member role doesn't include `tasks.create_home`. Ask the home owner.
- **Tasks I deleted are still showing.** The list view caches — close and reopen the Manage modal, or reload the calendar.
- **Status pill won't go green.** One of the rows is still Pending or Skipped didn't take — expand the list, scan for the un-ticked task, finish it.

---

## Related reference files

- [Task Detail Modal](./02-task-modal.md) — shows the **From: list** pill and the entry point to Manage
- [Localized Task Calendar](../02-dashboard/10-localized-task-calendar.md) — hosts the **List** button on `/quick/calendar`
- [Quick Add Task Modal](./35-quick-add-task-modal.md) — the sibling for single one-off tasks
- [Global Quick Add](./23-global-quick-add.md) — the top-bar menu that includes "Add To-Do List" and "My To-Do Lists"
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) — `tasks.todo_list_id` back-link
- [RLS Patterns](../99-cross-cutting/19-rls-patterns.md) — membership policies that gate `todo_lists`

## Code references for ongoing maintenance

- `src/components/todo/AddToDoListModal.tsx` — compose UI
- `src/components/todo/ToDoListsModal.tsx` — manage UI
- `src/components/TaskCalendar.tsx` — hosts both modals on the desktop agenda tab
- `src/components/quick/LocalizedTaskCalendar.tsx` — hosts `AddToDoListModal` on `/quick/calendar`
- `src/components/GlobalQuickAdd.tsx` — deep-link menu entries
- `src/components/TaskModal.tsx` — "From: list" pill
- `src/components/TaskList.tsx` — passes `onOpenToDoList` through to the Task Detail modal
- `supabase/migrations/20260630000000_todo_lists.sql` — schema, RLS, grants
- `tests/unit/components/AddToDoListModal.test.ts` — Vitest field + insert tests
