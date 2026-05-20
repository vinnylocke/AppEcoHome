# Global Quick Add

> The Plus dropdown in the header. Seven deep-link shortcuts to create the most common entities — task, blueprint, plant, plan, location, ailment, guide. Each link encodes the open intent in a query parameter that the destination consumes.

**Source file:** `src/components/GlobalQuickAdd.tsx`

---

## Quick Summary

Click the "+" in the header → dropdown with 7 actions. Each action navigates to the relevant screen with `?open=...` so the destination auto-opens the right modal.

---

## Role 1 — Technical Reference

### Component graph

```
GlobalQuickAdd
├── Plus button (trigger)
└── Dropdown (when open)
    └── Action × 7 (Add Task / Automation / Plant / Plan / Location / Ailment / Guide)
```

### Action registry

| Action | Path |
|--------|------|
| Add Task | `/dashboard?view=calendar&open=add-task` |
| Add Task Automation | `/schedule?open=add-task` |
| Add Plant | `/shed?open=add-plant` |
| Create Plan | `/planner?open=new-plan` |
| Create Location | `/management?open=add-location` |
| Log Ailment | `/shed?tab=watchlist&open=add-ailment` |
| Create Guide | `/guides?tab=community&open=new-guide` |

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

- **Confusing "Add Task" with "Add Task Automation".** Task = one-off. Automation = recurring blueprint.

### Recommended workflows

- **Muscle memory.** Plus → Add Plant is the fastest way to add inventory.

### What to do if something looks wrong

- **Destination doesn't auto-open:** the `?open=...` handler may not be wired. Check the destination's URL state parser.

---

## Related reference files

- [Global Search](./22-global-search.md)
- [Header / Top Bar](../09-persistent-ui/01-header.md)

## Code references for ongoing maintenance

- `src/components/GlobalQuickAdd.tsx`
- Destination parsers honour `?open=...` (per-screen)
