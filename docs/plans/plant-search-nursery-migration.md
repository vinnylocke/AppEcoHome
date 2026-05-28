# Plan — Migrate Nursery plant picker (`PlantSearchModal`) to library-first `<PlantSearch>`

Phase B, surface 4 of the [plant-search overhaul](./plant-search-overhaul-implementation.md). Follows the same "swap the search half, keep the host-specific back half" pattern proven on Shopping, `/library`, and Add-to-Shed.

## App-reference files consulted
- `docs/app-reference/99-cross-cutting/36-plant-search.md` — the shared stack + migration status
- `docs/app-reference/99-cross-cutting/25-plant-providers.md` — the legacy fan-out being replaced
- `docs/app-reference/99-cross-cutting/17-tier-gating.md` — the premium gate being removed
- (Nursery surface refs — packet editor) for the host contract

## What this surface is

`src/components/PlantSearchModal.tsx` (~1210 lines). **One real host:** `src/components/nursery/EditSeedPacketModal.tsx` ("Not in your Shed? → search → add to Shed **and** link to packet in one go"). Single-add: the modal exits via `onSuccess(savedPlant)` after the first insert; the host adopts the returned `plants` row (`{ id, common_name, scientific_name }`) as the packet's linked plant.

Today the modal:
- Is **entirely premium-gated** (`if (!isPremium)` → upgrade wall). Nursery plant-search-linking is Botanist+ only.
- Fans out to AI + Perenual + Verdantly with per-provider sections, pagination, preference sorting, AI thumbnail prefetch, scientific/common search modes, a sessionStorage snapshot cache, keyboard nav, and "in your shed" badges.
- Has its **own preview pane** (`ManualPlantCreation` read-only) + its **own insert** (`handleAddToShed`, three-way Verdantly/AI/Perenual branch) → `onSuccess(savedPlant)`.

## Goal

Make the picker **library-first and free for every tier** (matching the overhaul's locked decision), via the shared `<PlantSearch>` — while keeping the preview + add-to-Shed + single-add `onSuccess` contract the host depends on.

## Approach (mirrors the BulkSearchModal migration)

Keep the **back half** (preview pane + `handleAddToShed` + `onSuccess`); swap the **front half** (search input + per-provider results + pagination + snapshot/prefetch/keyboard machinery) for `<PlantSearch>`.

1. **Remove the premium wall.** Library is free for all tiers; the modal always opens onto search. (External stays opt-in; AI-create stays Sage+.)
2. **Render `<PlantSearch>`** (single-select, `showFilters`, `initialQuery={initialSearchTerm}`) in place of the search form + results list.
3. **`onSelect(sel)` → preview** (not toggle): convert the selection to the preview object the existing `handleAddToShed` expects:
   - `library` → `libraryRowToPlantDetails(sel.raw)` (the helper extracted in the Shed migration), `source: "ai"` → flows through the AI insert branch, no Gemini.
   - `perenual` / `verdantly` → existing `getProviderPlantDetails(...)` path.
   - `ai` → existing `generateCareGuide(...)` path.
   Then set `previewPlant` and show the existing preview + "Add … to My Shed" button unchanged.
4. **Keep** the preview pane, `handleAddToShed` (all three insert branches + the `user_plant_ack` freshness seed + the Perenual harvest-schedule step), and `onSuccess(savedPlant)` verbatim — the host contract is untouched.
5. **Delete** the now-dead front-half machinery: per-provider buckets + pagination, `performSearch`, `loadMore*`, `prefetchAiThumbnails`, snapshot read/write, preference sort, keyboard nav, scientific/common mode toggle, `searchAllProviders`/`PerenualService`/`VerdantlyService` search imports.

## Trade-offs (what changes for the user)

- **Free for all tiers** — a Sprout user can now search the library to link a packet. (Intended by the overhaul.)
- **Scientific-name search still works** for the library tier: the relevance RPC matches `search_text` (common + scientific + other names) via LIKE/trigram, so the explicit "Scientific Name" mode toggle is no longer needed. External (Perenual/Verdantly) scientific lookups move under the opt-in "search more databases" path.
- **Lost on this surface:** the explicit scientific/common toggle, within-bucket preference sorting, the per-provider "show more" pagination, the AI-thumbnail prefetch, and the sessionStorage snapshot cache. These were power-features; the library-first list + opt-in expansion is the new model. (Could be re-added to `<PlantSearch>` later for all surfaces if wanted.)
- **"In your shed" badge** is not on the `<PlantSearch>` list (same trade-off as Add-to-Shed); the insert still dedups and blocks re-adds.

## Files to change
- `src/components/PlantSearchModal.tsx` — swap front half for `<PlantSearch>`, drop the premium wall, keep preview + `handleAddToShed` + `onSuccess`.
- `src/components/nursery/EditSeedPacketModal.tsx` — **no logic change**; the `isPremium`/`isAiEnabled`/`initialSearchTerm`/`onSuccess` props stay. (Optionally relabel the CTA copy now that it's free — minor.)

## App-reference docs to update
- `36-plant-search.md` — flip Nursery row to ✅ migrated; note the preview+add reuse.
- `25-plant-providers.md` — note the picker no longer fans out directly.
- Nursery packet-editor reference — note the free, library-first picker + removed premium wall.

## Tests
- E2E: update the nursery packet-editor spec / page object — the picker now opens on the shared `plant-search-input` (no premium wall, no provider tabs); selecting a result shows the preview + "Add to My Shed". Make external-dependent assertions resilient (library not seeded in test DB), mirroring the shed/shopping specs.
- Unit: none new (logic reuses `libraryRowToPlantDetails`, already covered).

## Risks
- **Single-host, feature-rich, untestable here.** Biggest risk: the preview→insert→`onSuccess` path must keep returning a valid `plants` row so packet-linking still works. Mitigated by keeping `handleAddToShed` + `onSuccess` verbatim and only changing what feeds `previewPlant`.
- **Stacked on an unverified change.** The Add-to-Shed (BulkSearchModal) migration hasn't been device-verified yet. Worth deciding whether to verify that first before stacking this.

## Next step
On approval, implement the swap, typecheck, update the nursery E2E spec + the three app-reference docs, and report for device verification. Not deploying without go-ahead.
