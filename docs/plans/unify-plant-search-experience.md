# Plan — Unify the plant-search experience across all surfaces

## Goal
Every place that uses plant search should feel like **Add-to-Shed**: same search, same result rows, the same per-row **ⓘ info preview**, and the same **"See full care"** detail. One place to change it if it ever needs updating.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — the shared `<PlantSearch>` + migration status
- `docs/app-reference/08-modals-and-overlays/38-plant-detail-modal.md` — the "See full care" overlay

## Where we are (the experience is already centralised — hosts just under-use it)
All four surfaces already render the shared `<PlantSearch>`; the search + result rows + ⓘ preview + "See full care" all live in **`<PlantSearch>`** + **`PlantDetailModal`** (already modular). The gap is that only Add-to-Shed opts into the richer props:

| Surface | Host | `showFilters` | `allowPreview` (ⓘ) | `onViewDetails` (See full care) | Row tap does |
|---|---|---|---|---|---|
| Add-to-Shed | `BulkSearchModal` | ✅ | ✅ | ✅ overlay | toggle (multi-select) |
| Shopping | `AddItemSheet` | ❌ | ❌ | ❌ | add item |
| Library `/library` | `LibrarySearchTab` | ✅ | ❌ | ❌ | navigate to full plant page |
| Nursery | `PlantSearchModal` | ✅ | ❌ | ❌ | open preview pane → add |

Also, the `PlantSelection → ProviderSearchResult` converter (needed to open `PlantDetailModal`) is **duplicated** in `BulkSearchModal` (`selectionToResult`) and `LibrarySearchTab` (`handleSelect`).

## Changes

### 1. One shared converter (modularity)
Add `selectionToProviderResult(sel): ProviderSearchResult` to `src/lib/unifiedPlantSearch.ts` (library → `{_provider:"ai", plant_library_id}`, external → `sel.raw`, else `{_provider:"ai"}`). Replace the copies in `BulkSearchModal` + `LibrarySearchTab` with it. Now the search rows (`<PlantSearch>`), the detail (`PlantDetailModal`) and the mapping (`selectionToProviderResult`) each have exactly one definition.

### 2. Turn on the same row experience everywhere
- **Shopping (`AddItemSheet`)**: add `showFilters`, `allowPreview`, and `onViewDetails` → render `PlantDetailModal` (has `homeId`, `aiEnabled`, `perenualEnabled`). Row tap still adds the item.
- **Nursery (`PlantSearchModal`)**: add `allowPreview` + `onViewDetails` → `PlantDetailModal`. Row tap still opens its preview pane → add. (The overlay adds Grow Guide / Companions / Light that the pane doesn't have.)
- **Library (`LibrarySearchTab`)**: add `allowPreview` (the ⓘ quick peek). **See open decision below** for "See full care".

`PlantDetailModal` already handles cold-cloning the plant from a search result, so it works the same in every host.

## Open decision for sign-off
**Library `/library`** already opens a **full-screen plant page** (`PlantPreview`) when you tap a result — that's its richest detail view. Two options for it:
- **A (recommended):** add the ⓘ quick-peek, and keep tap → full page as its "see full care" (no separate overlay button — avoids two competing detail views in the one surface that has a dedicated page).
- **B:** make it identical to the others — add the "See full care" overlay too, so `/library` has both the overlay and the full page.

(Shopping + Nursery have no dedicated full-care surface, so they get the overlay in both options.)

## Tests
- E2E: extend the shopping + nursery (+ library) specs to assert the ⓘ preview appears and "See full care" opens the detail modal (resilient `if visible`, mirroring SHED-022a/023e).
- Unit: a small test for `selectionToProviderResult` in `unifiedPlantSearch.test.ts`.

## App-reference docs
- `36-plant-search.md` — note `allowPreview` + `onViewDetails` are now on (or available to) every host; the migration-status table.
- `38-plant-detail-modal.md` — hosts list (now Shopping/Nursery, not just Add-to-Shed).

## Risks
- Low/medium. Additive props on existing shared components; each host keeps its own row-tap action. Untestable visually here → verify on device. Admin Search Lab stays on its own RPC (a power tool, out of scope).

## Deploy
Frontend-only. One deploy, then push to `main`.
