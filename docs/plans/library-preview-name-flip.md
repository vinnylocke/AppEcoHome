# Plan — Library preview flips name to a different same-species variant

## Bug

In the Library, search "Tomato" → result shows **"Tomato"**; tap it → the preview shows **"Beefsteak Tomato"**. The selected plant's name (and data) is replaced by a different variant of the same species.

## Root cause

The global AI **catalogue** (`plants` where `source='ai' AND home_id IS NULL`) has a UNIQUE index on `scientific_name_key` (`plants_ai_global_dedup_idx`) — **one catalogue row per species**. The **library** (`plant_library`) has many common-name variants per species (Tomato / Beefsteak Tomato / Cherry Tomato are all *Solanum lycopersicum*).

`ensureCataloguePlantFromLibrary` (`src/lib/plantCatalogue.ts`) dedups the clone by **scientific name only** (`findCataloguePlantBySciName` → matches `scientific_name_key`). So selecting library "Tomato" finds the already-catalogued "Beefsteak Tomato" row (same species) and returns it via `loadCataloguePlant`, so the preview shows "Beefsteak Tomato".

We can't fix it by inserting a second catalogue row for "Tomato" — the unique index forbids two global AI rows per species (intentional: companions / grow guides are generated once per species).

## Fix (minimal, respects the species-keyed catalogue)

In `ensureCataloguePlantFromLibrary`, when an existing catalogue row matches by scientific name:
- If its **common name equals** the selected library row's → reuse it as today (`loadCataloguePlant`).
- If its common name **differs** (e.g. catalogued "Beefsteak Tomato" vs selected "Tomato") → keep the existing catalogue **`plantId`** (so the species-level Grow Guide / Companions / Light tabs still work) but present the **selected library plant's own identity + care data** (`libraryRowToPlantDetails(lib)`), so the name + Care tab stay "Tomato".

```ts
const existingId = await findCataloguePlantBySciName(sciFirst);
if (existingId) {
  const existing = await loadCataloguePlant(existingId);
  const sameCommon =
    (existing.details.common_name ?? "").trim().toLowerCase() ===
    (lib.common_name ?? "").trim().toLowerCase();
  if (sameCommon) return existing;
  // Same species, different common name → show the selected variant's identity,
  // reuse the species catalogue id for the gated tabs.
  const details = libraryRowToPlantDetails(lib);
  details.db_plant_id = existingId;
  return { plantId: existingId, source: "ai", details, fromCache: true };
}
```

This is a single, central fix — every host that clones a library row (`/library` preview, Add-to-Shed, Multi-ID, etc.) routes through `ensureCataloguePlantFromLibrary`, so all of them stop flipping the name.

### Why this is correct, not a hack

The library already holds each variant's own care data (no AI needed), so showing the selected variant's data is right and cost-free. The heavier species-level tabs (Companions / Light / Grow Guide) are legitimately shared across same-species variants, so reusing the catalogue id for them is fine.

## App-reference consulted

- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — catalogue dedup indexes (one global AI row per species).
- `docs/app-reference/02-dashboard/12-the-library.md` + `08-modals-and-overlays/38-plant-detail-modal.md` — the preview/clone flow.

## Tests

- **Vitest** — if the existing lib-test infra can mock the `supabase.from().select().is().ilike().maybeSingle()` chain + `loadCataloguePlant`, add a `plantCatalogue` test: same-species-different-common → returned `details.common_name` equals the library row's, `plantId` equals the existing catalogue id. If the mock surface is too heavy for a clean unit test, I'll extract the "which identity to present" decision into a tiny pure helper and test that instead, and note it.
- **Manual** — `/library` → search "Tomato" → tap → preview shows "Tomato" (not "Beefsteak Tomato"); the Companions/Light tabs still load.

## Docs

- `03-data-model-plants.md` — note that library→catalogue clone preserves the selected variant's identity even when the species is already catalogued under another common name.

## Process

1. Edit `ensureCataloguePlantFromLibrary`.
2. `npx tsc --noEmit` + `npm run build` + `npm run test:unit`.
3. Docs.
4. Release note (Fixed); deploy `--bump 1`; push to main.
