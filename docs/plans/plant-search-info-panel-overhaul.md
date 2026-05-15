# Plan — Plant Search Info Panel Overhaul

## Goal

Replace the current Wikipedia-excerpt accordion in all three plant search contexts with a rich care panel showing structured pills (light, watering, edible, toxic, wildlife) and an API/AI-generated description. For AI results, pre-fetch the full care guide on info-click and cache it so clicking "Add to shed" never regenerates it.

---

## Where Info Panels Currently Live

| Component | File | Trigger | Currently Shows |
|-----------|------|---------|----------------|
| `BulkSearchModal` | `src/components/BulkSearchModal.tsx` | Info icon → `handleExpandResult()` | Wikipedia image + excerpt |
| `PlantSourcePicker` | `src/components/PlantSourcePicker.tsx` | Info icon → `toggleExpand()` | Wikipedia image + excerpt |
| `AddItemSheet` | `src/components/shopping/AddItemSheet.tsx` | Info icon → `toggleItemExpand()` | Wikipedia image + excerpt |

All three share the same pattern and will receive the same replacement. Wikipedia is dropped entirely from the info panel — the API/AI description replaces it.

---

## New Info Panel Design

### Pills row

| Pill | Condition | Icon | Label logic |
|------|-----------|------|------------|
| Light | Always shown | `Sun` | Map `sunlight[]` → "Full Sun", "Partial Shade", "Full Shade", "Indirect Light" (first value wins; if multiple, join with " / ") |
| Watering | Always shown | `Droplets` | Map `watering_min_days` / `watering_max_days` → human label (see mapping below), or fall back to `watering` string |
| Edible | Only if `is_edible === true` | `Leaf` | "Edible" (green) |
| Toxic | Only if `is_toxic_pets || is_toxic_humans` | `TriangleAlert` | "Toxic to pets" / "Toxic to humans" / "Toxic to both" (red/orange) |
| Wildlife | Only if `attracts.length > 0` | `Bird` | "Attracts " + joined list (e.g. "Bees & Butterflies") — truncate at 2 items + "& more" if >2 |

**Watering label mapping (from days):**
- 1–2 days → "Frequent watering"
- 3–7 days → "Moderate watering"
- 8–14 days → "Low water"
- 15+ days → "Very low water"
- Fallback (`watering` string): "Frequent" → "Frequent watering", "Average" → "Moderate watering", "Minimum" → "Low water", "None" → "Very low water"

**Sunlight label mapping:**
- `"full_sun"` → "Full Sun"
- `"part_shade"` → "Partial Shade"
- `"full_shade"` → "Full Shade"
- `"indirect_light"` → "Indirect Light"
- Unknown → title-case the raw string

### Description
Below the pills, render the `description` field from the details fetch. For AI results this is the AI-generated overview. For Perenual/Verdantly it is the API description. Truncate to ~300 chars with a "Read more" expand toggle.

### Loading state
While fetching: show 3 skeleton pill-shaped loaders + 2 lines of skeleton text. This replaces the previous Wikipedia spinner.

---

## Data Fetch Strategy Per Source

### Perenual / Verdantly results
Call `getProviderPlantDetails()` from `src/lib/plantProvider.ts` — already exists and returns `PlantDetails`.

```typescript
const details = await getProviderPlantDetails({
  source: result._provider === "perenual" ? "api" : "verdantly",
  perenual_id: result._provider === "perenual" ? result.id : undefined,
  verdantly_id: result._provider === "verdantly" ? result.id : undefined,
});
```

Cache key: `"perenual:{id}"` or `"verdantly:{id}"`.

### AI results
Call the `plant-doctor` edge function with `action: "generate_care_guide"`. This returns a full structured care object with all fields needed for pills. The return shape must be adapted to `PlantDetails` (see adapter below).

```typescript
const { data } = await supabase.functions.invoke("plant-doctor", {
  body: { action: "generate_care_guide", targetPlant: aiName, homeId },
  headers: { Authorization: `Bearer ${session?.access_token}` },
});
// data.plantData is the care guide
```

Cache key: `"ai:{aiName}"`.

**`homeId` availability:** `BulkSearchModal` and `AddItemSheet` already have `homeId` as a prop. `PlantSourcePicker` does not currently receive `homeId` — it will need it added as a prop and passed through from `BulkSearchModal` (which already has it and renders `PlantSourcePicker`).

### AI care guide → PlantDetails adapter

Write `careGuideToPlantDetails(guide: any, name: string): PlantDetails` in `src/lib/plantProvider.ts` (or a new `src/lib/careGuideAdapter.ts`). Maps:

| Care guide field | PlantDetails field |
|------------------|--------------------|
| `common_name` | `common_name` |
| `scientific_name` (string → wrap in array) | `scientific_name` |
| `description` | `description` |
| `sunlight` (array) | `sunlight` |
| `watering_min_days` | `watering_min_days` |
| `watering_max_days` | `watering_max_days` |
| `is_edible` | `is_edible` |
| `is_toxic_pets` | `is_toxic_pets` |
| `is_toxic_humans` | `is_toxic_humans` |
| `attracts` (array) | `attracts` |
| `care_level` | `care_level` |
| `cycle` | `cycle` |
| `maintenance` | `maintenance` |
| `growth_rate` | `growth_rate` |
| `flowering_season` | `flowering_season` |
| `harvest_season` | `harvest_season` |
| `pruning_month` | `pruning_month` |
| `propagation` | `propagation` |
| `drought_tolerant` | `drought_tolerant` |
| `tropical` | `tropical` |
| `indoor` | `indoor` |
| `cuisine` | `cuisine` |
| `medicinal` | `medicinal` |
| `plant_type` | `plant_type` |
| (no source id) | `source: "ai"` |

---

## Cache & Thread-Through Architecture

Each search component holds a details cache in state:

```typescript
const [detailsCache, setDetailsCache] = useState<Map<string, PlantDetails>>(new Map());
```

**On info icon click:**
1. Check cache → if hit, render immediately
2. If miss → fetch (Perenual/Verdantly via `getProviderPlantDetails`, AI via `plant-doctor`) → store in cache → render

**On "Add to shed" / "Select" click:**
- Look up the plant's key in `detailsCache`
- If found → pass `preloadedDetails` to the add/select handler → skip regeneration in the add flow
- If not found → proceed with existing flow (care guide generated as normal)

**Thread-through in the add flow:**
- `BulkSearchModal`: `onSelectConfirm` callback passes selected plants; extend to also pass a `Map<string, PlantDetails>` of pre-fetched details keyed by plant identifier
- `PlantSourcePicker`: same — extend `onSelect` callback to include preloaded details
- `AddItemSheet`: already calls `handleOpenDbPreview()` before adding; the cached details are already available in component scope

**Preventing duplicate AI generation:**
Currently when an AI plant is added to the shed, the parent component calls `generate_care_guide`. The cache thread-through means: if the user clicked the info icon before adding, the full guide is already in `detailsCache` and gets passed upward — the parent detects `preloadedDetails` is set and skips the edge function call.

---

## New Shared Component

### `src/components/PlantInfoPanel.tsx`

```typescript
interface Props {
  details: PlantDetails | null;
  loading: boolean;
}
```

Renders:
1. Pill row (conditionally rendered per pill logic above)
2. Description text with expand toggle
3. Skeleton state when `loading && !details`
4. "No information available" when `!loading && !details`

Used by all three search components in place of their current Wikipedia accordion content.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/PlantInfoPanel.tsx` | **New** — shared care pills + description panel |
| `src/lib/plantProvider.ts` or `src/lib/careGuideAdapter.ts` | **New helper** — `careGuideToPlantDetails()` adapter |
| `src/components/BulkSearchModal.tsx` | Replace Wikipedia accordion with `PlantInfoPanel`; add `detailsCache`; thread-through to add flow |
| `src/components/PlantSourcePicker.tsx` | Same + add `homeId` prop |
| `src/components/shopping/AddItemSheet.tsx` | Replace Wikipedia accordion with `PlantInfoPanel`; add `detailsCache` |

---

## Order of Operations in the AI Flow (What Changes)

**Before:**
1. User sees AI result → clicks info → Wikipedia shown
2. User clicks add → `generate_care_guide` called → care guide returned → plant added with full data

**After:**
1. User sees AI result → clicks info → `generate_care_guide` called → **care pills + description shown immediately**
2. User clicks add → preloaded care data passed directly → **no second API call**

If user clicks add _without_ having clicked info first → existing flow unchanged (care guide generated at add time).

---

## What Is NOT Changing

- Search results themselves (the card layout, image, name, select checkbox)
- How Perenual/Verdantly details are fetched — `getProviderPlantDetails()` already exists and works
- The `plant-doctor` `generate_care_guide` action — no changes to the edge function
- Plant add / save flows beyond receiving optional `preloadedDetails`
- `AddItemSheet` preview panel (which already shows minimal chips post-selection) — though the chips there can optionally be enriched using the same cached data

---

## Risks / Notes

- `PlantSourcePicker` will need `homeId` added as a prop — trace through to ensure all callers pass it
- `generate_care_guide` is rate-limited; the info fetch counts as an AI call. This is acceptable because the user explicitly requested it and it saves a second call at add-time
- If `generate_care_guide` is slow, the loading skeleton keeps the UX clean
- Perenual details are already cached in `species_cache` (30-day TTL) so repeated info-clicks for the same Perenual plant are instant
- Verdantly details are cached in `verdantly_cache` (30-day TTL) — same benefit
- AI care guides are NOT currently cached — they are generated fresh each time. The `detailsCache` in component state provides session-level caching (cleared on unmount). A future improvement could cache AI guides in `ai_response_cache` but that is out of scope here
