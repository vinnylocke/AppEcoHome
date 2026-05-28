# Plan — "See full care" from the search preview → full plant detail (care + grow + companions)

## Goal

In the inline details preview (the panel that opens when you tap the ⓘ on a `<PlantSearch>` result), add a **"See full care"** button that opens the full plant detail view: the **Care Guide**, plus the **Grow Guide** and **Companions** tabs (and Light, which the same surface already carries).

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — the shared search + inline preview
- `docs/app-reference/02-dashboard/12-the-library.md` (PlantPreview screen) and `docs/app-reference/08-modals-and-overlays/36-grow-guide-tab.md`

## What already exists

`src/components/library/PlantPreview.tsx` is the full-care surface (route `/library/plant/:plantId` + `/library/plant/preview`). Given a `ProviderSearchResult` in route state it:
- renders a hero + the Care/Grow/Companions/Light tab bar,
- calls `ensureCataloguePlantFromSearchResult(result, { homeId })` to clone the plant into the catalogue and get a real `plantId`,
- drives `GrowGuideTab`, `CompanionPlantsTab`, `LightTab` off that id, and `ManualPlantCreation` (read-only) for Care.

`LibrarySearchTab` already maps a `PlantSelection` → `ProviderSearchResult` (library → `{_provider:"ai", plant_library_id}`; external → `sel.raw`) — the exact converter we need.

## The decision (how to open it from Add-to-Shed)

Add-to-Shed runs inside `BulkSearchModal` (a modal on `/shed`) with an in-progress multi-select cart. Two ways to surface full care:

- **A — Overlay modal (recommended).** A new `PlantDetailModal` renders the same Care/Grow/Companions/Light tabs in a portal *above* the bulk modal. The user inspects full care and closes it back to their search **with the cart intact**. Matches "opens the plant modal". More code (a new modal reusing the existing tab components + catalogue-ensure).
- **B — Navigate to the existing screen.** "See full care" navigates to `/library/plant/preview` (with `from: "/shed"` so Back returns to the Shed). Minimal code, fully reuses `PlantPreview`, **but leaves the bulk modal and loses the in-progress cart.**

This plan assumes **A**.

## Approach (Option A)

### 1. `src/components/shared/PlantSearch.tsx`
- New optional prop `onViewDetails?: (sel: PlantSelection) => void`.
- When set, render a **"See full care →"** button at the bottom of the inline preview panel (only when `allowPreview` and a preview is open). Clicking calls `onViewDetails(sel)`. (PlantSearch stays decoupled — it doesn't own the detail modal.)

### 2. New `src/components/PlantDetailModal.tsx`
- Props: `result: ProviderSearchResult`, `homeId`, `aiEnabled`, `isPremium`, `onClose`, optional `onSaved`.
- Portal overlay at a z-index above the bulk modal (e.g. `z-[140]`).
- Reuses the **same building blocks** as `PlantPreview`: ensures the catalogue plant from the result (placeholder hero while ensuring), tab bar (Care/Grow/Companions/Light), `ManualPlantCreation` (read-only) + `GrowGuideTab` + `CompanionPlantsTab` + `LightTab`.
- To avoid duplicating the ensure/placeholder logic, extract a small hook `useCataloguePlantFromResult(result, homeId)` into a new `src/hooks/useCataloguePlantFromResult.ts` and use it from the modal. (PlantPreview left unchanged for now to keep that core screen untouched; it can adopt the hook later.)
- No Save button needed (the bulk flow handles adding) — or include a passive "Add to cart"? Out of scope; keep it inspection-only with a close.

### 3. `src/components/BulkSearchModal.tsx`
- Add state `detailResult: ProviderSearchResult | null`.
- Pass `onViewDetails={(sel) => setDetailResult(toProviderSearchResult(sel))}` to `<PlantSearch>`, reusing the same `PlantSelection → ProviderSearchResult` mapping `LibrarySearchTab` uses.
- Render `<PlantDetailModal>` when `detailResult` is set; `onClose` clears it (cart preserved — BulkSearchModal state untouched).

## What stays the same
- Selection, cart, review, import, paste-list, manual — untouched.
- `<PlantSearch>` behaviour unchanged unless `onViewDetails` is passed (other hosts unaffected).

## Tests
- E2E (shed-crud SHED-022a): after opening the inline preview, a "See full care" button is present; tapping it opens the detail modal (resilient `if visible`, library not seeded in test DB). Page-object helpers for the button + modal.
- Unit: light hook test for `useCataloguePlantFromResult` if practical (mock the ensure); otherwise covered by E2E.

## Docs to update
- `36-plant-search.md` — document `onViewDetails` + the "See full care" affordance.
- New reference for `PlantDetailModal` (modals-and-overlays) per the app-reference mandate, cross-linked from PlantPreview + plant-search.

## Risks
- New modal stacks above an existing modal — z-index + focus-trap care (mirror the z-[130] pattern EditSeedPacketModal uses for nested PlantSearchModal).
- Grow Guide / Companions fire edge-fn calls (AI/tier-gated) once the catalogue id resolves — same as PlantPreview; gate on `plantId > 0`.
- Untestable here → verify on device after deploy.

## Next step
On approval (and a pick between A and B), implement, typecheck, update specs + docs, and report for device verification.
