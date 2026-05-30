# Plan — Plants icon match, collapsible Seasonal Picks, Today reorder, To-Do Lists

Four changes in one wave. The first three are small touch-ups; **the to-do list feature is substantial** (new table + two modals + button wiring + management UI). I'll present design decisions inline so you can adjust before I build.

## 1. Plants icon — main nav matches the quick-link Sprout

- Current main nav uses `IconPlants` = `Shrub`; the Plants quick-link uses `Sprout`. You prefer the quick-link.
- **Change** `src/constants/icons.ts`: `export { Shrub as IconPlants }` → `export { Sprout as IconPlants }`. The main nav (`App.tsx:1050`) and the GardenHub tabs (`GardenHub.tsx:16`) instantly inherit the new icon. Quick-link is unchanged.
- One-line change; no schema, no tests touch.

## 2. Seasonal Picks card — collapsible on every variant

- The card is shown in three places (`today` / `dashboard` / `carousel`). Make it collapsible everywhere.
- Add a chevron toggle in `Header`; state persisted in `localStorage` per variant (`rhozly_seasonal_picks_collapsed:<variant>`), default **expanded**. Collapsed = show only the header bar (no tiles).
- Affects `src/components/seasonal/SeasonalPicksCard.tsx` only.

## 3. Today screen reorder — weather, tasks, then "what to grow"

- Current: PlantingCalendarCard → RainWaterAdvice → **SeasonalPicksCard** → **TaskList**.
- New: PlantingCalendarCard → RainWaterAdvice (= weather banner block) → **TaskList** → **SeasonalPicksCard**.
- Swap two sections in `src/components/quick/LocalizedTaskCalendar.tsx`. Nothing else.

## 4. To-Do Lists — group tasks under a shared date + manage them after

A "to-do list" is a **named group of `tasks` rows** sharing a `due_date`. Ticking, editing or deleting a task inside the list operates on the underlying `tasks` row, so to-do-list tasks appear in the calendar / agenda / blueprints exactly like any other task.

### Schema (one migration, RLS matches home_members)

```sql
CREATE TABLE public.todo_lists (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id     uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  name        text,             -- optional; UI auto-suggests "To-do for <date>"
  due_date    date NOT NULL,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks
  ADD COLUMN todo_list_id uuid REFERENCES public.todo_lists(id) ON DELETE SET NULL;

CREATE INDEX todo_lists_home_idx     ON public.todo_lists (home_id, created_at DESC);
CREATE INDEX tasks_todo_list_idx     ON public.tasks (todo_list_id) WHERE todo_list_id IS NOT NULL;

ALTER TABLE public.todo_lists ENABLE ROW LEVEL SECURITY;
-- standard home_members SELECT/INSERT/UPDATE/DELETE policies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.todo_lists TO authenticated;
```

`ON DELETE SET NULL` on `tasks.todo_list_id` means deleting a list doesn't cascade-delete its tasks — they survive as standalone tasks. The list-delete UI explicitly offers "delete list and its tasks" vs "keep tasks, delete list only" (see below).

### `AddToDoListModal` — create flow

- **Global due date** input (date picker; defaults to today).
- **Optional list name** input (placeholder: "To-do for {date}"). If blank, save as null and render auto-name client-side.
- Dynamic **task lines** list — each row: name (text), type (select from `TASK_CATEGORIES`: Planting / Watering / Harvesting / Maintenance / Pruning), description (multi-line, optional). A `+ Add task` button appends a fresh blank row; trash icon removes a row. At least 1 task required.
- Submit: one INSERT to `todo_lists`, then a bulk INSERT to `tasks` (all with `due_date` = global, `status` = "Pending", `todo_list_id` = new list id, `home_id`).
- Toast + close on success.

### To-do list status — derived (pending / complete)

A list's status is **computed from its tasks**, no stored column:
- `pending` — at least one task with `status = 'Pending'`.
- `complete` — every task is `Completed` (or there are no tasks left).

The fetch joins/aggregates pending + completed counts so the UI can render a badge ("3/5 done", green tick when complete) without an extra round-trip. Computed beats stored here — no trigger maintenance, no drift when a child task is ticked elsewhere on the calendar.

### Task → list pill (when opening a task from the calendar)

`TaskModal` (the per-task detail modal opened from the calendar/agenda):
- If the loaded task has a non-null `todo_list_id`, render a small pill above the fields: **"From: {list name}"**.
- Tapping the pill **closes the TaskModal and opens `ToDoListsModal` pre-expanded to that list**. Easiest wiring: lift `ToDoListsModal` open-state into the route's host (`TaskCalendar` etc.), pass `onOpenToDoList(listId)` callback down through `TaskList` → `TaskModal`.

The list-info needed for the pill (name, due date) is loaded eagerly in the task fetch via `select("..., todo_list:todo_lists(id, name, due_date)")` so there's no second fetch on modal open.

### `ToDoListsModal` — manage flow

- Lists the home's `todo_lists` (newest first; show up to 20 with "Load more"). Each card: name + date + completion counter (e.g. "3 of 5 done").
- Tap a card → expand to show its tasks:
  - **Tick** checkbox → set task `status` to "Completed" (or back to "Pending"). Optimistic.
  - **Edit** (pencil) → inline rename + description edit; saves on blur.
  - **Delete** (trash) → remove the task row.
- Per-list footer: **Delete list** with a two-option confirm — *Keep tasks, delete list only* (sets `todo_list_id = null` on each task + deletes the list) vs *Delete list and all its tasks* (deletes tasks + list).

### Button wiring

Add an **"Add to-do list"** button next to existing "Add Task" surfaces (small, secondary visual weight so the primary Add Task still leads):
- `TaskCalendar.tsx:950` — Agenda header next to the green "Add Task" pill.
- `GlobalQuickAdd.tsx` — new entry alongside "Add Task" / "Add Task Automation".

Add a **"My to-do lists"** entry in the same `GlobalQuickAdd` menu, which opens `ToDoListsModal`. Inside `AddToDoListModal` a small "View existing to-do lists" link does the same.

### Tests

- **Vitest** — `AddToDoListModal` form validation (date required, ≥1 task with name, type defaulted) + a submit-shape test (mock supabase insert calls, assert correct payloads).
- **Vitest** — `ToDoListsModal` rendering (groups + tick/edit/delete handlers fire).
- **E2E** — add 3 rows: open Add To-Do List, save with 2 tasks, see them on the calendar; tick one from ToDoListsModal; delete a list.

### Docs

- New app-reference file `08-modals-and-overlays/40-todo-lists.md` (Add + Manage modals).
- `99-cross-cutting/04-data-model-tasks.md` — add the `todo_lists` table + `todo_list_id` column.
- `e2e-test-plan.md` — TODO-001..N rows.
- `00-INDEX.md` — index the new ref file.

## Risks / call-outs

- **Migration applied locally first** (per project rules) before `supabase db push`.
- **TaskEngine impact:** the engine fetches `tasks` by `home_id` + date and won't know about the new `todo_list_id` column — fine, it surfaces them as normal tasks. To-do tasks appearing in the agenda/calendar is the desired behaviour.
- The "delete list, keep tasks" branch deliberately preserves work the user committed to; the UI defaults the destructive option to the **safer** "Keep tasks" choice.
- `name` is optional to keep the flow ultra-fast; the client renders a sensible default label when blank.

## Process

1. **Wave A (small):** plants icon + Seasonal Picks collapsible + Today reorder. Commit + deploy `--bump 1`.
2. **Wave B (To-Do Lists):** migration → modals → wiring → tests → docs. Commit + deploy `--bump 1`. Push to main.

Splitting into two deploys keeps Wave A live within minutes and gives the bigger feature room to be reviewed properly. **Say the word if you'd rather one combined deploy.**

## Open questions before I build

- **Per-task date override** inside the to-do list — leave out (global only), or allow per-row override?
- **List name** — keep optional with auto-suggest, or require it?
- **Surfacing in the calendar:** when you tap a task on the calendar that belongs to a to-do list, show a "From: <list name>" pill? (Nice-to-have, not v1.)

My defaults: global-date only, optional name, no calendar pill in v1. Override these if you'd like.
