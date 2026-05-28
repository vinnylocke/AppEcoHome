# Plan — Preview plant details from the search list (before adding to cart)

## Problem

On the Shed's Add-to-Shed search (`<PlantSearch multiSelect>`), a result row only has a select checkbox. To see a plant's details you must first add it to the cart and open the review step. The user wants to **preview details from the search list, before selecting** — restoring the info-icon affordance the legacy `BulkSearchModal` had.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — the shared search stack (notes the in-search preview/badge was dropped in the BulkSearchModal migration as a trade-off)

## Approach

Add an opt-in inline preview to the shared `<PlantSearch>` component, so the affordance is consistent and reusable (Shed needs it now; other hosts can opt in later).

### `src/components/shared/PlantSearch.tsx`
- New optional prop `allowPreview?: boolean` (default `false` → no behaviour change for Shopping / `/library` / Nursery, which already preview on tap/navigate).
- `ResultRow`: when `allowPreview`, render an **info (ⓘ) button** alongside the select control. Its click `stopPropagation`s so it previews without toggling selection (mirrors the old checkbox + info pattern).
- `<PlantSearch>` owns the preview state + data:
  - `previewKey: string | null`, `previewCache: Map<string, PlantDetails | null>`, `previewLoading: Set<string>`.
  - On info-click `togglePreview(sel, key)`: if open → close; else open and ensure details:
    - `library` → `libraryRowToPlantDetails(sel.raw)` (instant, no network).
    - `perenual` / `verdantly` → `getProviderPlantDetails({ source, perenual_id, verdantly_id })` (async, spinner).
    - `ai` → `careGuideToPlantDetails` fallback (rare on the opt-in external list).
  - Render `<PlantInfoPanel details loading />` inline beneath the expanded row (same component the review step uses).
- New imports: `PlantInfoPanel`, `getProviderPlantDetails`, `careGuideToPlantDetails`, `libraryRowToPlantDetails`.
- testid: `plant-search-result-info-<id>` on the info button; reuse `plant-search-preview-panel` for the panel.

### `src/components/BulkSearchModal.tsx`
- Pass `allowPreview` to `<PlantSearch>`. No other change (review/cart/import untouched).

## What stays the same
- Single-select surfaces (Shopping/Library/Nursery) don't pass `allowPreview` → unchanged.
- Selection, filters, spelling, external/AI opt-in, paste-list, review, import — all untouched.

## Tests
- E2E (shed-crud): after the opt-in external search yields a row, tapping its info button reveals the preview panel without selecting (resilient `if visible`, since the library isn't seeded in the test DB).
- Unit: none new (preview reuses already-covered mappers/fetchers).

## App-reference docs to update
- `36-plant-search.md` — note the in-list preview is back (opt-in via `allowPreview`), so the earlier "dropped on this surface" caveat for the info panel no longer applies to Add-to-Shed.

## Risks
- Low. Additive + opt-in; the preview reuses existing data paths (`libraryRowToPlantDetails`, `getProviderPlantDetails`, `PlantInfoPanel`). Untestable here, so verify on device after deploy.

## Design choice for you
Inline expand under the row (matches the old BulkSearchModal feel) vs. a tap-to-open bottom sheet/modal. Plan assumes **inline expand**.
