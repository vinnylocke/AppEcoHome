# Plan — PlantSearchModal: provider-grouped results + per-provider pagination

## Goal

Reorder PlantSearchModal results as **AI → Perenual → Verdantly** (currently Perenual → Verdantly → AI), and add per-provider "Show more" pagination capped at 10 results per page. Matches the existing Library search pattern.

## App-reference / code consulted

- [docs/app-reference/02-dashboard/12-the-library.md](../app-reference/02-dashboard/12-the-library.md) — canonical version of the pattern.
- `src/components/library/LibrarySearchTab.tsx` — has the per-provider grouped UI + pagination we're mirroring (3 state buckets, 3 load-more handlers, AI → Perenual → Verdantly order).
- `src/lib/perenualService.ts` — `searchPlantsPaged(query, page)` returns `{ data, hasMore, nextPage }`.
- `src/lib/verdantlyService.ts` — `searchPlants(query, page)` returns `{ results, hasMore, nextPage }`.
- `src/services/plantDoctorService.ts` — `searchPlantsText(query, { offset })` returns `{ matches, hasMore, hits }`.

## Change

In `src/components/PlantSearchModal.tsx`:

1. **Replace** the single `searchAllProviders` call with three parallel direct service calls:
   - AI: `PlantDoctorService.searchPlantsText(query, { homeId })` (gated by `isAiEnabled`).
   - Perenual: `PerenualService.searchPlantsPaged(query, 1)`.
   - Verdantly: `VerdantlyService.searchPlants(query, 1)`.
2. **Three state buckets** instead of a single `results` array:
   - `aiResults: ProviderSearchResult[]`, `aiHasMore`, `aiOffset`, `aiLoadingMore`.
   - `perenualResults: ProviderSearchResult[]`, `perenualHasMore`, `perenualNextPage`, `perenualLoadingMore`.
   - `verdantlyResults: ProviderSearchResult[]`, `verdantlyHasMore`, `verdantlyNextPage`, `verdantlyLoadingMore`.
3. **Render order**: AI section → Perenual section → Verdantly section. Each section has its own header chip ("AI Suggestions" / "Perenual" / "Verdantly") + results list + "Show more" pill at the foot when `hasMore`.
4. **Initial page**: 10 results per provider (the natural API page size). "Show more" appends the next page.
5. **`rankedResults` preference sort** stays per-provider — sorting the AI bucket separately from Perenual and Verdantly. Less mind-bending than re-mixing across providers.
6. **`selectedResultIndex` (keyboard nav)** — currently indexes the flat `rankedResults` array. With three buckets we'll flatten on-render for keyboard nav: `[...aiVisible, ...perenualVisible, ...verdantlyVisible]`. Same array shape, just bucket-aware build.
7. **Empty states** — when ALL three are empty after a search, the existing "No results" empty state stays. If one provider has 0 but others have results, that provider's section is omitted entirely (no empty header). Mirrors LibrarySearchTab.

## What we explicitly DON'T need to change

- The preview pane (single-plant view) is identical regardless of which provider the result came from.
- `handleAddToShed` already branches on `previewPlant.source` (verdantly / ai / api). No changes there.
- The Perenual gating screen (Sprout users) stays — fires before the search UI renders.

## Risks

- **Triple API call on every search** — was a single batched call inside `searchAllProviders`, now three direct calls. Net cost is identical (the old call fan-out was the same three under the hood) — just moved into the component.
- **The shared `searchAllProviders` helper is still used by other call sites** (notably the PlantDoctor chat). Untouched here; we only swap the consumer in this modal.

## Files

| File | Change |
|------|--------|
| `src/components/PlantSearchModal.tsx` | Direct provider calls; three buckets; grouped render with per-provider "Show more"; flatten on render for keyboard nav |

No new files. No new tests required — the existing PlantSearchModal isn't unit-tested today (it's integration-tested via Library E2E). The change is UI-only.

## Out of scope

- A reusable `<GroupedProviderSearch>` component lifted from LibrarySearchTab. Could happen later if we add a third call site; today it's two surfaces, premature abstraction.
- Server-side cross-provider ranking. Each provider's own results are already ranked sensibly; mixing produces worse top-10s.

## Sequencing

1. Edit PlantSearchModal — replace the single state + call with the three-bucket version.
2. Re-render groups in AI → Perenual → Verdantly order.
3. Wire up `loadMoreAI` / `loadMorePerenual` / `loadMoreVerdantly`.
4. Typecheck + smoke build.
5. Release notes + deploy.
