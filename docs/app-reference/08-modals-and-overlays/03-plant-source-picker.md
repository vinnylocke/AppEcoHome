# Add Plant — Source Picker (PlantSourcePicker)

> The provider chooser for a list of plant names. For each requested plant, queries Perenual, Verdantly, and AI (Rhozly) in parallel and lets the user pick which provider's record to use. Powers Plan Staging Phase 2, BulkSearchModal, and other multi-plant flows.

**Source file:** `src/components/PlantSourcePicker.tsx`

---

## Quick Summary

Given an array of plant names, the modal shows one row per plant. Each row has three tabs (Perenual / Verdantly / AI), each tab showing up to 3 candidate results. User taps a candidate to select it. After all plants have a selection, `onConfirm` returns the array. Optional plant-info expansion fetches full care details on demand.

---

## Role 1 — Technical Reference

### Component graph

```
PlantSourcePicker (Portal, focus-trapped)
└── For each plant
    ├── Plant name header
    ├── Tab bar (Perenual / Verdantly / AI)
    ├── Results grid (max 3 per source)
    │   └── Candidate card
    │       ├── Thumbnail
    │       ├── Name + scientific name
    │       └── Info chevron → PlantInfoPanel
    └── Selection state indicator
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plants` | `string[]` | parent | Names to query |
| `isPremium` | `boolean` | parent | Perenual gate |
| `isAiEnabled` | `boolean` | parent | AI gate |
| `homeId` | `string?` | parent | For AI context |
| `onConfirm` | `(items) => void` | parent | Lift selection |
| `onClose` | `() => void` | parent | Hide |

### `Selection` shape

```ts
{ type: "api" | "ai" | "verdantly", data: any }
```

### Data flow — read paths

For each plant name, parallel queries:

```ts
PlantDoctorService.searchPlantsText(name, { homeId })    // AI
PerenualService.searchPlants(name)                        // Perenual
VerdantlyService.searchPlants(name)                       // Verdantly
```

Results limited to 3 per source.

### On-demand details

When user expands a card, `getProviderPlantDetails({ source, perenual_id?, verdantly_id? })` fetches full care record. Cached in a Map keyed by candidate id.

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `plant-doctor-text-search` (or similar) | AI search by name |
| `verdantly-search` | Verdantly database |

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

- Perenual tab visible if `isPremium`.
- AI tab visible if `isAiEnabled`.
- Verdantly always shown.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| Provider fails | Tab shows error state with retry |
| All providers fail | Empty state per plant |

### Performance

- Parallel queries per plant.
- Details cached per candidate.
- Lazy expand.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this picker

When the AI gives you a plant list ("for your veg patch you'll want tomato, lettuce, basil…"), this is how Rhozly translates names into concrete records. Each provider offers different metadata:
- **Perenual** — broadest, most cultivars.
- **Verdantly** — opinionated, curated.
- **AI (Rhozly)** — synthesised when the others miss.

### Every flow on this picker

#### 1. Per plant, scan tabs

- Default tab order: AI / Perenual / Verdantly.
- Each tab shows up to 3 candidates.

#### 2. Pick one

- Tap a card → selection chip appears.
- Tap a different card → switches.

#### 3. Expand info

- Chevron on a card → PlantInfoPanel shows care guide (lazy-fetched).

#### 4. Confirm

- Once all plants have a selection, hit Confirm. Returns to parent.

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Verdantly only. |
| Botanist+ | + Perenual. |
| Sage/Evergreen | + AI. |

### Common mistakes / pitfalls

- **Picking the first result blindly.** Sometimes the second/third match better — read scientific names.
- **Ignoring tier-locked tabs.** If Perenual tab is greyed, the data exists but you can't use it; consider upgrading.

### Recommended workflows

- **Plan staging:** let the AI suggest names; pick best provider per plant; confirm.

### What to do if something looks wrong

- **All tabs empty:** the plant name may be misspelt. Tweak in the parent flow.
- **Selection didn't persist:** ensure all plants have a selection before tapping Confirm.

---

## Related reference files

- [Bulk Search Modal](./04-bulk-search-modal.md)
- [Plant Search Modal](./05-plant-search-modal.md)
- [Plan Staging](../04-planner/02-plan-staging.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/PlantSourcePicker.tsx`
- `src/components/PlantInfoPanel.tsx`
- `src/lib/plantProvider.ts` — unified `getProviderPlantDetails`
- `src/services/plantDoctorService.ts`
- `src/lib/perenualService.ts`
- `src/lib/verdantlyService.ts`
