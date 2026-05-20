# Companion Plants Tab

> Inside InstanceEditModal. Shows companion + antagonist plants for the current species based on the curated `companion_plants` database. Includes "Plant Together" / "Avoid Near" lists with explanation chips.

**Source file:** `src/components/CompanionPlantsTab.tsx` (~580 lines)

---

## Quick Summary

Looks up the plant's `companion_plants` record by species name (or scientific name) and renders:

- **Plant together** — beneficial companions with reason chips (pest deterrent / nitrogen fixing / pollinator attractor / etc.)
- **Avoid near** — antagonists with reason chips (allelopathic / disease vector / nutrient competition / etc.)
- **What this plant offers others** — reverse lookup
- **Plants in your Shed that pair well** — cross-reference inventory

Used to guide layout decisions and intercropping.

---

## Role 1 — Technical Reference

### Component graph

```
CompanionPlantsTab
├── Loading state
├── No-record state ("No companion data for this species")
├── Plant together list
│   └── Companion card (species, reason chips, in-shed badge)
├── Avoid near list
│   └── Antagonist card
├── What this plant offers others
└── In-Shed cross-reference grid
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `instance` | `any` | parent | The inventory item |
| `homeId` | `string` | parent | For Shed cross-reference |

### Data flow — read paths

```ts
// Companion record
supabase.from("companion_plants")
  .select("*")
  .or(`scientific_name.eq.${sci},common_name.eq.${common}`)
  .maybeSingle();

// Cross-reference Shed for matches
supabase.from("inventory_items")
  .select("id, plant_name, plants(scientific_name)")
  .eq("home_id", homeId);
```

### Constants (companion data)

Living in `src/constants/companionPlants.ts` (used for `getCompanionRelationForGroups()`). Database table `companion_plants` is the canonical source.

### Data flow — write paths

Read-only.

### Edge functions invoked

None.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| Companion DB refresh (planned) | Updates from curated source |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| No record | "No companion data for this species" |
| DB error | Retry banner |

### Performance

- Single query + Shed cross-reference.
- Cards lazy-render.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

Companion planting is one of the oldest gardening tactics — pairing plants that benefit each other (tomatoes + basil, beans + corn + squash), avoiding pairs that fight (onions + beans, fennel + everything).

This tab tells you the consensus advice for your plant and cross-references your Shed so you know what you could pair it with.

### Every flow on this tab

#### 1. Read companions

- Plant together list with reason chips.

#### 2. Read antagonists

- Avoid near list with reason chips.

#### 3. Cross-reference Shed

- See which of your existing plants would pair well.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Treating companion data as gospel.** It's traditional advice + some science; results vary.
- **Antagonist near companion.** If the data shows X pairs with this and Y avoids this, and X and Y are also antagonists, you'll have to compromise.

### Recommended workflows

- **Pre-planting:** open companion tab for each plant in your plan; sketch a layout that respects most pairings.
- **Mid-season:** if pests appear, check companions for known pest deterrents.

### What to do if something looks wrong

- **Empty tab:** species not in the companion DB. File a request via Contact Support.

---

## Related reference files

- [Instance Edit Modal](./08-instance-edit-modal.md)
- [Garden Layout Editor](../03-garden-hub/06-garden-layout-editor.md) — companion overlay

## Code references for ongoing maintenance

- `src/components/CompanionPlantsTab.tsx`
- `src/constants/companionPlants.ts` — group relations
- `supabase/migrations/*_companion_plants.sql`
