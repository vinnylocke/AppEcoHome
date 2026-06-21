# Plant-first wizard — search selection bug + detail affordances

## Problems

1. **Duplicate selection bug.** In `PlantFirstPlanForm`, a chosen plant is keyed by
   `common_name` only (`keyOf(name)`). When a search returns near-duplicates (same common
   name, different scientific name — e.g. "Lavender" → *Lavandula angustifolia* + *L.
   stoechas*), `isSelected` matches them all, so clicking one visually selects the lot.
2. **No detail affordance in the wizard search.** The user wants the per-plant info (ⓘ)
   preview (label chips + description) and a "see full care / grow guide / companions" button.
   `PlantSearch` already supports this via `allowPreview` + `onViewDetails` — the wizard just
   didn't pass them.

## App-reference consulted

- `docs/app-reference/04-planner/10-plant-first-planner.md` (the surface I just built)
- `src/components/shared/PlantSearch.tsx` (`allowPreview` / `onViewDetails` contract)
- `src/components/BulkSearchModal.tsx` (the canonical `onViewDetails → PlantDetailModal` wiring)

## Fix (all in `src/components/planner/PlantFirstPlanForm.tsx`)

1. **Composite selection key** `selKey(name, scientific_name)` = `name|sci` (lowercased).
   Update `isSelected`, the Shed + search toggles, the chip key + remove to use it, so each
   distinct (name, scientific name) is its own selection. Chips show the scientific name in
   small text to disambiguate.
2. **Detail affordances:** pass `allowPreview` + `onViewDetails={(sel) =>
   setDetailResult(selectionToProviderResult(sel))}` to the wizard's `PlantSearch`; add a
   `detailResult` state + render `<PlantDetailModal result aiEnabled isPremium onClose />`
   (the modal already carries Care / Grow Guide / Companions tabs). Mirrors BulkSearchModal.

## Docs / tests

- Update `docs/app-reference/04-planner/10-plant-first-planner.md` (search preview + detail
  modal; composite selection key).
- Verify via `npm run build`. (Selection identity is inline component state; covered by the
  build + the existing PlantSearch behaviour.)
