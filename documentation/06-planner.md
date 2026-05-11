# Garden Planner

The **Planner** lives under the **Plan** tab in the sidebar. It has two sub-sections:

| Tab | What's here |
|-----|-------------|
| **Plans** | AI-generated garden plans with task staging |
| **Shopping** | Shopping lists for garden supplies |

This guide covers **Plans**. For Shopping Lists see [Shopping Lists](./07-shopping-lists.md).

> 📸 Screenshot: The Planner hub showing the Plans tab active, with three plan cards in the grid (In Progress, Completed, Archived)

---

## What is a Garden Plan?

A garden plan is an AI-generated blueprint for a planting project — for example, "Set up my raised vegetable bed for summer" or "Create a low-water herb garden in the south corner."

You describe your goals, and Rhozly's AI produces a structured plan with plant suggestions, spacing, timing, and care tasks. You can then **stage** those tasks directly into your schedule.

---

## Plan Status Lifecycle

```
Draft → In Progress → Completed → Archived
                              ↑
                           (can restore from archived)
```

| Status | Meaning |
|--------|---------|
| **Draft** | Newly created; the AI plan is still being generated or reviewed |
| **In Progress** | Tasks have been staged; active work underway |
| **Completed** | You've marked this plan as done |
| **Archived** | Soft-deleted; hidden from main view but can be restored |

---

## Viewing Plans

The Plans tab shows cards grouped by status:

> 📸 Screenshot: Plan cards in the "Pending" section showing titles, subtitles, plant counts, and an options menu button

**Pending** section includes both Draft and In Progress plans.

Each card shows:
- **Plan title** and AI-generated subtitle
- **Created date**
- **Plant count** (how many species are included)
- **Options menu** (three dots) — Edit, Duplicate, Archive/Restore, Delete

---

## Creating a Garden Plan

Tap **+ New Plan** (or use [Global Quick Add](./15-navigation-quick-add.md#global-quick-add) → **Create Plan**).

> 📸 Screenshot: The New Plan form with fields for garden size, climate, skill level, and goal checkboxes

### New Plan Form

Fill in the details about your garden project:

| Field | Description |
|-------|-------------|
| **Project name** | What you want to call this plan |
| **Location** | Which of your garden locations this plan is for |
| **Garden size** | Approximate area (small / medium / large / custom m²) |
| **Climate** | Your climate type (temperate, Mediterranean, tropical, arid, etc.) |
| **Skill level** | Beginner / Intermediate / Advanced |
| **Goals** | Multi-select: pest-free, edible harvest, ornamental, low-water, organic, wildlife-friendly, etc. |
| **Plants to include** | Specific plants you definitely want in the plan |
| **Plants to exclude** | Plants you don't want suggested |

Tap **Generate Plan** — Rhozly sends your inputs to the AI, which produces a detailed plan. This typically takes 10–30 seconds.

> 📸 Screenshot: The loading screen while the AI generates the plan, with an animated sparkle icon

---

## Reviewing and Staging a Plan

Once generated, the plan opens in the **Plan Staging** view.

> 📸 Screenshot: The Plan Staging view — AI blueprint on the left (markdown text), staged task list on the right

### Left Side: AI Blueprint

The AI blueprint is displayed as formatted text including:
- **Overview** — a summary of the plan's goals and approach
- **Plant list** — suggested species with brief notes on each
- **Planting layout** — spacing recommendations
- **Timeline** — when to plant, when to expect harvest
- **Seasonal tips** — conditions to watch for

### Right Side: Staged Tasks

The AI also produces a list of specific tasks (e.g. "Prepare soil", "Plant tomato seedlings", "Install support cages"). These appear on the right as **staged tasks**.

Each staged task shows:
- Task type badge
- Task title
- Suggested date and frequency
- Location and area assignment

### Staging Tasks

When you're happy with the staged tasks:

1. Tap **Stage All Tasks** (or select individual tasks to stage).
2. A confirmation dialog shows the tasks to be created and which location/area they'll be assigned to.
3. Tap **Confirm** — Rhozly creates task blueprints for every staged task.
4. The plan status changes to **In Progress**.
5. The tasks immediately appear in your Calendar and Schedule.

> 📸 Screenshot: The staging confirmation dialog listing tasks with location/area assignments

---

## Editing a Plan

From the plan card options menu → **Edit**. This opens the same form used to create the plan. You can adjust the goals, climate, and plant lists, then regenerate the AI blueprint.

> Note: Editing and regenerating does **not** delete tasks you have already staged. Those remain in your Schedule.

---

## Duplicating a Plan

Options menu → **Duplicate**. Creates an identical copy of the plan in Draft status. Useful if you want to reuse a plan layout for a different location.

---

## Completing a Plan

Options menu → **Mark as Completed**. The plan moves to the **Completed** section. This is purely a status marker — all tasks remain active.

---

## Archiving a Plan

Options menu → **Archive**. The plan moves to the **Archived** section and is hidden from the main view.

From the Archived section, tap **Restore** on any plan to bring it back.

---

## Deleting a Plan

Options menu → **Delete**. A confirmation modal appears:

- **Delete plan only** — removes the plan record; staged tasks remain.
- **Delete plan and all associated tasks** — removes the plan AND deletes all blueprints and tasks that were created from it.

---

## Plan + Shopping Lists Integration

When a plan is staged, Rhozly can suggest items for your Shopping List — seeds, soil, tools, or products needed for the plan's tasks. See [Shopping Lists](./07-shopping-lists.md).
