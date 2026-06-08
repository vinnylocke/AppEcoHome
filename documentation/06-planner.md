# Garden Planner

The **Planner** lives under the **Plan** tab in the sidebar (or directly at `/planner`). Use it to create AI-generated garden plans and work through a guided workflow to bring them to life.

**Shopping Lists** are their own separate page — see [Shopping Lists](./07-shopping-lists.md).

> 📸 Screenshot: The Planner hub showing the Plans tab active, with three plan cards in the grid (In Progress, Completed, Archived)

---

## What is a Garden Plan?

A garden plan is an AI-generated blueprint for a planting project — for example, "Set up a productive raised vegetable bed for summer" or "Create a low-water herb garden in the south corner."

You describe your goals and Rhozly's AI produces a structured plan with plant recommendations, preparation tasks, and maintenance schedules. A guided 5-phase staging workflow then helps you turn the blueprint into real tasks and purchases.

---

## Viewing Plans

Plans are displayed as cards, filterable by **All / Active / Completed / Archived**.

> 📸 Screenshot: Plan cards in the "Pending" section showing titles, subtitles, plant counts, and an options menu button

Each card shows:
- **Plan title** and description
- **Status badge** (In Progress / Completed / Archived)
- **Options menu** (⋯) — Archive, Delete

---

## Creating a Plan

You have two ways to create a plan: a **New Plan** (describe what you want to grow) and an **Overhaul** (photo-grounded redesign of an existing space — Sage+ only).

### New Plan

Tap **+ New Plan** (or use [Global Quick Add](./15-navigation-quick-add.md#global-quick-add) → **Create Plan**).

> 📸 Screenshot: The New Plan form with fields for garden size, climate, skill level, and goal checkboxes

The wizard has three steps:

1. **Describe your project** — type a prompt describing what you want to grow or achieve (e.g. "A productive summer vegetable raised bed"). Rhozly sends this to the AI.
2. **Review AI Blueprint** — the AI returns a structured plan with a project overview, recommended plants (with quantities and procurement advice), preparation tasks, and custom maintenance tasks. Review and tap **Accept**, or go back to revise.
3. **Name and save** — give your plan a name and tap **Create Plan**.

> 📸 Screenshot: The loading screen while the AI generates the plan, with an animated sparkle icon

### Garden Overhaul (Sage+)

Tap the **Overhaul** button next to **+ New Plan** to redesign an existing garden from a photo.

> 📸 Screenshot: The Overhaul modal with a photo upload area, three free-text fields, an aesthetic dropdown, and an image-quality toggle

1. **Upload or capture a photo** of the area you want to redesign.
2. Describe what you **like**, **dislike**, and **want** in three short fields.
3. Pick an **aesthetic** (modern / cottage / wildlife / mediterranean / etc.) and an image-quality setting.
4. Submit — Rhozly's vision AI analyses the photo and Imagen 4 produces three concept "after" images.

Generation takes 30–60 seconds. When it finishes, the **Overhaul result view** shows:
- Your original photo on the left
- The three AI concept images on the right (radio-style — pick one)
- The redesign blueprint underneath (markdown text — plants, layout, prep steps)
- A feedback row (👍 / 👎 + free text)

The selected concept flows through the same 5-phase Plan Staging as a New Plan.

> 📸 Screenshot: The Overhaul result view showing before/after side-by-side with the AI blueprint below

Free and Botanist tiers see a locked placeholder explaining the feature and inviting an upgrade.

---

## Plan Staging

Opening a plan card enters the **Plan Staging** view — a guided 5-phase workflow to take the AI blueprint into reality.

> 📸 Screenshot: The Plan Staging view — AI blueprint on the left (markdown text), staged task list on the right

### Phase 1 — Infrastructure

Link the plan to an existing garden area (or create a new one). Select the **Location** and **Area** where this plan will be carried out.

Once an area is selected, Phase 1 is marked complete and Phase 2 unlocks.

### Phase 2 — The Shed

Rhozly checks each plant in the AI blueprint against your current Shed inventory:

- **Already in Shed** — shown with a green match indicator; no sourcing action needed.
- **Need to source** — a checkbox appears so you can mark it for procurement.
- **Select All / Deselect All** — when there are two or more plants to source, a toggle button lets you check or uncheck all at once.

Tap **Add to Shopping List** to create items in your [Shopping List](./07-shopping-lists.md) for the selected plants.

### Phase 3 — Staging

Build out the preparation task sequence. Tasks generated from the AI blueprint appear here as a starting point. You can:
- Accept them as-is
- Edit titles, descriptions, and due dates
- Reorder the sequence

Tap **Stage Tasks** to confirm and create the task blueprints in your Schedule.

### Phase 4 — Execution

Work through the staged tasks in your [Schedule](./04-schedule.md). This phase tracks progress as tasks are completed.

### Phase 5 — Maintenance

Once the plan is underway, Rhozly generates recurring maintenance tasks (watering schedules, feeding, pruning) based on the AI blueprint's custom maintenance schedule. These appear as blueprints in your Schedule.

> 📸 Screenshot: The staging confirmation dialog listing tasks with location/area assignments

---

## Plan Statuses

| Status | Meaning |
|--------|---------|
| **In Progress** | Plan is active — staging or execution underway |
| **Completed** | All tasks done; plan marked as a success |
| **Archived** | Paused or abandoned; kept for reference |

---

## Archiving a Plan

Options menu (⋯) → **Archive**. The plan moves to the **Archived** filter. Tap **Restore** on any archived plan to bring it back to active.

---

## Deleting a Plan

Options menu (⋯) → **Delete**. A confirmation modal appears before permanent removal.
