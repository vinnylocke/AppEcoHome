# Plan — The Library (Quick Access tile)

## Goal

A new mobile Quick Access tile called **The Library** that lets users research any plant — by name search across AI / Perenual / Verdantly — without first committing it to their Shed. Tapping a result opens a preview screen with Care Guide / Grow Guide / Companions / Light tabs that lazy-generate and persist to the global catalogue, so the *next* user searching the same plant gets an instant DB read.

Reads like a counterpart to The Shed:
- **The Shed** — plants you own.
- **The Library** — plants you could grow.

## User-facing flows

1. From Quick Access, tap **The Library** tile → opens `/library/search`.
2. Top of screen: tab toggle **Search** / **Saved**. Search is default.
3. **Search tab:** input + multi-provider results list. Provider badge per result (AI / Perenual / Verdantly). Hits already present in the user's Shed get a small "In your Shed" pill.
4. Tap a result → behind the scenes the plant is ensured-in-catalogue (global `home_id = NULL` row), then navigate to `/library/plant/:id`.
5. **Preview screen:** four tabs.
   - **Care Guide** — render existing care-guide data (always present after step 4).
   - **Grow Guide** — existing `GrowGuideTab`; auto-generates on first tab focus, cached afterwards.
   - **Companions** — existing `CompanionPlantsTab`; same lazy-generate pattern.
   - **Light** — existing `LightTab`; standard light-requirement panel.
6. Header has **← Back** (returns to /library/search keeping the user's query + scroll position) and **Save to Shed**. If the plant is already in the user's Shed, the button is disabled and reads **In your Shed**.
7. Save → existing Shed insert flow → toast → button updates in-place to disabled state.
8. **Saved tab:** lists plants in the user's Shed. Tap → same preview screen (same route), but with the Save button replaced by "In your Shed".

## Naming

- Tile + nav label: **The Library**
- Route prefix: `/library`
- Preview route: `/library/plant/:plantId`

## Catalogue-persist model (decided)

When the user taps a search result, the underlying plant gets persisted to the **global catalogue** (a `plants` row with `home_id = NULL`) before navigation. This means:

- **AI plants** — existing `generate_care_guide` action already does this; returns `db_plant_id`.
- **Perenual plants** — new tiny helper inserts a global row if absent, keyed on `(source='api', perenual_id=...)`.
- **Verdantly plants** — same, keyed on `(source='verdantly', verdantly_id=...)`.

The `plant_grow_guides`, `companion_plants` etc. tables already key on `plants.id` — so generations cascade into the catalogue automatically and the *next* researcher gets cached reads with no Gemini call.

**Save to Shed** then forks the catalogue row into a home-scoped row — same shape, with `home_id` set — using the existing `savePlantToDB` pattern in TheShed.

> Out of scope: extending the `refresh-stale-ai-plants` cron to also re-check Perenual/Verdantly global rows. Provider data isn't a moving target the way Gemini-generated care is, and the existing 90-day Grow Guide refresh cron already covers grow-guide drift regardless of source.

## App-reference docs consulted

- [docs/app-reference/03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md) — Shed search + Save flow + source-badge conventions.
- [docs/app-reference/02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — tile pattern + focus-mode shell wiring.
- [docs/app-reference/08-modals-and-overlays/04-bulk-search-modal.md](../app-reference/08-modals-and-overlays/04-bulk-search-modal.md) — existing multi-provider search UI to crib from.
- [docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — tab orchestration model (Care Guide + Grow Guide + Companions + Light all live here).
- [docs/app-reference/08-modals-and-overlays/36-grow-guide-tab.md](../app-reference/08-modals-and-overlays/36-grow-guide-tab.md) — Grow Guide tab contract.
- [docs/app-reference/08-modals-and-overlays/11-companion-plants-tab.md](../app-reference/08-modals-and-overlays/11-companion-plants-tab.md) — Companion tab contract.
- [docs/app-reference/99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — global-vs-home plant row semantics.
- [docs/app-reference/99-cross-cutting/25-plant-providers.md](../app-reference/99-cross-cutting/25-plant-providers.md) — provider abstraction + cache layer.
- [docs/app-reference/99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md) — `/quick/*` routing + focus-mode shell.

## Files to add

| File | Purpose |
|------|---------|
| `src/components/library/LibraryHome.tsx` | Page shell, hosts tab toggle + nests the two tab views. |
| `src/components/library/LibrarySearchTab.tsx` | Search input + results list. Reuses `searchAllProviders`. |
| `src/components/library/LibrarySavedTab.tsx` | Reads `useCachedShed`, renders a compact grid. |
| `src/components/library/PlantPreview.tsx` | Preview screen — tabs + header + Save CTA. Lives at `/library/plant/:id`. |
| `src/lib/plantCatalogue.ts` | Tiny helper: `ensureGlobalCataloguePlant(result)` → returns `plant_id`. Handles all three sources. |
| `docs/app-reference/02-dashboard/12-the-library.md` | New surface doc (dual-voice). |

## Files to modify

| File | Change |
|------|--------|
| `src/components/QuickAccessHome.tsx` | Add a 4th `QuickTile` for The Library between Quick Capture and the dashboard escape hatch. New accent colour. |
| `src/App.tsx` | Add `<Route path="/library/*">` mounting `LibraryHome`. Apply focus-mode shell (same as `/quick/*`). |
| `src/components/TheShed.tsx` | Extract the inner `savePlantToDB` body into a reusable lib helper so the Library can call it. Keep TheShed delegating to the new helper to avoid drift. |
| `docs/app-reference/02-dashboard/09-quick-access-home.md` | Document the new tile. |
| `docs/app-reference/00-INDEX.md` | Add the new Library doc to the index. |
| `docs/app-reference/99-cross-cutting/21-routing.md` | Document the new `/library/*` routes. |

## Reuse — what we get for free

- `lib/plantProvider.ts → searchAllProviders` — multi-provider search.
- `lib/plantProvider.ts → getProviderPlantDetails` — full record fetch per source.
- `services/plantDoctorService → generateCareGuide` — AI catalogue path.
- `components/GrowGuideTab` — already cache-first + Sage-gated.
- `components/CompanionPlantsTab` — already lazy-loads.
- `components/LightTab` — already plant-id-driven.
- `components/PlantInfoPanel` — renders care-guide data in the same look the Shed uses.
- `hooks/useCachedShed` — Saved tab data source.
- `hooks/useShedPlantMatcher` — "is this already in my Shed?" check (powers the Save button + "In your Shed" pill on search rows).

## Edge cases / risks

- **Sprout-tier user** opens the Library → search returns Perenual + Verdantly only (no AI), Grow Guide tab shows the locked / upgrade banner (existing behaviour). Acceptable.
- **No-internet** → search shows the existing "Could not refresh" pattern from `BulkSearchModal`. Preview falls back to cached `plants` row if available.
- **Plant already saved → user opens preview from Search tab** → Save button is disabled with "In your Shed" copy + a small link "Open in Shed →" that closes the Library and opens the Plant Edit Modal. Keeps the flow honest.
- **Race**: user taps a search result twice rapidly. The catalogue-ensure helper is idempotent (looks up by source + provider id first), so double-tap is safe.
- **Quota**: tapping a result auto-generates the care guide (one Gemini call for AI plants only). This is no worse than the existing Bulk Search flow — same gate, same usage log.

## Process / sequencing

1. **Step 1** — add `lib/plantCatalogue.ts` + a Vitest unit test. (Pure-ish helper.)
2. **Step 2** — extract savePlantToDB into a `lib/saveToShed.ts` helper. Wire TheShed to it. Add a unit test for the helper.
3. **Step 3** — `PlantPreview.tsx` (the meat). Hosts the four tabs. Wire Save button. Use `useShedPlantMatcher` for the disabled state.
4. **Step 4** — `LibrarySearchTab.tsx` + `LibrarySavedTab.tsx` + `LibraryHome.tsx`.
5. **Step 5** — route mount in `App.tsx` + tile in `QuickAccessHome.tsx`.
6. **Step 6** — app-reference docs (new file + index + routing + Quick Access doc).
7. **Step 7** — Playwright E2E spec: search → tap result → see preview → save → "In your Shed" appears → revisit shows cached data instantly.
8. **Step 8** — release notes + deploy.

## Re-rating target

This adds a new top-level surface — re-rating "Quick Access" and "The Shed" sections is unnecessary; the Library is additive.

## Out of scope

- Manual plant creation from the Library (Manual is private by definition; the existing TheShed manual-add flow stays the entry point).
- Cron refresh for Perenual / Verdantly catalogue rows.
- Search filters (cycle / watering / sunlight / edible). The Bulk Search modal has these; the Library v1 keeps the search minimal — add filters in a follow-up if usage demands it.
- Offline sync of preview generations.
