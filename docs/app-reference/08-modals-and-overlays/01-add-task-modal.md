# Add Task / Edit Schedule Modal

> The unified modal for creating standalone tasks AND recurring task schedules (blueprints). Used everywhere — Blueprint Manager, Dashboard quick-add, Calendar tab "+" button, AI assistant suggestions, etc.

**Source file:** `src/components/AddTaskModal.tsx` (~1,430 lines)
**Triggers:** Multiple — Blueprint Manager, Dashboard, Calendar, AI suggestions, Quick Add menu.

---

## Quick Summary

When the task type is **Planting**, a "From your Nursery" packet picker surfaces between the task-type select and the location grid. Selecting a packet pre-fills the title (e.g. *"Sow Tomato Sungold"*) and appends a provenance line to the description. The picker is purely UX — no packet id is persisted on the task; logging the actual sowing happens via [The Nursery](../03-garden-hub/10-nursery.md)'s Log a sowing flow.

A long modal with mode-switching:

- **One-off task mode** — creates a single `tasks` row with `due_date`.
- **Recurring (blueprint) mode** — creates a `task_blueprints` row that fires daily via cron.

Either mode supports: title, type (Watering / Pruning / Harvesting / Maintenance / Planting), description, scope (home / personal), location, area, linked plants (multi-select), linked plan, start/end dates, frequency. Photo-to-task (Sage/Evergreen) lets the user upload a photo and AI suggests title + type + frequency.

---

## Role 1 — Technical Reference

### Component graph

```
AddTaskModal (Portal)
├── Header (close, mode badge "Add Task" / "Edit Schedule")
├── Photo-to-task section (AI tiers)
│   ├── Camera + Library buttons
│   └── Suggested fields chip
├── Title input + type picker
├── Description
├── Scope toggle (Home / Personal)
├── Location → Area chained dropdowns
├── Linked plants picker (multi-select)
├── Linked plan picker
├── Recurring toggle
├── Frequency input (when recurring)
├── Start date + end date
└── Cancel / Save
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `selectedDate` | `Date?` | parent | Pre-fill start_date |
| `isBlueprintMode` | `boolean?` | parent | Force recurring mode |
| `existingBlueprint` | `any?` | parent | Edit mode |
| `aiEnabled` | `boolean?` | parent | Photo-to-task gate |
| `onClose` | `() => void` | parent | Close |
| `onSuccess` | `() => void` | parent | Refresh + close |

### Form fields (subset)

```ts
{
  title, type, description,
  location_id, area_id, selected_species,
  inventory_item_ids: number[],
  plan_id,
  start_date, end_date,
  isRecurring, frequency_days,
  scope: "home" | "personal",
}
```

### Type → default frequency

| Type | Days |
|------|------|
| Watering | 4 |
| Pruning | 21 |
| Harvesting | 7 |
| Maintenance | 14 |
| Planting | 30 |

### Data flow — read paths

- Locations + areas joined for the chained dropdowns.
- Plans for the linked-plan dropdown.
- Inventory items for the plant multi-select.
- User preferences via `usePlantDoctor()` → `scorePlantByPreferences` ranks plants in picker.

### Data flow — write paths

#### Save one-off
```ts
supabase.from("tasks").insert({
  home_id, user_id (if scope=personal), title, task_type, description,
  due_date: start_date, location_id, area_id, plan_id,
  inventory_item_ids,
});
```

#### Save blueprint
```ts
BlueprintService.createOrUpdate({...});
// Inserts or updates task_blueprints + nested links
```

### Photo-to-task flow (Sage/Evergreen)

1. Camera/library picks image.
2. Upload to `plant-doctor-images`.
3. Call edge fn `task-from-photo` with `{ imageUrl, homeId }`.
4. Receive `{ suggested_title, suggested_type, suggested_frequency_days, description }`.
5. Pre-fill the form.

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `task-from-photo` | AI extracts task suggestion from image |

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `generate-tasks` | Materialises blueprint-derived tasks daily |

### Realtime channels

None.

### Tier gating

- Photo-to-task button: hidden on non-AI tiers.

### Beta gating

None.

### Permissions

- `tasks.create_home` / `tasks.create_personal` — scope determines which is required.

### Error states

| State | Result |
|-------|--------|
| Missing title | Inline error |
| Missing date | Inline error |
| Save fails | Toast |

### Performance

- Single-modal form; lazy via `createPortal`.
- Photo upload progressive; user can edit fields while AI runs.

### Linked storage buckets

- `plant-doctor-images` — photos for photo-to-task.

---

## Role 2 — Expert Gardener's Guide

### Why use this modal

Every recurring chore + every ad-hoc task starts here. Most users open it dozens of times during onboarding ("water tomatoes every 3 days", "prune roses every 3 weeks") and then occasionally as new beds appear.

### Every flow on this modal

#### 1. Pick task type

- Affects icon + default frequency + hint copy.

#### 2. Photo-to-task (AI tiers)

- Snap a photo or pick from library → AI suggests title + type + frequency.
- Edit before saving.

#### 3. Scope: home vs personal

- Home = everyone in the home sees it.
- Personal = only you.

#### 4. Pick area + plants

- Optional. Without them the task is "home-wide".
- With them, the task appears on the area's card / plant's instance view.

#### 5. Recurring toggle

- One-off: pick a single date.
- Recurring: blueprint mode → set frequency + start + end.

#### 6. Save

- One-off → tasks list updates.
- Recurring → blueprint list updates; next instance appears tomorrow at minimum.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Title | Free-text |
| Type | Drives icon + frequency default |
| Scope | Home (shared) vs Personal (you only) |
| Frequency days | How often (recurring mode) |
| End date | When the schedule stops firing |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout/Botanist | No photo-to-task. |
| Sage/Evergreen | Photo-to-task button + AI suggestions. |

### Common mistakes / pitfalls

- **Setting frequency too tight.** Default is sensible; tweak only if your reality differs.
- **Forgetting to pick area.** Home-wide tasks are fine but lose context.
- **Mixing scopes.** Personal tasks won't show on the home dashboard for others — by design.

### Recommended workflows

- **Per plant:** create a watering blueprint when adding a plant to the Shed.
- **Per area:** maintenance blueprints scoped to an area cover everything in it.
- **One-offs:** quick-add via dashboard for impromptu chores.

### What to do if something looks wrong

- **Saved but doesn't appear:** check tab (Pending / Completed). Standalone tasks land in Pending by default.
- **Photo-to-task paywall on AI tier:** check `profile.ai_enabled`. Re-pick tier in Account if needed.

---

## Related reference files

- [Quick Add Task Modal](./35-quick-add-task-modal.md) — slim sibling used by the mobile [Localized Task Calendar](../02-dashboard/10-localized-task-calendar.md). Use this full modal when the task needs area/plant binding, plan linking, recurring schedule, scope toggle, or photo-to-task AI. Use the Quick sibling for one-off "log it now, file later" captures.
- [Task Detail Modal](./02-task-modal.md)
- [Blueprint Manager](../04-planner/07-blueprint-manager.md)
- [Calendar Tab](../02-dashboard/03-calendar-tab.md)
- [Tier Gating (cross-cutting)](../99-cross-cutting/17-tier-gating.md)

## Code references for ongoing maintenance

- `src/components/AddTaskModal.tsx`
- `src/services/blueprintService.ts`
- `src/constants/taskCategories.ts`
- `supabase/functions/task-from-photo/index.ts` — AI suggest
- `supabase/functions/generate-tasks/index.ts` — daily cron
