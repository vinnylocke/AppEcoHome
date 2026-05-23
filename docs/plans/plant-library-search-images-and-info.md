# Plan — thumbnails + info-icon preview for plant library search

## Root causes

1. **No thumbnails on most rows.** Rows seeded between 12.0035 and 12.0036 (when we fixed `plant-image-search` to soft-fail Unsplash) have `thumbnail_url IS NULL` because every image fetch was throwing. New rows from 12.0036 onwards get thumbnails — but the bulk of existing rows do not.
2. **No info button.** We dropped it when we consolidated on "row click → care guide modal". The brief said both should exist: info icon → chip-strip preview, row click → full care guide.
3. **No image in care guide modal.** Same data issue as #1 — the hero header only renders `<img>` when the row has a URL.
4. **Seasons + propagation empty on the care guide.** The variety-aware seed prompt says *"Care info for a cultivar should ... inherit from the species"* which AI is interpreting as "leave these fields empty for variety rows". Result: lots of rows with empty `flowering_season`, `harvest_season`, `propagation`, `pruning_month`. The DB columns are `'[]'::jsonb DEFAULT` so they're not null — just empty arrays — and MultiSelect renders "Select…" for empty.

## Fix

### A. Lazy thumbnail fetch for rows with `thumbnail_url IS NULL`

Mirror the `prefetchAiThumbnails` pattern from `LibrarySearchTab`:

- When the search tab renders a result list, for every row missing a thumbnail, fire `plant-image-search` (which is cached server-side via `plant_image_cache`).
- Cache hit → ~50ms. Cache miss → first time only, then warm forever.
- Store the result in a local `Map<rowId, string>` keyed by row id.
- Pass that map to both the row renderer AND the care guide modal so they show the fetched URL until the page reloads.

No DB writes — the per-render lookup is cheap because the image cache makes the second call free. If we want persistence later we can add a bulk backfill function, but the lazy approach gives instant visual results today.

### B. New `PlantLibraryQuickPreviewModal`

Smaller portal modal triggered by the info icon. Shows ONLY:

- Larger image (square, w-48 or so).
- Common name + scientific name.
- Description paragraph.
- A clean chip strip with the per-trait pills the user listed: cycle, watering, sunlight (multiple), care level, hardiness, edible / toxic flags, drought-tolerant, indoor, invasive, drought / salt tolerance, days-to-harvest range. Empty / false flags omitted.
- A "View full care guide →" button at the bottom that closes the quick preview and opens `PlantLibraryCareGuideModal`.

The existing care guide modal stays for power viewers; quick preview is the lighter "at a glance" path.

### C. Search row update

- Each row gets an `<Info>` button on the right edge (stops propagation so it doesn't trigger the row click).
- Row body still opens the full care guide modal.
- Thumbnail uses the lazy-fetched map fallback when the row has no stored URL.

### D. Seed prompt — AGGRESSIVELY require every applicable field

Multiple fields are empty across the library, not just on variety rows. The prompt is too permissive — it says "leave fields null only when you have no information" but AI takes that as licence to skip anything uncertain. Rewrite the field-population section to require explicit values with a strict definition of "irrelevant":

> POPULATE EVERY APPLICABLE FIELD. Empty arrays / null values are only acceptable when the field is genuinely irrelevant to the plant:
> - Skip `harvest_season` / `days_to_harvest_*` / `fruits` / `cuisine` ONLY for ornamentals with no edible parts.
> - Skip `flowering_season` / `flowers` / `attracts` ONLY for non-flowering plants (ferns, most succulents, conifers).
> - Skip `pruning_month` / `pruning_count` ONLY for plants that genuinely don't need pruning (most annual vegetables).
> - **All other fields must have values.** This includes: cycle, plant_type, family, care_level, watering, watering_min_days, watering_max_days, sunlight, hardiness_min, hardiness_max, growth_rate, growth_habit, maintenance, soil, soil_ph_min/max, propagation, description, is_edible, is_toxic_pets, is_toxic_humans, drought_tolerant, salt_tolerant, indoor.
>
> EVERY plant has propagation methods (seed is universal). Always populate `propagation`.
>
> For varieties/cultivars: REPEAT the parent species' values explicitly. The schema does not inherit; every row must stand alone. A Tomato 'Sungold' row needs its own watering / sunlight / propagation values even if they match the parent Tomato row.

This fixes future seeded rows. **It does NOT fix the thousands of existing rows with empty fields.** For that we'd need a separate "enrich" pass that walks rows with empty critical fields and asks AI to fill them. Flagged as a follow-up in the out-of-scope list.

### Out of scope for this wave

- Bulk admin backfill (writing fetched URLs back to plant_library). Would require a new edge function + admin UPDATE policy on plant_library. The lazy fetch covers the visible problem; defer the backfill until we wire library reads into user-facing surfaces.
- **Enriching existing rows with empty fields.** The prompt fix only helps new rows. A follow-up "enrich-plant-library" edge function could walk rows where critical fields are empty (e.g. `propagation = '[]' AND flowering_season = '[]' AND harvest_season = '[]'`) and ask AI to fill them in, with the same verification-style structured output. Flagged for next wave once we see how the new prompt performs.

## Files

| File | Change |
|------|---------|
| `src/components/admin/PlantLibrarySearchTab.tsx` | Lazy thumbnail fetch + map, info icon per row, render fallback thumbs |
| `src/components/admin/PlantLibraryQuickPreviewModal.tsx` | NEW — chip-strip preview |
| `src/components/admin/PlantLibraryCareGuideModal.tsx` | Accept `fallbackThumbnail` prop so the hero header uses the lazy-fetched URL when the row's own is null |
| `supabase/functions/seed-plant-library/index.ts` | Reword the cultivar guidance: seasons + propagation fields MUST be populated, even on variety rows |

## Sequencing

Edit three files → typecheck → deploy.
