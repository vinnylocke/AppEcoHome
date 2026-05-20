# Plant Assignment Modal

> Assigns a plant from the Shed (the species record) into a specific area as an `inventory_items` row. Captures growth state, quantity, planted date, propagation, smart schedule opt-in, and area binding.

**Source file:** `src/components/PlantAssignmentModal.tsx`

---

## Quick Summary

Opens after picking a plant — typically from BulkSearch → "Add to Shed" or from the Shed's Assign button. The user picks Location → Area, fills growth state (optional), quantity, planted date, propagation, and ticks "Smart Schedules" to auto-generate watering/pruning blueprints via `AutomationEngine`.

---

## Role 1 — Technical Reference

### Component graph

```
PlantAssignmentModal (Portal, focus-trapped)
├── Header (close, plant name)
├── Location → Area chained dropdowns
├── Growth state dropdown (optional)
├── Is established checkbox
├── Quantity input
├── Planted date picker
├── Propagation method dropdown
├── Smart Schedules toggle
├── InfoTooltip × N (per field)
├── Cancel / Assign
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plant` | `any` | parent | The species |
| `locations` | `any[]` | parent | Location + areas lookup |
| `onAssign` | `(data) => Promise<void>` | parent | Save callback |
| `onClose` | `() => void` | parent | Hide |
| `isAssigning` | `boolean` | parent | Save in flight |
| `homeId` | `string` | parent | Scope |
| `aiEnabled` | `boolean?` | parent | Some smart-schedule features gate on AI |

### Constants

```ts
GROWTH_STATES = [
  "Germination", "Seedling", "Vegetative",
  "Budding/Pre-Flowering", "Flowering/Bloom",
  "Fruiting/Pollination", "Ripening/Maturity",
  "Senescence",
];

PROPAGATION_OPTIONS = [
  "Starter Plant", "Seed", "Bulb", "Cuttings",
  "Division", "Layering", "Grafting",
];
```

### Data flow — write paths

Parent's `onAssign` typically:

```ts
supabase.from("inventory_items").insert({
  home_id, plant_id, area_id, location_id,
  growth_state, is_established, quantity,
  planted_date, propagation_method,
  status: "In Shed",
});

// If Smart Schedules enabled:
AutomationEngine.createSmartSchedules({ inventoryItemId, plant, area });
```

`AutomationEngine` synthesises blueprints based on the plant's care defaults (e.g. watering every 4 days for a tomato, pruning every 21 days).

### Edge functions invoked

None directly. AutomationEngine writes blueprints client-side.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `generate-tasks` | Picks up the new blueprints next run |

### Realtime channels

None.

### Tier gating

- Smart Schedules toggle visible to every tier but content of generated blueprints leans on plant care data (Botanist+ for Perenual).

### Beta gating

None.

### Permissions

- `inventory.write` — to insert the row.

### Error states

| State | Result |
|-------|--------|
| No area picked | Inline error |
| Insert fails | Toast |

### Performance

- Modal lightweight; chained dropdowns cached from locations prop.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this modal

Before a plant in the Shed earns its keep, it has to live somewhere. Assignment is the bridge: it tells Rhozly *where* this plant is, so tasks/watering/lux can be tied to that area.

### Every flow on this modal

#### 1. Pick Location → Area

- Required. Areas appear after picking a location.

#### 2. Growth state (optional)

- Helps tasks / care suggestions adjust to plant maturity.

#### 3. Quantity

- Default 1. Use higher for multi-plant beds (e.g. "8 onion sets").

#### 4. Planted date

- Default today; pick earlier if you're back-filling.

#### 5. Propagation

- How you started this plant. Affects some care advice.

#### 6. Smart Schedules toggle

- ON (default): generates blueprints for watering/pruning based on plant's care profile.
- OFF: you'll have to set schedules manually later.

#### 7. Assign

- Inserts the inventory item. Plant appears in the area.

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Manual schedules only (no smart). |
| Botanist+ | Smart schedules pull from Perenual care data. |
| Sage/Evergreen | + AI-tuned schedules based on user preferences. |

### Common mistakes / pitfalls

- **Skipping growth state.** Defaults to "Vegetative". Wrong state can mean wrong task suggestions.
- **Quantity = 1 when planting 6.** Inventory count will be off.
- **Smart Schedules off then forgetting to add manual.** Plant exists in the area but no reminders fire.

### Recommended workflows

- **New plant from search:** assign → leave Smart Schedules on → done.
- **Back-fill existing garden:** assign with the correct `planted_date` so age-based tasks (e.g. transplant cycles) compute right.

### What to do if something looks wrong

- **Assigned but doesn't appear in area:** check `inventory_items.area_id` matches the area you intended.
- **No tasks generated:** smart schedule may have failed silently. Re-trigger via Blueprint Manager.

---

## Related reference files

- [Plant Search Modal](./05-plant-search-modal.md)
- [Bulk Search Modal](./04-bulk-search-modal.md)
- [Plant Edit Modal](./06-plant-edit-modal.md)
- [Instance Edit Modal](./08-instance-edit-modal.md)
- [The Shed](../03-garden-hub/01-the-shed.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/PlantAssignmentModal.tsx`
- `src/lib/automationEngine.ts` — smart schedule generator
- `src/components/InfoTooltip.tsx`
