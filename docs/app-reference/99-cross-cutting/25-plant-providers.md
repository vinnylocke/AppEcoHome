# Plant Providers — Perenual, Verdantly, AI

> Plant species records come from three sources: **Perenual** (commercial plant DB, Botanist+ tier), **Verdantly** (curated DB, all tiers), and **AI** (Rhozly's PlantDoctorService, Sage+ tier). The unified `plantProvider.ts` abstracts source selection.

---

## Quick Summary

```
searchAllProviders(query, filters, { isPremium, isAiEnabled, homeId })
├── Perenual (if isPremium) → 3 results
├── Verdantly (always)     → 3 results
└── AI (if isAiEnabled)    → 3 results

getProviderPlantDetails({ source, perenual_id?, verdantly_id? })
├── source: "api"        → Perenual full record
├── source: "verdantly"  → Verdantly full record
├── source: "ai"         → PlantDoctorService.generateCareGuide (lazy)
└── source: "manual"     → return stored data
```

---

## Role 1 — Technical Reference

### `plants.source` values

- `manual` — user-created (ManualPlantCreation)
- `api` — Perenual
- `verdantly` — Verdantly DB
- `ai` — Rhozly AI

DB constraint `plants_source_check` enforces the set.

### Edge functions

| Function | Purpose |
|----------|---------|
| `perenual-proxy` | Hides API key, signs requests |
| `verdantly-search` | Verdantly DB |
| `search-plants-ai` | AI text search |
| `companion-planting` | AI companion lookup |

### `PerenualService` (browser)

```ts
PerenualService.searchPlants(name)       // list
PerenualService.getDetails(perenual_id)  // full record
```

Routes through `perenual-proxy` so the API key stays server-side.

### `VerdantlyService` (browser)

```ts
VerdantlyService.searchPlants(name)
VerdantlyService.getDetails(verdantly_id)
```

Calls `verdantly-search` edge function under the hood.

### `PlantDoctorService` (browser)

```ts
PlantDoctorService.searchPlantsText(name, { homeId })
PlantDoctorService.generateCareGuide(name, homeId)
PlantDoctorService.analyzeImage({ image, action, ... })
PlantDoctorService.fetchDiseaseDetails({ diseaseName, ... })
PlantDoctorService.fetchPestDetails({ pestName, ... })
```

All AI calls. Gate on `ai_enabled`.

### `getProviderPlantDetails(plant)` (unified)

The canonical "give me full care data" function. Picks the right service based on `source`. Used by PlantEditModal, PlantSourcePicker, BulkSearchModal, etc.

### `PlantDetails` shape

```ts
{
  source, common_name, scientific_name,
  sunlight[], watering, cycle, hardiness,
  description, care, propagation, growthRate,
  default_image, images[],
  // ...
}
```

### `careGuideToPlantDetails(aiData, name)`

Normalises an AI care-guide response into `PlantDetails`.

### Caching

`plants.data` jsonb stores the last fetched provider payload. Subsequent reads skip the network when possible.

### Provider preference order

When multiple providers return results, ranking depends on context:
- Sage+ user: AI > Perenual > Verdantly (AI tuned to user's prefs).
- Botanist user: Perenual > Verdantly.
- Sprout user: Verdantly only.

---

## Role 2 — Expert Gardener's Guide

### Why three providers

Each has strengths:
- **Verdantly** — curated subset, opinionated, free for everyone.
- **Perenual** — broad commercial DB with many cultivars (paid tier).
- **AI** — synthesised data when the others miss, tuned to your preferences.

### Implications

- For mainstream plants, all three return similar results — pick the one you trust.
- For obscure cultivars, AI fills gaps but verify with manual research.
- Manual is always available as last resort.

---

## Related reference files

- [Data Model — Plants](./03-data-model-plants.md)
- [Image Sources](./24-image-sources.md)
- [Bulk Search Modal](../08-modals-and-overlays/04-bulk-search-modal.md)
- [Plant Source Picker](../08-modals-and-overlays/03-plant-source-picker.md)

## Code references for ongoing maintenance

- `src/lib/plantProvider.ts` — unified API
- `src/lib/perenualService.ts`
- `src/lib/verdantlyService.ts`
- `src/services/plantDoctorService.ts`
- `supabase/functions/perenual-proxy/index.ts`
- `supabase/functions/verdantly-search/index.ts`
- `supabase/functions/search-plants-ai/index.ts`
