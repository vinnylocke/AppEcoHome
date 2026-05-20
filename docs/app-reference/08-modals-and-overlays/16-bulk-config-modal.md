# Bulk Config Modal

> Opens when multiple plant instances are selected in the Shed. Apply a single change (status / growth state / planted date / move to area) to all selected at once.

**Source file:** `src/components/BulkConfigModal.tsx`

---

## Quick Summary

A simple modal with a Location → Area picker + status / growth state / planted date fields. Every field is optional — only filled fields are written to the selected instances.

---

## Role 1 — Technical Reference

### Component graph

```
BulkConfigModal
├── Header (close, "Edit N items")
├── Status dropdown (optional)
├── Growth state dropdown (optional)
├── Planted date picker (optional)
├── Location → Area chained dropdowns (optional)
├── Cancel / Save
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `currentAreaId` | `string` | parent | Pre-fill |
| `selectedCount` | `number` | parent | Header label |
| `isProcessing` | `boolean` | parent | Save in flight |
| `onClose` | `() => void` | parent | Hide |
| `onSave` | `(payload) => void` | parent | Save callback |

### Form

```ts
{
  status: "" | "In Shed" | "Planted" | "Harvested" | ...,
  growth_state: "" | GROWTH_STATES[],
  planted_at: "" | ISO date,
  location_id: "",
  area_id: "",
}
```

Empty strings mean "don't change".

### Data flow — read paths

Locations + areas for the chained dropdowns.

### Data flow — write paths

Parent's `onSave(payload)` calls e.g.:

```ts
supabase.from("inventory_items")
  .update(filteredPayload)
  .in("id", selectedIds);
```

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `inventory.edit` — required.

### Error states

| State | Result |
|-------|--------|
| Save partial fail | Toast |
| Locations fail to load | Inline retry |

### Performance

- Single DB update across the selection.
- Focus trap implemented inline.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this modal

If you've just moved 6 plants from "Seedling Tray" to "Raised Bed 2", bulk config saves you opening 6 separate Instance Edit modals.

### Every flow on this modal

#### 1. Select multiple

- Long-press / shift-select multiple plants in the Shed.

#### 2. Open bulk config

- "Edit N" button appears in the Shed toolbar.

#### 3. Fill only what changes

- Leave the rest empty.

#### 4. Save

- Applies to every selected item.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Setting status without growth state.** They're independent — set both if both change.
- **Moving area but forgetting location.** Some areas live under one location; picker chain handles it.

### Recommended workflows

- **Move day:** select all seedlings going outside, set location/area + status + planted_at in one shot.

### What to do if something looks wrong

- **Some items updated, some didn't:** RLS may have denied a subset. Check per-item.

---

## Related reference files

- [The Shed](../03-garden-hub/01-the-shed.md)
- [Instance Edit Modal](./08-instance-edit-modal.md)

## Code references for ongoing maintenance

- `src/components/BulkConfigModal.tsx`
