# Routines (formerly Blueprint Manager / Task Schedules)

> The recurring-care-template manager. `task_blueprints` is the internal DB table name; the UI now labels these as **Routines** everywhere. Where you define watering reminders, pruning schedules, harvesting cadences, fertilising cycles — the templates that generate the daily tasks you see on the dashboard.

**Vocabulary (wording-audit pass):**
- The surface is called **Routines**.
- Each row is a **Routine** (the rule).
- Each generated occurrence is a **Task** (the dated to-do).
- The per-plant AI feature on the Plant Assignment modal that auto-generates routines is **Smart Routines** (previously "Smart Schedule").
- Smart-device schedules under Integrations remain **Automations** (separate concept, separate table).

**Route:** `/schedule`
**Source files:**
- `src/components/BlueprintManager.tsx` — list + filters
- `src/components/AddTaskModal.tsx` — builder modal
- `src/components/OptimiseTab.tsx` — second tab inside this screen

---

## Quick Summary

A list of `task_blueprints` rows for the home. Each blueprint defines a recurring task: type (Water/Prune/Harvest/Fertilise/Plant/Other), frequency, scope (whole home / location / area / specific plant), and date constraints. Active blueprints fire daily via the `generate-tasks` cron to materialise `tasks` rows. Pausing a blueprint stops generation without deleting the template.

Two tabs:
- **Blueprints** — list of schedules (this file)
- **Optimise** — schedule consolidator + AI ideas ([07-optimise-tab.md](./08-optimise-tab.md))

---

## Role 1 — Technical Reference

### Component graph

```
BlueprintManager
├── Header
│   ├── Title "Task Schedules"
│   ├── Explainer line
│   ├── Add button
│   └── Tab bar (Blueprints / Optimise)
├── Search bar + Filter button
├── Filter drawer (Type, Location, Area, Plan, Plant)
├── Blueprint list
│   └── Card per blueprint
│       ├── Icon (by type)
│       ├── Title / frequency / scope chips
│       ├── Paused-until pill (if paused)
│       └── Actions (Edit / Pause / Delete)
├── AddTaskModal (when isBuilding === true)
├── ConfirmModal (delete)
└── OptimiseTab (when activeTab === "optimise")
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |
| `aiEnabled` | `boolean` | App.tsx | Gates AI features in AddTaskModal + OptimiseTab |

### Local state

| State | Purpose |
|-------|---------|
| `activeTab` | "blueprints" / "optimise" |
| `blueprints`, `loading`, `fetchError`, `retryTick` | List state |
| `isBuilding`, `editingBlueprint` | Builder modal state |
| `pauseMenuId`, `savingPauseId` | Pause-until UI state |
| `confirmState` | Delete confirm modal |
| `searchQuery`, `isFilterOpen`, `filterType`, `filterLocation`, `filterArea`, `filterPlan`, `filterPlant` | Filter state |
| `filterOptions` | Distinct values extracted from blueprint relations |

### Data flow — read paths

```ts
supabase.from("task_blueprints")
  .select("*, locations(name), areas(name), plans(name, ai_blueprint)")
  .eq("home_id", homeId)
  .eq("is_archived", false)
  .order("created_at", { ascending: false });

supabase.from("inventory_items").select("id, plant_name").eq("home_id", homeId);
```

The inventory map joins back to blueprints (which reference inventory by `inventory_item_id`) for the plant filter chip.

### Data flow — write paths

| Operation | DB |
|-----------|----|
| Create / edit | via `AddTaskModal` → `task_blueprints.insert` or `.update` |
| Pause for N days | `task_blueprints.update({ paused_until }).eq("id", id)` |
| Resume | `task_blueprints.update({ paused_until: null })` |
| Archive (soft delete) | `task_blueprints.update({ is_archived: true })` |
| Hard delete | `task_blueprints.delete()` — only via Confirm modal |

### Blueprint shape (key columns)

```ts
{
  id, home_id, title,
  task_type: "water" | "prune" | "harvest" | "fertilise" | "plant" | "other",
  frequency_days: number,            // every N days
  scope: "home" | "location" | "area" | "inventory_item" | "plant",
  location_id?, area_id?, inventory_item_id?, plan_id?, plant_id?,
  starts_at: date, ends_at?: date,
  paused_until?: date,
  is_archived: boolean,
  ai_generated?: boolean,
  ...
}
```

### Realtime channels

`useHomeRealtime("task_blueprints", refetch)` — multi-device sync.

### Edge functions invoked

None directly. `AddTaskModal` may call AI helpers (photo-to-task suggestions); `OptimiseTab` calls `optimise-blueprints`.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `generate-tasks` | Reads active blueprints daily and materialises `tasks` rows |
| `run-automations` | Some automation triggers create blueprints |

### Tier gating

| Feature | Tier |
|---------|------|
| Blueprint creation / editing | Every tier |
| AI suggestions / photo-to-task | Sage / Evergreen (`aiEnabled`) |
| Optimise tab AI proposals | Sage / Evergreen |

### Beta gating

Some Optimise scenario types are beta-gated; see [Optimise Tab](./08-optimise-tab.md).

### Permissions

- `tasks.write` — gates Add / Edit / Delete / Pause.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | `fetchError` → retry banner |
| Pause fails | Toast; local state reverted via realtime |
| Delete fails | Toast |

### Performance

- Single fetch + parallel inventory lookup.
- Filters computed client-side via `useMemo`.
- Realtime keeps list current across devices.
- Pause menu uses local `pauseMenuId` (no portal) since it's anchored inline.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Task Schedules are the autopilot of Rhozly. Every recurring chore — water tomatoes every 3 days, mulch the asparagus every spring, deadhead the roses every 2 weeks — lives here as a template. The system generates the actual daily task on each schedule based on these templates. Tap "Add" once; never think about that chore again.

For a beginner, the schedules created during Plan Staging cover most of what's needed. As you get more confident, you'll come here and add new ones manually.

### Every flow on this screen

#### 1. Add a new schedule

- Plus button → `AddTaskModal` opens.
- Pick task type (Water / Prune / Harvest / Fertilise / Plant / Other).
- Choose scope: whole home, a location, a specific area, or a specific plant.
- Frequency: every N days. Tip displayed: "most vegetables need watering every 2–4 days; established shrubs every 7–14 days."
- Start date + optional end date.
- Save.

#### 2. Pause a schedule

- Pause icon on a card → menu with options: 1 week / 1 month / Until date / Pause indefinitely.
- Paused schedules don't generate tasks until the date passes.
- Useful for winter dormancy or holidays.

#### 3. Edit

- Tap a card → AddTaskModal opens in edit mode.

#### 4. Delete

- Trash → confirm. Removes the blueprint *and* any future ghost tasks. Past completed tasks survive.

#### 5. Search / Filter

- Search bar: free-text against title.
- Filter drawer: scope by Type / Location / Area / Plan / Plant.
- Combine filters to narrow to e.g. "All watering schedules in the South Bed".

#### 6. Optimise tab

- Second tab opens the consolidator + AI ideas. See [Optimise Tab](./08-optimise-tab.md).

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Title | Free-text |
| Type icon | Water 💧 / Prune ✂️ / Harvest 🌾 / Fertilise 🌿 / Plant 🌱 / Other |
| Frequency | Every N days |
| Scope chip | Where it applies |
| Paused-until pill | If paused, until when |
| AI badge | Generated by AI (Plant Doctor or AI Optimise) |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Full CRUD on schedules. |
| Sage / Evergreen | + AI photo-to-task suggestions + Optimise AI proposals. |

### Common mistakes / pitfalls

- **Setting frequency too tight.** Watering every day in October is overkill; plants drown. Default sane frequencies and adjust.
- **Forgetting to pause for winter.** Many recurring schedules don't need to fire in winter — pause them in October, resume in March.
- **Scope too broad.** "Water every plant in this home every 3 days" is rarely what you want. Scope to specific area or plant.
- **Deleting instead of archiving.** Deleted blueprints lose their history reference — past tasks no longer link back.

### Recommended workflows

- **Initial setup:** create one schedule per major recurring chore. Don't try to be exhaustive — add as you discover gaps.
- **End of season:** pause everything that's dormancy-sensitive. Review Optimise tab for consolidation ideas.
- **After a plan:** review the schedules Plan Staging created and tweak frequencies to your reality.

### What to do if something looks wrong

- **Tasks not showing on dashboard:** check if the blueprint is paused. Check `is_archived`. Check start/end date range.
- **Same task appearing twice:** two blueprints with overlapping scope. Use Optimise to find redundancies.
- **Pause didn't work:** check the toast; realtime refresh will resync.

---

## Related reference files

- [Optimise Tab](./08-optimise-tab.md)
- [Add Task / Edit Schedule Modal](../08-modals-and-overlays/01-add-task-modal.md)
- [Task Detail Modal](../08-modals-and-overlays/02-task-modal.md)
- [Tasks Data Model (cross-cutting)](../99-cross-cutting/04-data-model-tasks.md)
- [Cron Jobs (cross-cutting)](../99-cross-cutting/11-cron-jobs.md) — `generate-tasks` cadence

## Code references for ongoing maintenance

- `src/components/BlueprintManager.tsx` — list
- `src/components/AddTaskModal.tsx` — builder
- `src/components/OptimiseTab.tsx` — sibling tab
- `src/constants/taskCategories.ts` — task type metadata
- `src/hooks/useHomeRealtime.ts` — realtime
- `supabase/functions/generate-tasks/index.ts` — daily materialisation
- `src/events/registry.ts` — blueprint events
