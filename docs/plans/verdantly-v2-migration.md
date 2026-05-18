# Plan — Verdantly API v1 → v2 migration

## What's changing in the API

### URLs
- `/v1/plants/varieties/search` → `/v2/plants/varieties/search`
- `/v1/plants/varieties/{id}` → `/v2/plants/varieties/{id}`
- `/v1/plants/species/filter` → **gone** — v2 merged filter params directly into the search endpoint

### Response shape changes

#### Search results (per item)
| V1 path | V2 path |
|---|---|
| `v.species?.scientificName` | `v.scientificName` |
| `v.category` | `v.category` (unchanged) |
| `v.growingRequirements.sunlightRequirement` | `v.sunlight` |
| `v.growingRequirements.waterRequirement` | `v.water` |
| `v.growingRequirements.minGrowingZone` | `v.hardinessZoneMin` |
| `v.growingRequirements.maxGrowingZone` | `v.hardinessZoneMax` |
| `v.lifecycleMilestones.daysToHarvestMin/Max` | `v.daysToHarvestMin/Max` |
| `v.growthDetails.growthType` | `v.growthHabit` |
| `v.ecology.isEdible` | `v.isEdible` |

#### Details response
- Now wrapped: `response.data` (not `response` directly) — must extract `raw.data` before mapping
- `v.species.taxonomy.family` → `v.taxonomy.family`
- `v.category` → `v.classification.category`
- `v.growingRequirements.*` → `v.growing.*` (e.g. `v.growing.water`, `v.growing.sunlight`, `v.growing.soilPhMin`, `v.growing.spacing`, `v.growing.frostTolerance`, `v.growing.soil`)
- `v.growing.hardinessZone.min/max` (was `v.growingRequirements.minGrowingZone/maxGrowingZone`)
- `v.growthDetails.growthType` → `v.growing.growthHabit`
- `v.growthDetails.growthPeriod` → `v.lifecycle.duration`
- `v.lifecycleMilestones.*` → `v.lifecycle.*`
- `v.careInstructions.plantingInstructions` → `v.care.planting` (same sub-fields: `startIndoors`, `transplantOutdoors`, `directSow`)
- `v.careInstructions.pruningInstructions` → `v.care.pruning`
- `v.careInstructions.harvestingInstructions` → `v.care.harvesting`
- `v.ecology.isEdible/droughtTolerant/isInvasive/attracts/attractsPollinators` → `v.distribution.ecology.*`
- `v.ecology.soilPhMin/Max` → `v.growing.soilPhMin/Max`
- `v.safety.toxicity.*` — same structure, unchanged

#### Value casing changes (affects lookup tables)
- Water: `"Low/Moderate/High"` → `"low/moderate/high"` (lowercase)
- Sunlight: `"Full sun/Partial shade/Full shade"` → `"full sun/partial shade/full shade"` (lowercase)

#### Filter params
- `edible` → `isEdible`
- `duration` (Annual/Perennial) has no direct v2 equivalent — drop it
- All other filter params unchanged (`waterRequirement`, `sunlightRequirement`, `growingZone`)

---

## Files changed

### 1. `supabase/functions/verdantly-search/index.ts` (main work)
- Update `BASE_URL` to stay the same (host is fine), change all `/v1/` → `/v2/` in fetch calls
- `WATERING_DAYS`: update keys to lowercase (`"low"`, `"moderate"`, `"high"`)
- `SUNLIGHT_MAP`: update keys to lowercase (`"full sun"`, `"partial shade"`, etc.)
- `mapToSearchResult`: `v.species?.scientificName` → `v.scientificName`
- `mapToPlantDetails`: rewrite all field paths per table above
- `buildMetadata`: update field paths (`v.lifecycle.*`, `v.growing.*`, `v.care.planting`, `v.distribution.ecology.*`)
- `buildDescription`: unchanged (`v.highlights`, `v.description`, `v.commonUses` all still top-level)
- `buildMaintenance`: `v.careInstructions.pruningInstructions` → `v.care.pruning`, `harvestingInstructions` → `v.care.harvesting`
- `buildPlantingInstructions`: `pi.startIndoors/transplantOutdoors/directSow` unchanged (same sub-fields)
- `buildAttracts`: `v.ecology.*` → `v.distribution.ecology.*`
- Details handler: `mapToPlantDetails(raw)` → `mapToPlantDetails(raw.data)` + cache stores `raw.data`
- Filter action: change URL to `/v2/plants/varieties/search`, use `mapToSearchResult` instead of `mapSpeciesFilterResult`, rename `edible` param to `isEdible`, remove `duration` mapping
- Delete `mapSpeciesFilterResult` (no longer needed — filter and search now share the same response format)

### 2. `src/lib/verdantlyUtils.ts`
- Update `VERDANTLY_WATERING_DAYS` keys to lowercase (documentation consistency)
- Update `VERDANTLY_SUNLIGHT_MAP` keys to lowercase

### 3. `supabase/migrations/20260518200000_clear_verdantly_cache.sql` (new)
```sql
TRUNCATE public.verdantly_cache;
```
Clears all cached v1 raw_data — the new mapper can't read the old schema, so stale cache would return broken results.

### 4. Supabase secret (manual — no code)
Update `VERDANTLY_API_KEY` in Supabase Dashboard → Project Settings → Edge Functions → Secrets.
New key goes here. No code change needed — edge function reads it from `Deno.env.get("VERDANTLY_API_KEY")`.

---

## No changes needed
- `src/lib/verdantlyService.ts` — only calls the edge function, interface unchanged
- All UI components — consume the normalised `PlantDetails` shape, which doesn't change
- `src/lib/verdantlyUtils.ts` types — `PlantDetails` and `ProviderSearchResult` interfaces unchanged
- `verdantly_cache` table schema — still stores `raw_data jsonb`, just with v2 objects going forward

---

## Risk
Low. The edge function is the only Verdantly-aware code. All callers get the same normalised `PlantDetails` back regardless of v1/v2. The cache clear means the first request per plant hits the live API; subsequent ones are cached as normal (30-day TTL).
