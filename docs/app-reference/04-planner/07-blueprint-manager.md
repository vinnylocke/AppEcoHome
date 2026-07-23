# Routines (formerly Blueprint Manager / Task Schedules)

> The recurring-care-template manager. `task_blueprints` is the internal DB table name; the UI now labels these as **Routines** everywhere. Where you define watering reminders, pruning schedules, harvesting cadences, fertilising cycles — the templates that generate the daily tasks you see on the dashboard.

**Vocabulary (wording-audit pass):**
- The surface is called **Routines**.
- Each row is a **Routine** (the rule).
- Each generated occurrence is a **Task** (the dated to-do).
- The per-plant AI feature on the Plant Assignment modal that auto-generates routines is **Smart Routines** (previously "Smart Schedule").
- Smart-device schedules under Integrations remain **Automations** (separate concept, separate table).

**Route:** `/schedule` — **and, since the dashboard-nav-tasks-tray Stage 4 (2026-07-21, B12), also the Planner's "Routines" tab** (`/planner?tab=routines`, rendered by `PlannerHub`): the IA already reparented `/schedule` under the Planner nav item, so Routines is now a first-class tab there rather than only reachable from the account dropdown. In the tab it renders with the **`embedded` prop**, which skips BlueprintManager's mount-time URL deep-link consumption (`?open` / `?category` / `?tab`) — those deep-links target the standalone `/schedule` route, and consuming them embedded would strip PlannerHub's own `?tab=routines` and bounce the tab (review-caught defect).
**Source files:**
- `src/components/BlueprintManager.tsx` — list + filters
- `src/components/AddTaskModal.tsx` — builder modal
- `src/components/OptimiseTab.tsx` — second tab inside this screen

---

## Quick Summary

A list of `task_blueprints` rows for the home. Each routine defines a recurring task: type (Water/Prune/Harvest/Fertilise/Plant/Other), frequency, scope (whole home / location / area / specific plant), and date constraints. Active routines fire daily via the `generate-tasks` cron to materialise `tasks` rows. Pausing a routine stops generation without deleting the template. (Each row is a `task_blueprints` record — "Routine" is the label, not a rename of the table; see the naming note in Role 1.)

Two tabs:
- **Routines** — list of routines (this file)
- **Optimise** — routine consolidator + AI ideas ([07-optimise-tab.md](./08-optimise-tab.md))

---

## Role 1 — Technical Reference

> **Naming vs. code identifiers — read this first.** The user-facing name is **Routines** everywhere: the page heading, the **"New Routine"** button, the onboarding tour ("Your Routines", "Creating a Routine", "Your Routines library"), the audit-log labels ("Created a Routine" / "Deleted a Routine"), the empty / error states ("Set up a Routine", "Could not load Routines", "Routine removed."), and the GardenerProfile **"Routines Created"** stat. The **underlying data model did NOT change**: the table is still `task_blueprints`, the foreign-key column is still `blueprint_id`, and every `data-testid` still uses the `blueprint-*` prefix (`blueprint-new-btn`, `blueprint-list`, `blueprint-{id}-dot-track`, …). Only user-facing copy changed — from "Blueprints" / "Task Schedule" / "Task Automation" to "Routines". Do **not** rename the table, column, state vars, or testids to match the label.

### Component graph

```
BlueprintManager
├── Header
│   ├── Title "Routines"
│   ├── Explainer line
│   ├── "New Routine" button (testid `blueprint-new-btn` — unchanged)
│   └── Tab bar (Routines / Optimise)
├── Search bar + Filter button
├── Filter drawer (Type, Location, Area, Plan, Plant)
├── Blueprint list (Phase 4.5 — colour-coded by task type)
│   └── Card per blueprint (root: `relative overflow-hidden … pl-7`)
│       ├── Type accent bar (`<span absolute left-0 top-0 bottom-0 w-1.5>`, tinted by type)
│       ├── Tinted icon tile (`w-10 h-10` tile, tile bg + icon both in the type hue)
│       ├── Frequency pill + Title
│       ├── Always-visible actions (Pause / Resume + Delete — 44px targets, not hover-gated)
│       ├── Paused-until pill (if paused)
│       ├── Description (line-clamp)
│       └── "Next: <first upcoming>" + 30-day dot track (`blueprint-{id}-dot-track`)
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

**Dot-track dates are not fetched — they're derived inline.** The "Next: …" line and the 30-day dot track are computed client-side per card (no query, no cron). The anchor is `bp.start_date ?? bp.created_at`; occurrence days step forward by `bp.frequency_days` from the first occurrence `>= today`, capped at `bp.end_date` if set, and only the next 30 calendar days are rendered. Cards with no/zero `frequency_days`, or with no upcoming occurrence in the window, render no track. **Annual carry-over (Track B):** for a `recurrence_kind = 'annual' | 'lifecycle_capped'` blueprint the anchor + end are first rolled into the current occurrence via `projectAnnualWindows` (so the preview shows this year's window, never last year's expired dates); past the `recurs_until` lifecycle cap the card renders no track. Recurrence itself is authored via the **"Repeat every year"** toggle in the routine editor ([Add Task Modal](../08-modals-and-overlays/01-add-task-modal.md), which backs this card's Edit) — see [Data Model — Tasks](../99-cross-cutting/04-data-model-tasks.md#annual-carry-over--recurrence_kind-track-b-2026-07).

**Type colour-coding is a single style record.** `TASK_TYPE_STYLE` (via `taskTypeStyle(type)`, with a neutral `DEFAULT_TYPE_STYLE` fallback) maps each task type to one family — `iconClass` (icon colour, unchanged hues), `tileClass` (icon-tile tint), `accentClass` (left bar), `dotClass` (dot-track fill): Watering → blue, Maintenance → orange, Pruning → lime, Harvesting → yellow, Planting → amber, anything else → neutral. The same lookup drives the icon (`getTaskIcon`), the tile, the accent bar, and the dots, so a wall of routines is scannable by care type at a distance.

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

`useHomeRealtime("task_blueprints", refetch)` — multi-device sync. Realtime-triggered refreshes are **silent**: the skeleton (`loading`) shows only on the initial load per home (`hasLoadedRef`, reset on `homeId` change), so another member touching a blueprint no longer flashes the whole list to skeletons. `fetchBlueprints` also carries a generation guard — a stale response from a previous home (or a superseded refetch) is discarded instead of overwriting the current home's list.

### Edge functions invoked

None directly. `AddTaskModal` may call AI helpers (photo-to-task suggestions); `OptimiseTab` calls `optimise-blueprints`.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `generate-tasks` | Reads active blueprints daily and materialises `tasks` rows. **Wave 21.0004:** skips Harvesting/Harvest blueprints with `end_date` set — those follow the window model managed by the frontend ghost engine (one ghost at start_date with `window_end_date = end_date`). |
| `run-automations` | Some automation triggers create blueprints |

### Tier gating

| Feature | Tier |
|---------|------|
| Routine creation / editing | Every tier |
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
- Realtime keeps list current across devices (silent refresh — no skeleton after first load).
- Pause menu uses local `pauseMenuId` (no portal) since it's anchored inline.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Routines are the autopilot of Rhozly. Every recurring chore — water tomatoes every 3 days, mulch the asparagus every spring, deadhead the roses every 2 weeks — lives here as a template. The system generates the actual daily task from each routine. Tap "New Routine" once; never think about that chore again.

For a beginner, the routines created during Plan Staging cover most of what's needed. As you get more confident, you'll come here and add new ones manually.

### Every flow on this screen

#### 1. Add a new routine

- "New Routine" button → `AddTaskModal` opens.
- Pick task type (Water / Prune / Harvest / Fertilise / Plant / Other).
- Choose scope: whole home, a location, a specific area, or a specific plant.
- Frequency: every N days. Tip displayed: "most vegetables need watering every 2–4 days; established shrubs every 7–14 days."
- Start date + optional end date.
- Save.

#### 2. Pause a routine

- Pause icon on a card → menu with options: 1 week / 2 weeks / 1 month.
- The pause and delete controls sit at the top-right of every card and are **always visible** (Phase 4.5) — previously they only faded in on mouse hover, so touch users couldn't see them at all. A paused routine shows a Resume (play) icon in amber instead.
- Paused routines don't generate tasks until the date passes.
- Useful for winter dormancy or holidays.

#### 3. Edit

- Tap a card → AddTaskModal opens in edit mode.

#### 4. Delete

- Trash icon (always visible, top-right of the card) → confirm. Removes the routine *and* any future ghost tasks. Past completed tasks survive.

#### 5. Search / Filter

- Search bar: free-text against title.
- Filter drawer: scope by Type / Location / Area / Plan / Plant.
- Combine filters to narrow to e.g. "All watering routines in the South Bed".
- The **Filters** button carries a small count badge (Phase 4.5) showing exactly how many of the five filters are active — e.g. `2` when both Type and Area are set. Previously it showed only a generic "!" marker; now you can see at a glance how narrow your view is.

#### 6. Optimise tab

- Second tab opens the consolidator + AI ideas. See [Optimise Tab](./08-optimise-tab.md).

#### 7. Read a card at a glance (Phase 4.5)

- Each routine is **colour-coded by care type** — a coloured accent bar down the left edge, a matching tinted icon tile, and matching dots. Blue = watering, orange = maintenance, lime = pruning, yellow = harvesting, amber = planting, grey = anything else. Scan a wall of routines and the watering ones jump out without reading a word.
- Below the title, a **"Next:" line** names the next upcoming occurrence, and a **30-day dot track** shows the rhythm: one dot per day for the coming month. Days a task fires are tall dots in the type's colour; the rest are small, faint dots. Today's dot is ringed. Hover (or long-press) a dot to see its date — due days read "… — due". At a glance you can tell "every 3 days" from "every 2 weeks" without doing the maths.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Title | Free-text |
| Type accent bar | Coloured bar down the left edge, keyed to task type (colour key below). The whole card's colour cue. |
| Type icon (tinted tile) | Water 💧 / Prune ✂️ / Harvest 🌾 / Fertilise 🌿 / Plant 🌱 / Other — the icon sits in a tile tinted the same type colour as the accent bar. |
| Frequency | Every N days |
| "Next:" line | The next upcoming occurrence date (first fire ≥ today). |
| Dot track | A 30-day rhythm strip: tall coloured dots on days the routine fires, small faint dots otherwise, today ringed. Per-dot hover shows the date (due days read "… — due"). |
| Scope chip | Where it applies |
| Paused-until pill | If paused, until when |
| AI badge | Generated by AI (Plant Doctor or AI Optimise) |

**Type colour key:** Watering = blue · Maintenance = orange · Pruning = lime · Harvesting = yellow · Planting = amber · anything else = neutral grey. The same colour drives the accent bar, the icon + its tile, and the dot-track fill.

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Full CRUD on routines. |
| Sage / Evergreen | + AI photo-to-task suggestions + Optimise AI proposals. |

### Common mistakes / pitfalls

- **Setting frequency too tight.** Watering every day in October is overkill; plants drown. Default sane frequencies and adjust.
- **Forgetting to pause for winter.** Many recurring routines don't need to fire in winter — pause them in October, resume in March.
- **Scope too broad.** "Water every plant in this home every 3 days" is rarely what you want. Scope to specific area or plant.
- **Deleting instead of archiving.** Deleted routines lose their history reference — past tasks no longer link back.

### Recommended workflows

- **Initial setup:** create one routine per major recurring chore. Don't try to be exhaustive — add as you discover gaps.
- **End of season:** pause everything that's dormancy-sensitive. Review Optimise tab for consolidation ideas.
- **After a plan:** review the routines Plan Staging created and tweak frequencies to your reality.

### What to do if something looks wrong

- **Tasks not showing on dashboard:** check if the routine is paused. Check `is_archived`. Check start/end date range.
- **Same task appearing twice:** two routines with overlapping scope. Use Optimise to find redundancies.
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
