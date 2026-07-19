# Global Quick Add

> The Plus dropdown in the header. Five deep-link shortcuts to the most common actions — add a plant, add a task, diagnose a plant, create a plan, add a location. Each link encodes the open intent in a query parameter (or a plain route) that the destination consumes.

**Source file:** `src/components/GlobalQuickAdd.tsx` (trigger testid `global-quick-add-button`)

---

## Quick Summary

Click the "+" in the header (testid `global-quick-add-button`) → dropdown with 5 actions. Each action navigates to the relevant screen — most carry `?open=...` so the destination auto-opens the right modal; "Diagnose a Plant" just routes to `/doctor`. The menu was pruned from 9 items to 5 in Phase 5.

---

## Role 1 — Technical Reference

### Component graph

```
GlobalQuickAdd
├── Plus button (trigger, testid `global-quick-add-button`)
└── Dropdown (when open)
    └── Action × 5 (Add Plant / Add Task / Diagnose a Plant / Create Plan / Add Location)
```

### Action registry

| # | Action | Path | Testid |
|---|--------|------|--------|
| 1 | Add Plant | `/shed?open=add-plant` | `quick-add-add-plant` |
| 2 | Add Task | `/dashboard?view=calendar&open=add-task` | `quick-add-add-task` |
| 3 | Diagnose a Plant | `/doctor` | `quick-add-diagnose` |
| 4 | Create Plan | `/planner?open=new-plan` | `quick-add-create-plan` |
| 5 | Add Location | `/management?open=add-location` | `quick-add-create-location` |

**"Diagnose a Plant" (item 3) is new in Phase 5** — it uses the **Stethoscope** icon and routes straight to Plant Doctor (`/doctor`, no `?open=...` param). **"Add Location" was relabelled** from the former "Create Location" (its path and its `quick-add-create-location` testid are unchanged).

### Removed actions (pruned Phase 5)

The launcher was trimmed from 9 items to 5. These actions were **removed from the Quick Add menu** but remain reachable from their own surfaces:

| Removed action | Reach it from |
|----------------|---------------|
| Add To-Do List | Shopping Lists (`/shopping`) |
| My To-Do Lists | Shopping Lists (`/shopping`) |
| Add Task Automation | Routines (`/schedule`) → "New Routine" |
| Log Ailment | Watchlist (`/shed?tab=watchlist`) |
| Create Guide | Guides (`/guides?tab=community`) |

### Data flow

No fetches. Pure navigation.

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None at this surface; destinations enforce.

### Beta gating

None.

### Permissions

None at this surface.

### Error states

None.

### Performance

- Pure render + outside-click listener.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this menu

When you're three tabs deep and want to create something else, this is the universal "new" button.

### Every flow on this menu

#### 1. Tap +

- Menu opens.

#### 2. Tap an action

- Navigates + auto-opens the relevant modal.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **"Add Task" makes a single dated task, not a recurring one.** For a recurring care template use **Routines** (`/schedule` → "New Routine") — recurring routines are no longer offered in this menu.

### Recommended workflows

- **Muscle memory.** Plus → Add Plant is the fastest way to add inventory.

### What to do if something looks wrong

- **Destination doesn't auto-open:** the `?open=...` handler may not be wired. Check the destination's URL state parser.

---

## Related reference files

- [Global Search](./22-global-search.md)
- [Header / Top Bar](../09-persistent-ui/01-header.md)
- [Plant Doctor](../05-tools/02-plant-doctor.md) — destination of the new "Diagnose a Plant" action
- [Routines](../04-planner/07-blueprint-manager.md) — where the removed "Add Task Automation" now lives

## Code references for ongoing maintenance

- `src/components/GlobalQuickAdd.tsx`
- Destination parsers honour `?open=...` (per-screen)
