# Add Plant — Bulk Search Modal

> The unified multi-provider plant search + cart modal. Search across Perenual, Verdantly, and AI in one query, filter by lifecycle / sun / watering, build a cart of plants, then proceed to bulk-add into the Shed.

**Source file:** `src/components/BulkSearchModal.tsx` (~1,000+ lines)

---

## Quick Summary

A search field over three providers + filter drawer (cycle, watering, sunlight, edible/poisonous, indoor, hardiness range). Results render in a unified grid with provider chips. Tap a card to add to the cart. Hit "Add N to Shed" to proceed to the next step (PlantSourcePicker or direct insert).

Includes a "Create manually" escape hatch for plants none of the providers know about.

---

## Role 1 — Technical Reference

### Component graph

```
BulkSearchModal (Portal)
├── Header (close, title)
├── Search bar + filter button (drawer pill)
├── Filter drawer (collapsible)
│   ├── Cycle (perennial / annual / biennial / biannual)
│   ├── Watering (frequent / average / minimum / none)
│   ├── Sunlight (full / part / shade)
│   ├── Edible / Poisonous / Indoor toggles
│   └── Hardiness range slider
├── Tab bar (All / Perenual / Verdantly / AI)
├── Results grid
│   └── Card per plant (thumbnail, name, provider chip, info chevron)
├── Cart (sticky bottom)
└── "Create manually" → ManualPlantCreation
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | For AI scoping |
| `isPremium` | `boolean` | parent | Perenual gate |
| `isAiEnabled` | `boolean` | parent | AI gate |
| `initialSearchTerm` | `string?` | parent | Pre-fill |
| `initialCartItems` | `array?` | parent | Restore cart |
| `onClose` | `() => void` | parent | Hide |
| `onProceedToBulkAdd` | `(plants) => void` | parent | Submit |
| `onManualSave` | `(data) => void?` | parent | Manual escape hatch |

### Filter shape

```ts
{
  cycle?: string[],
  watering?: string[],
  sunlight?: string[],
  edible?: 0 | 1,
  poisonous?: 0 | 1,
  indoor?: 0 | 1,
  hardinessMin?, hardinessMax?,
}
```

### Data flow — read paths

- `searchAllProviders(query, filters, { homeId, isPremium, isAiEnabled })` — fans out to all enabled providers.
- Lazy details via `getProviderPlantDetails`.

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `verdantly-search` | Verdantly DB |
| `plant-doctor-text-search` | AI |

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

- Filter drawer fully available to every tier.
- Tabs gate by provider availability.

### Beta gating

None.

### Permissions

- `inventory.write` — required for the subsequent bulk-add step.

### AI catalogue enrichment (Wave 2 of AI Plant Overhaul)

When the AI tab queries `PlantDoctorService.searchPlantsText`, the response now includes a sparse `hits` map alongside the existing `matches: string[]`:

```ts
{
  matches: ["Tomato (Solanum lycopersicum)", "Cherry Tomato (...)", ...],
  hasMore: false,
  hits: {
    "Tomato (Solanum lycopersicum)": {
      hit_kind: "global" | "home_fork",
      plant_id: 123,
      care_guide_data: {...},
      freshness_version: 2,
      last_care_generated_at: "2026-05-...",
      overridden_fields: null
    }
    // ... sparse; only matches present in the catalogue
  }
}
```

Wave 3 of AI Plant Overhaul (the client UI) will render an "In catalogue" / "Your custom version" pill on each match that has a `hits` entry, and short-circuit the `generate_care_guide` call when the user picks one (using `db_plant_id` directly).

The response is backward-compatible: clients that ignore `hits` continue to work exactly as before. See [AI Plant Catalogue](../99-cross-cutting/33-ai-plant-catalogue.md) (planned, Wave 9) for the full lifecycle.

### Error states

| State | Result |
|-------|--------|
| All providers fail | "No results — try a different search" |
| One provider fails | Tab shows error state; others still work |

### Performance

- Debounced search input.
- Parallel provider calls.
- Cart state local; not persisted.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this modal

The canonical way to add plants to your Shed in batches. One search, all providers, side-by-side comparison.

### Every flow on this modal

#### 1. Search

- Type a name; results stream in across all providers.

#### 2. Filter (optional)

- Open drawer → toggle cycle / sun / watering / edible chips.
- Narrows results for "I want full sun edibles".

#### 3. Add to cart

- Tap a card → adds to cart.
- Switch providers to compare; cart persists.

#### 4. Manual creation

- "Create manually" → opens ManualPlantCreation for fully custom records.

#### 5. Proceed

- "Add N to Shed" → next step (assignment or direct insert).

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Verdantly only. |
| Botanist+ | + Perenual filters. |
| Sage/Evergreen | + AI tab. |

### Common mistakes / pitfalls

- **Loose filter combinations.** "Full sun + part shade + full shade" returns nothing. Pick one.
- **Cart blown away by closing.** Use "Add N" to commit before closing.

### Recommended workflows

- **Spring stock-up:** filter "annual edibles" → cart 10 plants → bulk add.

### What to do if something looks wrong

- **No results:** check filters; try a broader search.
- **Provider tab errors:** retry; provider may be temporarily down.

---

## Related reference files

- [Plant Source Picker](./03-plant-source-picker.md)
- [Plant Search Modal](./05-plant-search-modal.md)
- [Manual Plant Creation](./33-manual-plant-creation.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/BulkSearchModal.tsx`
- `src/lib/plantProvider.ts` — `searchAllProviders`
- `src/components/ManualPlantCreation.tsx`
- `src/components/PlantInfoPanel.tsx`
