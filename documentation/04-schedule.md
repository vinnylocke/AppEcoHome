# Schedule — Recurring Task Blueprints

The **Schedule** section (accessed via the sidebar under Plan, or directly at `/schedule`) is where you manage your recurring task automation rules — called **blueprints**.

A blueprint is a template that automatically generates tasks on a repeating schedule. For example, a "Water tomatoes" blueprint set to every 3 days will create a watering task every 3 days without you having to do anything.

> 📸 Screenshot: The Schedule page showing a list of blueprint cards with task type badges, frequency pills, and edit/delete buttons

---

## What is a Blueprint?

| Concept | Description |
|---------|-------------|
| **Blueprint** | The recurring rule (stored once) |
| **Ghost task** | A task auto-generated from the blueprint for a specific date — not saved until you act on it |
| **Physical task** | A ghost task that has been materialised by user action (completed, postponed, deleted) |

Blueprints keep your schedule clean — rather than creating 52 "water my basil" tasks for the whole year, one blueprint generates them on demand, only saving to the database when needed.

---

## Viewing Your Blueprints

The Schedule page shows all active blueprints for your home.

> 📸 Screenshot: Blueprint cards showing type badge, plant name, frequency, location, and area chips

Each blueprint card shows:
- **Task type badge** (Watering, Maintenance, Pruning, Harvesting, Planting)
- **Title** and description
- **Plant context** — which plant species and how many instances
- **Frequency pill** — e.g. "Every 7 days"
- **Location, Area, Plan chips** if assigned
- **Edit** and **Delete** buttons

---

## Filtering and Searching

Use the **search bar** and **Filter** panel to find specific blueprints:

> 📸 Screenshot: The filter panel open on the Schedule page

**Search:** Type any part of the task title, description, or plant name.

**Filters:**
- **Task type** — multi-select checkboxes (Watering, Planting, etc.)
- **Location** — dropdown
- **Area** — dropdown (cascades from location)
- **Garden Plan** — dropdown
- **Plant name** — auto-populated dropdown of plant names in your inventory

**Sort:**
- **Frequency** — blueprints with the most frequent repeat (e.g. every 1 day) shown first
- **Plant name** — alphabetical, weighted by your AI plant preferences

Tap **Clear All** to reset filters.

---

## Creating a Blueprint

There are two ways to create a blueprint:

1. **From the Schedule page** — tap the **+ New Blueprint** button
2. **From the Add Task form** — toggle "Make this recurring" when creating any task (see [Tasks — Creating a Task](./03-tasks.md#creating-a-task))
3. **Global Quick Add** → **Create Task** → toggle recurring

> 📸 Screenshot: The Add Task modal in recurring mode, showing the start date, interval, and end date fields

### Blueprint Fields

| Field | Description |
|-------|-------------|
| **Plant assignment** | Location → Area → Species → which instances this covers |
| **Title** | Short name for the task (e.g. "Water basil") |
| **Description** | Optional notes (care instructions, product to use, etc.) |
| **Task type** | Watering, Maintenance, Pruning, Harvesting, or Planting |
| **Start date** | When the first task should appear |
| **Repeat every** | Number of days between each task (e.g. 3 = every 3 days) |
| **End date** | Optional — leave blank to repeat indefinitely |
| **Scope** | Home-wide or Personal |
| **Assign to** | Optionally assign all recurring tasks to a specific home member |
| **Dependencies** | Link this as waiting on or blocking another task |

Tap **Save** to create the blueprint. Rhozly immediately generates the upcoming ghost tasks for the next few months so they appear in your calendar and task lists.

---

## Editing a Blueprint

Tap **Edit** on any blueprint card. The same form opens, pre-filled with the current values.

> 📸 Screenshot: The Edit Blueprint form pre-filled with existing values

**What editing changes:**
- All future ghost task generations use the new schedule.
- Existing physical tasks that were already materialised from this blueprint are **not changed** — only future ones.

---

## Deleting a Blueprint

Tap **Delete** on a blueprint card. A confirmation modal appears.

> 📸 Screenshot: The delete blueprint confirmation modal

- Tap **Delete Blueprint Only** — removes the rule; any tasks already materialised stay in place.
- Tap **Delete Blueprint and All Tasks** — removes the rule AND deletes all materialised tasks linked to this blueprint.
- Tap **Cancel** to go back.

---

## Blueprints Created Automatically

Rhozly can create blueprints on your behalf in two situations:

### 1. Completing a Planting Task
When you mark a Planting task as complete, Rhozly's **Automation Engine** generates a set of care blueprints for the newly planted species:
- Watering schedule (based on species data)
- Pruning schedule (if applicable)
- Harvesting schedule (if applicable)

These auto-created blueprints appear in your Schedule list and can be edited or deleted like any other blueprint.

### 2. Staging a Garden Plan
When you stage tasks from a Garden Plan, each staged task becomes a blueprint. See [Garden Planner](./06-planner.md) for more.

---

## Blueprint Frequency Tips

| Task type | Suggested frequency |
|-----------|---------------------|
| Watering (most plants) | Every 2–3 days |
| Watering (succulents) | Every 7–14 days |
| Fertilising | Every 14–28 days |
| Pruning (fast-growers) | Every 7 days |
| Harvesting (tomatoes) | Every 2–3 days in season |
| General maintenance | Every 7–14 days |

You can create as many blueprints per plant as needed — for example, one watering blueprint and one pruning blueprint for the same tomato plant.
