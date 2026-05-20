# Quick Add Task Modal

> Slim "Add a task" sheet for the mobile [Localized Task Calendar](../02-dashboard/10-localized-task-calendar.md). Four fields only — title, type, description, due date (pre-filled to today) — and a one-tap Save. Inserts a single one-off `tasks` row with `home_id` set and everything else null/default. Use the full [Add Task / Edit Schedule Modal](./01-add-task-modal.md) when you need area / plant / plan binding or a recurring schedule.

**Trigger:** the **+ Add** affordance in the Today's tasks card header on `/quick/calendar`.
**Source file:** `src/components/quick/QuickAddTaskModal.tsx` (~250 lines)

---

## Quick Summary

A purpose-built minimal modal for the in-the-garden moment. Speed-first: name the task, optionally tweak type/date/notes, hit Save. Area, plants, plans, recurring schedule, and personal-scope toggle all stay deferred — fill those in later from the desktop Task Detail modal.

---

## Role 1 — Technical Reference

### Component graph

```
QuickAddTaskModal (Portal, full-screen overlay)
├── Backdrop (click-to-close, suppressed while saving)
├── Sheet
│   ├── Header (title + subtitle + close ×)
│   ├── Body
│   │   ├── Title input (required)
│   │   ├── Type picker — 5 buttons (Watering / Pruning / Harvesting / Maintenance / Planting)
│   │   ├── Description textarea (optional)
│   │   ├── Due date input — native <input type="date">
│   │   └── Inline error (when insert fails)
│   └── Footer (Cancel | Save task)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope of the inserted row |
| `defaultDate` | `Date?` | parent (optional) | Override the pre-filled date; defaults to `new Date()` |
| `onClose` | `() => void` | parent | Hide without writing |
| `onSuccess` | `() => void` | parent | Fired after a successful insert; parent should refresh its task list |

### State (local)

| State | Purpose |
|-------|---------|
| `title` | Required, trimmed before insert |
| `type` | One of the five `TASK_CATEGORIES`; defaults to `Maintenance` |
| `description` | Optional; trimmed-empty becomes `null` in the insert |
| `dueDate` | ISO `YYYY-MM-DD` in user's local TZ |
| `saving` | Disables every interactive control |
| `error` | Inline error message on insert failure |
| `canSave` | Derived: `title.trim().length > 0 && !!dueDate && !saving` |

### Data flow — read paths

- `supabase.auth.getUser()` once on Save to populate `created_by`.

### Data flow — write paths

Single insert, mirroring the same shape `AddTaskModal` uses for one-off tasks:

```ts
supabase.from("tasks").insert({
  home_id: homeId,
  title: title.trim(),
  type,                                    // TaskCategory enum value
  description: description.trim() || null,
  due_date: dueDate,                       // YYYY-MM-DD
  status: "Pending",
  scope: "home",                           // Quick Add is home-scoped only
  created_by: callerUserId,
});
```

No FKs to `task_blueprints`, `location_id`, `area_id`, `plan_id`, or `inventory_item_ids` — those stay NULL by default.

### Edge functions invoked

None.

### Cron / scheduled jobs

None directly. The inserted row participates in the existing daily `tasks` cycle.

### Realtime channels

None subscribed by this modal. The parent (`LocalizedTaskCalendar`) forces a `<TaskList />` remount via a `key` prop counter on `onSuccess`.

### Tier gating

None.

### Beta gating

None.

### Permissions

- **`tasks.create_home`** — same key the full `AddTaskModal` requires for home-scoped one-off tasks. The parent disables the Add affordance when the caller doesn't have this permission and shows an explanatory tooltip.

### Error states

| State | Result |
|-------|--------|
| Empty title | Save button stays disabled |
| Empty due date (cleared) | Save button stays disabled |
| Insert fails (RLS, network) | Inline error string; modal stays open; user can adjust + retry |
| Auth `getUser()` returns no user | `created_by` set to `null` — non-fatal; insert proceeds |

### Performance

- Lazy-loaded as part of `LocalizedTaskCalendar` (which itself is lazy-loaded from `App.tsx`).
- Portal-mounted; doesn't affect the parent's render tree until opened.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this modal

You're standing in the garden. You see something that needs doing in 3 days — pinch the basil tips, stake the tomatoes, top-dress the rhubarb. You don't want to navigate to Blueprint Manager, pick a location, pick an area, attach the right plant, decide if it's recurring, set a frequency — you just want to type the thing and walk on. Quick Add does that.

For tasks that *do* need the full configuration (e.g. a watering blueprint that should fire every 3 days against a specific plant), use the full Add Task / Edit Schedule modal instead — typically from Blueprint Manager or the Dashboard's quick-add menu.

### Every flow on this modal

#### 1. Type a title

- **What you see**: "What needs doing?" with a focused text input.
- **What you do**: type a short label. Save enables.

#### 2. Pick a type (optional — defaults to Maintenance)

- **What you see**: a row of five buttons with icons (Watering, Pruning, Harvesting, Maintenance, Planting).
- **What you do**: tap the one that matches. The active button highlights in primary green.
- **Why a gardener cares**: type drives icons + filters across the rest of the app (calendar, schedule manager, dashboards). Right tag = easier to find later.

#### 3. Add notes (optional)

- **What you see**: a small textarea labelled "Notes (optional)".
- **What you do**: jot anything specific — *"south-facing leaves are crispy"*, *"use the new shears"*.

#### 4. Pick a date (pre-filled to today)

- **What you see**: a native date input pre-populated to today.
- **What you do**: leave it, or tap to use the phone's date picker for any future date.

#### 5. Save

- **What you see**: a green Save task button at the bottom right.
- **What you do**: tap.
- **What happens next**: row inserted, toast "Task added", modal closes, and the new task appears in Today's tasks if the date you picked was today.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Title | The user-visible label of the task. Truncates in lists if long. |
| Type | One of the five categories. Drives icon + colour in the rest of the app. |
| Notes | Free-text; visible in the Task Detail modal once opened. |
| Date | When the task is due. Past dates are valid — they'll show as overdue. |

### Tier-by-tier experience

No differences. Available on every tier.

### New user vs returning user vs power user

- **Brand new user**: simplest possible "add a task" UX in the app; almost zero learning curve.
- **Returning user**: the rapid path. Most ad-hoc tasks pass through here.
- **Power user**: still uses Quick Add for one-offs; jumps to the full modal for recurring blueprints or anything that needs precise plant/area binding.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Saving with the date in the past** — the row inserts fine and shows as overdue. If you didn't mean for that, tap the task in Today's tasks to edit the date.
- **Forgetting which plant the task was for** — by design. The note field is your hint to your future self.
- **Trying to set a recurring schedule** — Quick Add doesn't do that. Open the full Add Task modal from Schedule for recurring.
- **Wrong type picked** — change it later by tapping the task in Today's tasks → Task Detail modal.

### Recommended workflows

- **Walking the beds**: see something → Add → type 3-5 words → Save → keep walking. Repeat.
- **Friday review**: open `/dashboard?view=calendar` on desktop, open each Quick-Added task, fill in area + plant + linked plan as needed.
- **One-off vs recurring decision**: if you'd type the same task next week too, it should be a blueprint instead — open the full modal from Schedule.

### What to do if something looks wrong

- **"You don't have permission to add tasks here"**: the Add button is disabled. Your home-member role doesn't include `tasks.create_home`. Ask the home owner to enable the permission.
- **Save toast shown but task missing from Today's tasks**: check the date you picked — if it wasn't today, the task is on the date you chose (open the full Calendar tab).
- **Inline error after Save**: read the message. If it mentions RLS, the home_id is mismatched — check you're in the right active home.

---

## Related reference files

- [Localized Task Calendar](../02-dashboard/10-localized-task-calendar.md) — the parent screen
- [Add Task / Edit Schedule Modal](./01-add-task-modal.md) — the full sibling for recurring schedules + area/plant binding
- [Task Detail Modal](./02-task-modal.md) — where you assign area / plants / link to a plan after Quick Add
- [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md) — `tasks` row shape

## Code references for ongoing maintenance

- `src/components/quick/QuickAddTaskModal.tsx` — modal component
- `src/components/quick/LocalizedTaskCalendar.tsx` — mount site + refresh-key plumbing
- `src/constants/taskCategories.ts` — `TASK_CATEGORIES` array (the five enum values)
- `tests/unit/components/QuickAddTaskModal.test.ts` — Vitest field + insert tests
- `tests/e2e/specs/quick-calendar.spec.ts` — Playwright case `QUICK-CAL-006`
