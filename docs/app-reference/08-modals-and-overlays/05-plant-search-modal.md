# Plant Search Modal

> Single-plant search variant of BulkSearch. Common-name vs scientific-name toggle, preference-aware ranking, optional Manual escape hatch. Used for one-off plant additions (rather than bulk cart-style).

**Source file:** `src/components/PlantSearchModal.tsx`

---

## Quick Summary

Search across providers for a single plant; pick one; commit. Results ranked by `scorePlantByPreferences(common, scientific, preferences)` so plants matching the user's quiz/swipe preferences surface higher. Multi-image gallery shows reference photos before commit.

---

## Role 1 — Technical Reference

### Component graph

```
PlantSearchModal (Portal)
├── Header (close, title, mode toggle Common/Scientific)
├── Search input
├── Results list (ranked)
│   └── Card per result (thumbnail, name, provider chip)
├── Selected-result detail panel
│   ├── MultiImageGallery
│   └── Add to Shed button
└── "Create manually" → ManualPlantCreation
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | parent | Scope |
| `isPremium` | `boolean` | parent | Perenual gate |
| `isAiEnabled` | `boolean?` | parent | AI gate |
| `onClose` | `() => void` | parent | Hide |
| `onSuccess` | `(plant?) => void` | parent | Lift result |
| `initialSearchTerm` | `string?` | parent | Pre-fill |
| `initialScientificName` | `string?` | parent | Pre-fill scientific |

### Data flow — read paths

```ts
searchAllProviders(query, {}, { homeId, isPremium, isAiEnabled });
```

### Ranking

```ts
scorePlantByPreferences(commonName, scientificName, preferences)
// Higher = better match for user's quiz + swipe preferences
```

### Data flow — write paths

- On commit, parent typically inserts into `plants` + `inventory_items`.

#### `handleAddToShed` — three-way branch (Wave 7 D2)

`handleAddToShed` decides the insert payload based on the previewed plant's source:

- **Verdantly** (`previewPlant.source === "verdantly"`): duplicate check on `(home_id, verdantly_id)`. Skeleton includes Verdantly-specific fields (`growth_habit`, `days_to_harvest_*`, `soil_ph_*`, `planting_instructions`).
- **AI** (`previewPlant.source === "ai" || _provider === "ai"`) — Wave 7 D2 fix: duplicate check on `(home_id, ilike(common_name))` because AI plants don't have a stable provider ID. Skeleton uses `source: "ai"`, no `perenual_id`, copies the AI top-level care fields, and (when `db_plant_id` was forwarded from the catalogue) sets `forked_from_plant_id = db_plant_id` + `overridden_fields = []` to register the row as a shallow fork — same shape Wave 3's bulk-add produces.
- **Perenual** (else): duplicate check on `(home_id, perenual_id)`. Skeleton uses `source: "api"` + `perenual_id`.

Prior to Wave 7, the AI branch fell through to the Perenual code with `perenual_id = undefined`, producing malformed rows. Wave 7 D2 closed that gap.

### Edge functions invoked

- Same as BulkSearchModal.

### Tier gating / Permissions

- Provider availability per tier.
- `inventory.write` for the commit.

### Error states

| State | Result |
|-------|--------|
| No results | "No matches — try scientific name or create manually" |

### Performance

- Debounced search.
- Result detail panel lazy-fetches via `getProviderPlantDetails`.

### AI catalogue enrichment (Wave 2 of AI Plant Overhaul)

When the AI tab queries `PlantDoctorService.searchPlantsText`, the response includes a sparse `hits` map alongside `matches`. Wave 3 wires the UI to show "In catalogue" / "Your custom version" pills on hit results and skip the `generate_care_guide` call on selection. See [Bulk Search Modal](./04-bulk-search-modal.md) for the response shape and [AI Plant Catalogue](../99-cross-cutting/33-ai-plant-catalogue.md) for the full lifecycle.

---

## Role 2 — Expert Gardener's Guide

### Why use this

When you just want to add *one* plant — not a batch. Faster path than BulkSearch's cart.

### Every flow

#### 1. Toggle common vs scientific name mode

- Common is more forgiving; scientific is more precise.

#### 2. Search → pick

- Tap a card → detail panel below.

#### 3. Multi-image gallery

- Browse reference photos before committing.

#### 4. Add to Shed

- Inserts the plant + creates an inventory item.

### Tier-by-tier experience

Same as BulkSearchModal.

### Common mistakes / pitfalls

- **Searching in common-name mode for an obscure cultivar.** Switch to scientific.
- **Ignoring preference ranking.** The top result is often the best for your quiz answers — read it first.

### Recommended workflows

- **Quick add:** use this when you only have one plant in mind.

### What to do if something looks wrong

- **Search returns nothing:** try scientific name or use Manual.

---

## Related reference files

- [Bulk Search Modal](./04-bulk-search-modal.md)
- [Manual Plant Creation](./33-manual-plant-creation.md)
- [Multi Image Gallery](./29-multi-image-gallery.md)

## Code references for ongoing maintenance

- `src/components/PlantSearchModal.tsx`
- `src/lib/plantProvider.ts`
- `src/hooks/useUserPreferences.ts` — `scorePlantByPreferences`
