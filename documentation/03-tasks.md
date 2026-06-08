# Tasks

Tasks are the core of Rhozly's day-to-day workflow. They represent specific actions to take in your garden — watering, pruning, harvesting, maintenance, and planting.

Tasks appear in three places:
- **Dashboard** — the right-side task panel (desktop) or the main content area (mobile)
- **Calendar** — the agenda panel for any selected date
- **Location Detail** — tasks filtered to a specific location

---

## Task Cards

Every task is displayed as a card.

> 📸 Screenshot: Two task cards — one pending (white) and one completed (greyed out with strikethrough title)

### Card Elements

| Element | Description |
|---------|-------------|
| **Completion checkbox** | Rounded square on the left — tap to mark done |
| **Type badge** | Small label showing the task type (Watering, Planting, etc.) with a colour-coded icon |
| **Title** | The task name — wraps to two lines so nothing is cut off |
| **Plant chip** | Green badge showing which plant(s) this task is for (e.g. "Tomato (x3)") |
| **Area chip** | Teal badge showing which garden area |
| **Plan chip** | Purple badge if this task belongs to a garden plan |
| **Auto-watered chip** | Blue badge if Rhozly auto-completed this task based on rain data |
| **Plant thumbnail** | Small plant image — shown inline on mobile, larger on desktop |
| **Action buttons** | Remove and Postpone — shown below the chips on mobile, as icons on desktop |

### Card Colours

| Colour | Meaning |
|--------|---------|
| White | Normal pending task |
| Red background | **Overdue** — due date has passed |
| Grey / transparent | **Completed** task |
| Faded grey border | **Blocked** — another task must be completed first |

---

## Completing a Task

Tap the **checkbox** (rounded square) on the left of any task card to toggle its completion status.

> 📸 Screenshot: A task being completed — checkbox filled green, title with strikethrough

**What happens when you complete a task:**

- The task moves to the **Completed** tab
- A green checkmark replaces the checkbox icon
- The task title gets a strikethrough

**Special behaviour for Planting tasks:**
When you complete a Planting task, Rhozly automatically:
1. Updates the linked plant's status to **Planted**
2. Sets the plant's growth state to **Vegetative**
3. Generates new recurring care schedules (watering, pruning, harvesting) based on the plant's profile

**Special behaviour for Harvesting tasks:**
When you complete a Harvesting task, Rhozly shows an **Archive Prompt**:

> 📸 Screenshot: The archive prompt modal listing harvested plants with a wheat icon, with "Archive All" and "Keep in Shed" buttons

- Lists the plants included in the harvest
- **Archive All** — marks those plants as Archived and removes them from active schedules
- **Keep in Shed** — marks the task complete but keeps the plants active

---

## Harvest Windows (Wave 20)

Harvest tasks no longer fire daily through the whole harvest season. Instead, Rhozly creates **one task per harvest window** — a single card that stays open from the start of the window to the end.

> 📸 Screenshot: A harvest task card showing "Harvest window: 14 Aug → 30 Sep" with days-remaining text

What this changes for you:

- **No overdue spam.** A 90-day tomato window used to mean 90 overdue tasks if you couldn't pick on day one. Now it's a single task that shows "Window open for N more days" until you complete it.
- **"Not yet" snooze.** Tap **Not yet** on a harvest task and pick a 3 / 5 / 7-day reminder. The task disappears from Today until then, capped at the window's end.
- **AI ripeness check.** On Sage+ tiers, tap **Check ripeness** to take a photo — Rhozly runs it through the AI and either marks the task complete (it's ready) or sets the snooze automatically (not quite yet).
- **End-of-window behaviour.** If the window closes before you act, the task switches to **"Log yield anyway / Mark missed"**. Marking missed records the outcome without affecting next year's schedule.

---

## Tombstones — what happens when you delete a single recurring task

Recurring tasks come from a blueprint (see [Schedule](./04-schedule.md)). If you **delete a single date's task** without ticking *"Also delete the recurring schedule"*, Rhozly creates a small **tombstone** marker for that one date.

This stops the same ghost task from re-appearing tomorrow. The blueprint stays alive and the next future occurrence still fires on schedule.

If you change your mind, you can recreate the task manually from Quick Add, or delete the tombstone via the Schedule page.

---

## Pending and Completed Tabs

The task list has two tabs:

- **Pending** — shows all incomplete tasks for the date/context
- **Completed** — shows tasks already marked done

The count next to each tab label updates in real time.

---

## Scope Filters

Below the tabs are **scope filter** buttons that let you control whose tasks you see:

| Filter | Shows |
|--------|-------|
| **All** | Every task for the home |
| **Home** | Tasks assigned to the whole home (not personal) |
| **Mine** | Tasks you personally created |
| **Assigned to me** | Tasks another member has assigned specifically to you |

---

## Opening the Task Detail Modal

Tap anywhere on a task card (other than the action buttons) to open the full **Task Detail Modal**.

> 📸 Screenshot: The Task Detail Modal showing all task details, linked plants, and dependency section

### What You Can Do in the Modal

**View & Edit Details:**
- Task title and description
- Task type
- Assigned location, area, and garden plan
- Scope (home-wide or personal) and which home member it's assigned to

**Manage Linked Plants:**
- See which inventory items (plant instances) this task applies to
- Tap **Edit Instances** to open an area-picker and change which plants are linked
  - Browse by area → select plant species → tick individual instances
  - Save to update the task

**Dependencies:**
Tasks can be linked so one must be completed before another can start.

> 📸 Screenshot: The dependencies section of the Task Modal showing one blocking task and one blocked task

- **Blocked by** — tasks that must be finished before this one unlocks
- **Blocking** — tasks that are waiting for this task to complete
- Use the **search box** to find and link another task as a dependency
- Choose the relationship type: **waiting on** or **blocking**
- Tap the **× remove** button next to any dependency to unlink it
- A blocked task shows a 🔒 lock icon on its checkbox — you cannot complete it until its blockers are done

**Task Actions from the Modal:**
- **Toggle complete** — same as tapping the card checkbox
- **Postpone** — opens the postpone flow
- **Delete** — opens the delete confirmation

---

## Creating a Task

There are three ways to create a task:

1. **Global Quick Add** → tap the **+** in the header → **Create Task**
2. **Calendar** → select a date → tap **Add Task** in the agenda
3. **Blueprint Manager** → creates a recurring task (see [Schedule](./04-schedule.md))

> 📸 Screenshot: The Add Task modal open with fields for title, type, location, plant assignment, and recurrence

### Add Task Form

**Step 1 — Plant Assignment (optional):**
- Select **Location** → **Area** → **Plant Species**
- Tick which instances of that species this task applies to
- You can leave this blank if the task is not plant-specific

**Step 2 — Task Details:**

| Field | Description |
|-------|-------------|
| **Title** | Short name for the task (required) |
| **Description** | Optional notes or instructions |
| **Task type** | Watering, Maintenance, Pruning, Harvesting, or Planting |
| **Due date** | The date this task should appear |
| **Scope** | Home (visible to all members) or Personal (only you) |
| **Assign to** | Optionally assign to a specific home member |

**Step 3 — Recurring (optional):**
- Toggle **Make this recurring** to create a blueprint instead of a one-off task
- Set a **start date**, **repeat interval** (every N days), and optional **end date**
- This creates a task blueprint — see [Schedule](./04-schedule.md) for how blueprints work

**Step 4 — Dependencies (optional):**
- Link this task as "waiting on" or "blocking" another task
- Search by task title to find the task to link

Tap **Save Task** when done.

---

## Postponing a Task

Tap the **Postpone** button (calendar icon on desktop, "Postpone" text button on mobile) on any pending task.

> 📸 Screenshot: The Postpone modal with a date picker and the "Also shift blueprint" checkbox

1. Pick a new due date using the date picker.
2. If the task is part of a recurring blueprint, you will see a checkbox: **Also shift all future occurrences** — tick this to move every future repeat of this task by the same number of days.
3. Tap **Confirm Postpone**.

---

## Deleting a Task

Tap the **Remove** button (bin icon on desktop, "Remove" text button on mobile).

> 📸 Screenshot: The delete confirmation modal with the "Also delete recurring schedule?" checkbox

A confirmation modal appears:
- If the task has a recurring blueprint: an optional checkbox **Also delete the recurring schedule** is shown — tick this to stop the task from ever recurring again.
- Tap **Confirm Delete** to proceed or **Cancel** to go back.

---

## Bulk Editing

When you have many tasks to manage at once, use **Bulk Edit** mode.

> 📸 Screenshot: Bulk Edit mode active — tasks showing selection checkboxes, with the bulk action toolbar at the bottom

Tap the **Bulk Edit** button (top right of the Pending tab, only shown when there are pending tasks).

### Selecting Tasks

- Tap the checkbox on any task card to select/deselect it
- Tap **Select All** to select every visible pending task

### Bulk Actions

| Action | What it does |
|--------|-------------|
| **Complete all selected** | Marks all selected tasks as done (creating ghost records for recurring tasks) |
| **Postpone all selected** | Opens a date picker; optionally shift each task's blueprint |
| **Delete all selected** | Confirmation modal with option to delete associated recurring schedules |

Tap **Cancel** or tap the **Bulk Edit** button again to exit bulk mode.

---

## Ghost Tasks

Rhozly uses a "ghost task" system for recurring blueprints. Ghost tasks are **generated automatically** from blueprints — they appear in your task list without being stored in the database until you interact with them (complete, postpone, or delete).

Ghost task IDs follow the format `ghost-{blueprint_id}-{YYYY-MM-DD}`.

When you act on a ghost task (e.g. mark it complete), it becomes a permanent record at that point. This keeps the database clean while ensuring you always see the right tasks for every date.

> 📸 Screenshot: A ghost task card with a subtle dashed border or ghost indicator
