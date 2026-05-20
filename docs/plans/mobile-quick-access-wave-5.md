# Wave 5 — Quick Add Task on `/quick/calendar`

Parent plan: [mobile-quick-access-screen.md](./mobile-quick-access-screen.md) · prev: [Wave 4](./mobile-quick-access-wave-4.md) (shipped)

## Goal

Let users add tasks on the fly from `/quick/calendar` without having to go through the full Add Task / Edit Schedule modal. Speed-first: four fields (title, type, description, date pre-filled to today), one Save tap. Area, plant, plan, recurring schedule — none of that — those get filled in later from desktop. Mirrors the Quick Capture journal philosophy ("capture-first, file later") for tasks.

```
┌──────────────────────────────────────┐
│  📋 Today's tasks (4)        [+ Add] │ ← new affordance
│  ┌──────────────────────────────┐   │
│  │ • Water tomatoes              │   │
│  │ • Prune basil                 │   │
│  │ • Harvest courgette           │   │
│  │ • Check seedlings             │   │
│  │ [View calendar →]             │   │
│  └──────────────────────────────┘   │
└──────────────────────────────────────┘

  Tap [+ Add] →

┌──────────────────────────────────────┐
│   Add a task                    [×]   │
│                                       │
│   What needs doing?                   │
│   [Water the new herbs____________]   │
│                                       │
│   Type                                │
│   [💧 Watering | ✂️ Pruning | …    ]  │
│                                       │
│   Notes (optional)                    │
│   [______________________________]   │
│                                       │
│   When                                │
│   [📅 Today (20 May) ▾]               │
│                                       │
│   [Cancel]              [Save task]   │
└──────────────────────────────────────┘
```

The task lands in `tasks` as a standalone Pending row with `home_id` set and everything else null. Users assign area / plants / link to a plan from the existing Task Detail modal on desktop.

## App-reference files consulted

- [08-modals-and-overlays/01-add-task-modal.md](../app-reference/08-modals-and-overlays/01-add-task-modal.md) — the existing heavy modal. Wave 5 deliberately does NOT reuse it; it's 1,434 lines with mode switching, photo-to-task, plan/area/plant pickers, recurring blueprints. The Quick variant is a slim sibling, not a fork.
- [02-dashboard/10-localized-task-calendar.md](../app-reference/02-dashboard/10-localized-task-calendar.md) — parent screen.
- [99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — `tasks` row shape.
- [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — the existing `tasks` policy already permits home-member insert with no FK requirements.

Source files studied:
- [src/components/AddTaskModal.tsx](../../src/components/AddTaskModal.tsx) — 1,434 lines. Read to confirm the `tasks` insert shape and the default frequency-by-type map; not reused.
- [src/components/quick/LocalizedTaskCalendar.tsx](../../src/components/quick/LocalizedTaskCalendar.tsx) — parent screen; gets the Add button + modal mount + refresh trigger.
- [src/components/TaskList.tsx](../../src/components/TaskList.tsx) — already refreshes via realtime + initial mount; we force a remount via `key` prop after save to be safe.

## Decisions

### Decision 1 — Build a new slim `QuickAddTaskModal`, don't fork or compact-prop AddTaskModal

`AddTaskModal` is 1,434 lines covering both one-off tasks AND recurring blueprints, with location/area/plant pickers, plan linking, scope toggle, AI photo-to-task, and dozens of edge cases. Adding a `compact` prop that hides 80% of the UI would either:
1. Leave the heavy state machinery loaded for a slim use case (cost without benefit), or
2. Refactor the modal aggressively (high risk, big diff).

A new ~250-line `QuickAddTaskModal` is the cleaner move. Same task-insert pattern; no shared state; no risk to the existing modal's many call sites (Blueprint Manager, Dashboard quick-add, Calendar tab, AI suggestions, etc).

### Decision 2 — Four fields, no more

| Field | Default | Required | Notes |
|---|---|---|---|
| Title | "" | yes | The "name" the user typed |
| Type | `Maintenance` | yes (always set) | Four-button picker: Watering / Pruning / Harvesting / Maintenance / Planting |
| Description | "" | no | Single-line optional |
| Due date | Today (in user's tz) | yes | Native `<input type="date">` — phone OS picker by default |

Save is enabled when title is non-empty (the only truly required user input — type defaults, date defaults, description optional).

Everything else — `location_id`, `area_id`, `inventory_item_ids`, `plan_id`, `blueprint_id`, `user_id` for personal-scope — stays NULL. The row writes with `scope = "home"` implicitly (no `user_id` set).

### Decision 3 — One-off tasks only — no recurring from this surface

Quick Add never produces a `task_blueprints` row. It's strictly for the "I just thought of this, log it, configure later" flow. Recurring schedules stay where they are today — in the full `AddTaskModal` and `BlueprintManager`.

### Decision 4 — `Maintenance` is the default type

User-locked decision shape: speed-first. Maintenance is the catch-all that matches "anything you couldn't have a more specific type for". The four-button picker on the modal lets the user change it in one tap if needed.

### Decision 5 — Date picker uses the native input

`<input type="date" value={isoDate}>` — phone OSes render a native date picker that's accessible, localised, and zero JS dependency. Pre-filled to today (the user's locale-aware "today", derived from `new Date()` then formatted as YYYY-MM-DD).

### Decision 6 — Close on Save, no "Add another"

User wanted speed. Tap Add → modal opens → fill 1-3 fields → Save → modal closes → toast "Task added" → user is back on the calendar screen with the new task visible in Today's tasks. To add a second task, tap Add again. Different from Quick Capture journal (which stays open + clears for rapid-fire photo sessions) because tasks are typed-input — there's no "snap-snap-snap" pace to optimise for.

### Decision 7 — Refresh the TaskList after save via `key` remount

Cleanest plumbing: `LocalizedTaskCalendar` keeps a `tasksRefreshKey` counter, increments it on save, and passes it as `key={tasksRefreshKey}` to `<TaskList />`. React unmounts + remounts → fetches fresh. Also re-runs the screen's own initial load (rain advice depends on open-watering-count, which can change).

### Decision 8 — Permission gate stays consistent

The existing `AddTaskModal` writes to `tasks` requiring `tasks.create_home` (or `tasks.create_personal` for personal scope). Quick Add inserts at home scope only, so it gates on `tasks.create_home`. If the user doesn't have permission (rare — viewers might not), the Add button shows as disabled with a tooltip; tapping it shows a toast. Re-uses existing `usePermissions().can("tasks.create_home")` check.

## File touch list

| File | Status | Change |
|---|---|---|
| `src/components/quick/QuickAddTaskModal.tsx` | **NEW** | The slim modal — 4 fields, one Save handler. |
| `src/components/quick/LocalizedTaskCalendar.tsx` | edit | Add button in the Today's tasks card header; modal mount; `tasksRefreshKey` increment on save. |
| `tests/unit/components/QuickAddTaskModal.test.ts` | **NEW** | Field validation, type picker, save inserts the right shape, save fires onSuccess. |
| `tests/unit/components/LocalizedTaskCalendar.test.ts` | edit | New assertion: Add button is present, clicking opens the modal stub, mock onSuccess triggers a remount. |
| `tests/e2e/specs/quick-calendar.spec.ts` | edit | New case: Add task → fill title → save → see the title in the Today's tasks list. |

No edge function changes. No migrations. No new buckets.

## App-reference work

| File | Action |
|---|---|
| `docs/app-reference/08-modals-and-overlays/35-quick-add-task-modal.md` | **CREATE** using `_template.md`. New surface. (Next available number in the 08 folder — confirm during implementation.) |
| `docs/app-reference/02-dashboard/10-localized-task-calendar.md` | UPDATE — document the new Add affordance + modal mount. |
| `docs/app-reference/08-modals-and-overlays/01-add-task-modal.md` | UPDATE — add a "Related: Quick Add Task Modal" cross-link so future readers know the slim sibling exists and when to use which. |
| `docs/app-reference/00-INDEX.md` | UPDATE — add the new modal reference. |

## Tests

| Tier | What |
|---|---|
| Vitest | `QuickAddTaskModal` — Save disabled when title empty; type picker switches; date defaults to today; save inserts the right `tasks` row shape (home_id, title, type, description-or-null, due_date, status=Pending, blueprint_id=null); error toast on insert failure; cancel closes without writing |
| Vitest | `LocalizedTaskCalendar` — Add button renders inside the Today's tasks card; clicking the (stubbed) modal's onSuccess increments the refresh key |
| Playwright | `quick-calendar.spec.ts` adds: open `/quick/calendar` → tap "+ Add" → fill title "Test capture task" → Save → toast appears → task title visible in Today's tasks list (or in the empty-state replacement if the seed data left today's list empty). |

## Data-safety audit

| Change | Risk |
|---|---|
| New `tasks` rows with NULL location/area/plant | Zero risk — these columns are already nullable; the table accepts standalone tasks today (existing seeds + Dashboard quick-add insert this exact shape) |
| New modal component | Pure UI; portal-mounted; doesn't touch any existing state |
| `key`-remount on TaskList after save | Cheap unmount + remount; doesn't lose user state because TaskList itself is stateless across remounts (no in-progress edits on the compact variant) |
| Permission check | Reuses existing `usePermissions().can("tasks.create_home")` — same as the full modal |
| No migrations, no edge fns | — |

## Implementation order

1. **`QuickAddTaskModal.tsx`** — build the slim modal in isolation with mock onSuccess. Validate insert shape against the existing `AddTaskModal`'s `tasks` insert + the data model doc.
2. **Vitest for the modal** — pure render + form + insert assertion using a Supabase mock.
3. **`LocalizedTaskCalendar.tsx`** — add the button + modal mount + `tasksRefreshKey` state. Pass `key={tasksRefreshKey}` to `<TaskList />`.
4. **Update `LocalizedTaskCalendar.test.ts`** — stub the new modal so we can assert the Add button + the refresh-on-success behaviour.
5. **Playwright** — add the case to `quick-calendar.spec.ts`.
6. **App-reference docs** — new modal file + the three existing-doc updates.
7. **Manual test** on `/quick/calendar`:
   - Tap "+ Add" → modal opens
   - Title required: Save disabled until typed
   - Type defaults to Maintenance; switch to Watering
   - Date defaults to today; switch to tomorrow
   - Description left blank → Save → toast "Task added" → modal closes → task appears in Today's tasks (or doesn't if you set tomorrow as the date — that's correct behaviour)
   - Try with a permission-locked test user → Add button is disabled
8. **Commit with `[skip ci]`** and `npm run deploy`.

## What this wave doesn't do

- **No recurring blueprints from this surface.** Full `AddTaskModal` handles recurring.
- **No area / plant / plan picker.** Those are intentional friction the user wants stripped for the in-the-garden moment. Task Detail modal handles them later.
- **No photo-to-task AI**. That's the existing modal's premium feature; not in scope here.
- **No scope toggle.** Quick Add is home-scoped only (the common case). Personal tasks need the full modal.

## Locked decisions

| Question | Decision |
|---|---|
| Reuse `AddTaskModal` or new slim modal? | **New slim modal** — ~250 lines, no state-machinery coupling |
| Required fields | **Title only** — type defaults to Maintenance, date defaults to today, description optional |
| Recurring schedules from Quick Add? | **No** — one-off tasks only |
| Default type | **Maintenance** |
| Date picker | **Native `<input type="date">`** |
| Save behaviour | **Close + toast** (not stay-and-clear like Quick Capture) |
| Refresh mechanism | **`key`-prop remount** on TaskList |
| Permission gate | **`tasks.create_home`** — same as the full modal |

## Locked answers

| Question | Decision |
|---|---|
| Tag Quick Add rows in the DB? | **No tag.** Quick Add tasks are indistinguishable from other standalone tasks. |
| Add the `+ Add` affordance to the full Dashboard? | **No — mobile only for Wave 5.** Dashboard already has its own quick-add path. |
