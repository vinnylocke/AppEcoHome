# Plant Providers — Library, Verdantly, Perenual, AI

> Plant species can be added from five sources: **Manual** (typed in by hand), the **Library** (the ~94k-row seeded `plant_library` catalogue — the **default search source for every tier, including Sprout**), **Verdantly** + **Perenual** (external DBs, both gated by `enable_perenual`), and **AI** (Rhozly's `PlantDoctorService`, gated by `ai_enabled`). A picked **Library** plant is cloned into the **global** `plants` catalogue (`home_id = null`, `source = 'ai'`, deduped by `scientific_name_key`) — there is no separate `'library'` source value, so a library plant is distinguished from a true AI plant by `home_id IS NULL`. The unified `plantProvider.ts` + `searchPreference.ts` abstract source selection and entitlement clamping.

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

- `manual` — user-created (ManualPlantCreation), home-private
- `api` — Perenual
- `verdantly` — Verdantly DB
- `ai` — Rhozly AI **and Library**. A plant picked from the seeded **Library** is cloned into the GLOBAL catalogue (`home_id = null`, `source = 'ai'`, deduped by `scientific_name_key`); a true home-private AI plant has `home_id` set. There is **no** `'library'` source value — `home_id IS NULL` is what marks a library plant.

DB constraint `plants_source_check` enforces the set (`manual` / `api` / `verdantly` / `ai`). Plants have **no** `library` source value — a library plant is a home-private `source='ai'` row whose `forked_from_plant_id` points at the global catalogue (TheShed badges those as **Library**, not AI).

The **ailment** equivalent (`ailments_source_check`, widened by `20260824000000`) allows `manual` / `perenual` / `ai` / **`library`**. Unlike plants, ailments ARE marked with a first-class `library` source: `addLibraryAilmentToWatchlist` / `mapLibraryToWatchlistPayload` store `source='library'`, and the Watchlist renders a **Library** badge (`SOURCE_META.library`). (No historical backfill — old library adds stored as `ai` stay `ai`.)

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

### Search sources by entitlement (`searchPreference.ts`)

`availablePlantSources(ent)` = **Library** (everyone) + (`enablePerenual` → Verdantly, Perenual) + (`aiEnabled` → AI); Manual creation is always available. `clampPlantSource` silently downgrades a stored choice the user is no longer entitled to back to **Library** (so we never offer a source they can't use).

| Tier | `ai_enabled` | `enable_perenual` | Plant sources | Ailment sources |
|------|:---:|:---:|---|---|
| **Sprout** | ✗ | ✗ | Library, Manual | Library, Manual |
| **Botanist** | ✓ | ✗ | Library, AI, Manual | Library, AI, Manual |
| **Sage** | ✗ | ✓ | Library, Verdantly, Perenual, Manual | Library, Perenual, Manual |
| **Evergreen** | ✓ | ✓ | all | all |

Ailment (Watchlist) sources mirror this with **no Verdantly** (`availableAilmentSources`). When several providers return results, ranking favours AI for Sage+ (tuned to the user's prefs), then Perenual, then Verdantly.

### Library search matching — names + normalisation

The `plant_library` catalogue search (both the `search_plant_library_relevance` / `search_plant_library_fuzzy` RPCs used by `PlantSearch.tsx`, and the agent-chat `search_plant_database` tool) matches across **common name + scientific name + `other_names`**, and is **spacing/punctuation-insensitive** — "crab apple", "crabapple" and "crab-apple" are equivalent. Two generated columns back this (migration `20260906000000_plant_library_other_names_search.sql`):

- `search_text` — lowercased `common_name + scientific_name + other_names` (trigram similarity + ILIKE).
- `search_norm` — `search_text` collapsed to lowercase alphanumerics; the RPCs normalise the query the same way (mirrored in `src/lib/plantNames.ts` `normalizePlantName`, so the agent-chat JS query matches the SQL). Ranking: normalised common-name exact → prefix → `search_norm` contains (covers other names) → trigram similarity.

Result rows show all three name fields — common (title), scientific (subtitle) and **"Also known as: …"** for `other_names` (`ResultRow`, `PlantInfoPanel`, `PlantDetailModal`), built via `src/lib/plantNames.ts` `formatOtherNames` (dedupes vs common/scientific).

---

## Role 2 — Expert Gardener's Guide

### Why three providers

Each has strengths:
- **Verdantly** — curated subset, opinionated; Botanist+ (gated like Perenual via `enable_perenual`).
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
