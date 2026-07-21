# Plant Search — Unified, Library-First

> The shared search stack behind adding plants anywhere in the app. Library-first (free, instant, all tiers), with spelling suggestions and opt-in expansion to external databases (Botanist+) and AI creation (Sage+). Replaces the per-surface `searchAllProviders` fan-out, surface by surface.

**Source files:**
- `src/lib/unifiedPlantSearch.ts` — the service (search/spelling/external/AI + normalisers)
- `src/components/shared/PlantSearch.tsx` — the shared component
- `supabase/migrations/20260525120000_plant_library_search_extensions.sql` — the relevance + fuzzy RPCs

---

## Quick Summary

Every search funnels through one engine, library-first:

1. **`searchLibrary`** — local `plant_library` via `search_plant_library_relevance_filtered` RPC. Relevance-ranked (exact → prefix → contains → trigram), FREE, all tiers. Accepts structured filters (cycle / watering / sunlight / edible / indoor / poisonous) applied on indexed columns; an empty query + active filters = browse-by-filter. The default experience.
2. **`didYouMean`** — `search_plant_library_fuzzy` RPC. Trigram spelling suggestions, surfaced when library results are thin (≤1).
3. **`searchExternal`** — Perenual + Verdantly via `searchAllProviders`. **Opt-in** ("Search more databases").
4. **`createWithAI`** — `add-plant-to-library` edge fn: enriches + inserts into the shared library (free for everyone after). **Opt-in** (Sage+).

All results normalise to a `PlantSelection` (`{ source, common_name, scientific_name?, library_id?, perenual_id?, verdantly_id?, thumbnail_url?, raw? }`). The host decides what "select" does.

Design + decisions: [docs/plans/plant-search-overhaul-design.md](../../plans/plant-search-overhaul-design.md). Migration plan: [docs/plans/plant-search-overhaul-implementation.md](../../plans/plant-search-overhaul-implementation.md).

---

## Role 1 — Technical Reference

### `<PlantSearch>` props

| Prop | Purpose |
|------|---------|
| `homeId` | Scope for AI create + external context |
| `gates: { canSearchExternal, canCreateWithAI }` | Drives whether the opt-in CTAs are live buttons or upgrade nudges. Host computes from tier/aiEnabled. |
| `onSelect(sel: PlantSelection)` | Fired when the user taps a result (or manual / AI-created plant). Host maps it to its write. |
| `allowManual?` | Show "Add … manually" fallback (emits `source: "manual"`). |
| `showFilters?` | Show the structured filter panel (cycle / sunlight / edible / indoor). Live on `/library`. |
| `initialQuery?` / `onQueryChange?` | Seed + observe the query (e.g. `/library` `?q=` sync). |
| `autoFocus?`, `placeholder?` | Input ergonomics. |
| `multiSelect?` / `isSelected?` | Rows show a checkbox and `onSelect` toggles; `isSelected(sel)` drives the checked state. Host owns the set (Add-to-Shed). |
| `allowPreview?` | Per-row info (ⓘ) button that expands an inline `PlantInfoPanel` **without** selecting. Library rows preview instantly via `libraryRowToPlantDetails`; Perenual/Verdantly fetch via `getProviderPlantDetails`. Now on every host that uses the shared search (Add-to-Shed, Shopping, `/library`, Nursery). |
| `onViewDetails?(sel)` | With `allowPreview`, adds a **"See full care"** button to the inline preview. The host opens the full detail surface (Care Guide + Grow Guide + Companions + Light). Add-to-Shed and Shopping open `PlantDetailModal` (overlay). Hosts with their own full preview screen (`/library`, Nursery) pass `allowPreview` only and keep the tap → preview path. |

### Behaviour

- Debounced (350ms) library search on type; stale-guarded via a sequence ref.
- Result-row thumbnails render through `<PlantResultThumb>` (`src/components/PlantResultThumb.tsx`): it shows the row's stored image when usable, otherwise self-resolves one by name via `plant-image-search` (server-cached). Library rows store null images and Perenual returns `upgrade_access` placeholders, so without this most rows showed only a leaf icon. See [Image Sources](./24-image-sources.md).
- Spelling chips render when library results ≤1 (`didYouMean`), tapping re-runs the search.
- External + AI are **opt-in buttons** below the library results (never auto-fired) — the common case stays free + instant.
- Empty query → gentle prompt.
- Gates false → the CTA renders as a locked upgrade nudge instead of a button.

#### Inline preview (`allowPreview`)

When `allowPreview` is set, each result row gets an info (ⓘ) button next to the select control. Tapping it (a) does **not** select the row and (b) expands an inline `PlantInfoPanel` beneath it. The component owns the preview state (`previewKey` / `previewCache` / `previewLoading`) keyed by the row's testid: library rows resolve instantly from the row data, Perenual/Verdantly fetch on demand with a spinner. This is the "inspect before adding" affordance the legacy BulkSearchModal had, now turned on for every host: multi-select hosts (Add-to-Shed) pair it with `onViewDetails`; single-select hosts (Shopping, `/library`, Nursery) keep their own tap → preview path but still get the ⓘ peek so the result-row experience matches everywhere.

The Companions tab reuses these same shared pieces with a library-first, AI-last resolution: each companion row's ⓘ resolves the plant via `searchLibrary` → `libraryRowToPlantDetails` first; on a library miss it falls back to a provider-DB lookup (`searchAllProviders(["perenual","verdantly"])` → `getProviderPlantDetails`, preferring the free Verdantly hit, **no AI**); only a total miss yields an AI-by-name result. It shows the same `PlantInfoPanel` pills (+ the companion reason), and tapping a companion opens `PlantDetailModal` (its Care / Grow Guide / Companions / Light), cloning from the library/provider when matched and generating with AI only as a last resort. (`PlantDetailModal` is lazy-imported there to avoid the CompanionPlantsTab ⇄ PlantDetailModal cycle.)

When `onViewDetails` is also passed, the preview panel gains a **"See full care"** button. In Add-to-Shed and Shopping it hands the selection to `PlantDetailModal` — a portal overlay rendering the full Care Guide / Grow Guide / Companions / Light / **Soil Needs** tabs (five, not four — doc drift fixed 2026-07-21; the `PlantPreview` screen it mentions was retired with `/library`). The overlay reuses `useCataloguePlantFromResult` (clones the plant into the catalogue to drive the tabs) and closes back to the search with the host's state (cart / list) intact. See [Plant Detail Modal](../08-modals-and-overlays/38-plant-detail-modal.md).

### Library row → `plants` (per host)

`PlantSelection { source: "library" }` carries `library_id` **and** the full row in `raw`. Hosts that need a `plants` row convert it one of two ways, both already built:

- **`/library` preview** routes the selection as a `ProviderSearchResult { _provider: "ai", plant_library_id }` → `ensureCataloguePlantFromSearchResult` → `ensureCataloguePlantFromLibrary(libraryId)` clones it into the **global catalogue** (dedup by sci name).
- **Add-to-Shed (BulkSearchModal)** maps `raw` → `PlantDetails` via the shared `libraryRowToPlantDetails(lib)` helper and forwards it as `preloadedDetails` on an `{ type: "ai" }` cart item. TheShed's AI branch consumes `preloadedDetails` and writes a **home-scoped** `plants` row with `source: "ai"` — no Gemini call, no `plants_source_check` change.

Hosts that only need a name + thumbnail (Shopping) use the `PlantSelection` basics directly.

### Tier gating

| Tier | Library + spelling | External (Verdantly + Perenual) | Create with AI |
|------|--------------------|---------------------------------|----------------|
| Sprout | ✅ | ❌ nudge (both now require `enable_perenual`) | ❌ nudge |
| Botanist | ✅ | ✅ | ❌ nudge |
| Sage / Evergreen | ✅ | ✅ | ✅ |

`plant_library` RLS is `USING(true)` — readable by every authenticated user, so the library tier needs no permission change.

**Verdantly is now gated like Perenual** (`enable_perenual`) — server-side in `verdantly-search`
(covers search + details + the Companions ⓘ-peek) and in `companion-planting`'s Verdantly path.
`<PlantSearch>` gates the external CTA on `enable_perenual` (`canExternal = gates.canSearchExternal
&& pref.enablePerenual`); Sprout now sees an upgrade nudge instead of Verdantly results.

### Default search source (Settings)

Entitled users (`enable_perenual` or `ai_enabled`) can choose, in the account tab, which source plant
searches run **first** — `user_profiles.search_settings.plant_source` ∈ {library, verdantly, perenual,
ai}, entitlement-clamped at read time (`src/lib/searchPreference.ts` → `useSearchPreference`,
`clampPlantSource`, `availablePlantSources`). When it's not `library`, `<PlantSearch>` auto-runs that
source on type (debounced, min 3 chars), renders it **first**, and keeps the library as the auto-shown
fallback below. Default for everyone stays library-first. The Watchlist (pest/disease) search honours a
parallel `ailment_source` preference (library/perenual/ai — no Verdantly) that opens its Add-modal in the
chosen tab — `clampAilmentSource` / `availableAilmentSources`; see [Watchlist](../03-garden-hub/02-watchlist.md).

### Migration status (surface by surface)

| Surface | Status |
|---------|--------|
| Shopping → Add Item (plant tab) | ✅ migrated + unified — `<PlantSearch showFilters allowPreview onViewDetails>`; the ⓘ peek + "See full care" → `PlantDetailModal` overlay matches Add-to-Shed (closes back to the list). |
| `/library` search | **RETIRED** — the `/library` browse UI (and `LibrarySearchTab.tsx`) were deleted (commit `7700447`, "retire Library UI"); this row is kept for history. Its full-screen idea returned as the Shed's `PlantSearchTakeover` (below). |
| **Add-to-Shed (`PlantSearchTakeover`)** | ✅ **the Shed's front door is now a FULL-PAGE host** (overhaul Stage 2, 2026-07-21 — `src/components/shed/PlantSearchTakeover.tsx`): `<PlantSearch multiSelect showFilters allowPreview onViewDetails>` as the page body, sticky cart tray, extracted review step, same `bulk-search-*` testids + deep-link contract. BulkSearchModal remains only as CompanionPlantsTab's host. |
| Add-to-Shed (BulkSearchModal — now Companions-only) | ✅ migrated — `<PlantSearch multiSelect showFilters allowPreview>`; review/manual/paste-list/import preserved. Library selections forward `preloadedDetails` (mapped via `libraryRowToPlantDetails`) through TheShed's AI branch — no Gemini, no `plants_source_check` change (saved as `source: "ai"`, matching the `/library` clone path). `allowPreview` restores the inline info-icon → details preview on each result row (see "Inline preview" below). |
| Nursery plant picker (PlantSearchModal) | ✅ migrated + unified — `<PlantSearch showFilters allowPreview>` (single-select); `allowPreview` adds the ⓘ peek, tap still opens the existing `ManualPlantCreation` preview pane + "Add to My Shed" (no redundant overlay). The **premium wall is removed** (library free for all tiers). Preview pane + `handleAddToShed` insert + single-add `onSuccess(savedPlant)` contract kept verbatim. Dropped on this surface: scientific/common toggle, preference sort, per-provider pagination, AI-thumbnail prefetch, snapshot cache. |
| Companion plants (CompanionPlantsTab) | ✅ covered — it has no search box of its own; it hosts the migrated `BulkSearchModal` (and `PlantSourcePicker` for batch name-resolution). Its `handleBulkAdd` consumes the same cart-item shapes and benefits from library `preloadedDetails`. |
| Admin Search Lab | stays on its own RPC methods (power tool) |

**Legacy fan-out status:** `searchAllProviders` is the engine behind the opt-in "search more databases" tier (`unifiedPlantSearch.searchExternal`). It also has one targeted direct caller: `CompanionPlantsTab.resolveCompanion` uses it (Perenual/Verdantly only, no AI) as the ⓘ-peek fallback when a companion isn't in `plant_library`. `PlantSourcePicker` (a batch *name-resolver*, not a search box) still resolves names via the individual provider services; converting it to library-first resolution is a possible future enhancement, not part of the search-box consolidation.

### Library → catalogue conversion (already built)

A `PlantSelection { source: "library", library_id }` is routed to the preview as a `ProviderSearchResult { _provider: "ai", plant_library_id }`. The preview's `ensureCataloguePlantFromSearchResult` → `ensureCataloguePlantFromLibrary(libraryId)` clones the `plant_library` row into a catalogue `plants` row (dedup by scientific name, no Gemini cost). This path pre-existed (AI Plant Overhaul Wave 3) and is reused as-is — no new conversion code or `plants_source_check` change needed. Add-to-Shed will reuse the same path.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

Before, searching for a plant fanned out to external databases (gated by tier) — so a free-tier Sarah got a thin experience and every search cost API calls. Now the first thing every search hits is our own library: tens of thousands of plants, instant, free, for everyone. Type "tomato" and you get relevant results immediately. Misspell "rosemarry" and you get "Did you mean Rosemary?". Only if the library doesn't have what you want do you reach for the wider databases (a tap) or ask AI to conjure it (Sage+), and anything AI creates joins the library for everyone.

### What each gardener gets

- **Sarah (amateur, free tier):** full library search + filters + spelling, no paywall. The wider-search and AI buttons are visible as upgrade nudges so she knows what's behind the curtain.
- **Marcus (expert, paid):** library-first for speed, plus one-tap external breadth and AI creation for rare cultivars the library lacks.

### Common pitfalls

- "The AI suggested a plant I don't have" — that's the wider search / AI create, not your Shed. Library results are the curated database; selecting one adds it where you are (shopping list, etc.).

---

## Related reference files

- [Plant Providers](./25-plant-providers.md) — the legacy fan-out being replaced
- [Plant Library Admin](../07-management/10-plant-library-admin.md) — the Search Lab whose relevance method this generalises
- [The Library](../02-dashboard/12-the-library.md) — the dedicated browse surface (migration pending)
- [Tier Gating](./17-tier-gating.md)
- [Edge Functions Catalogue](./10-edge-functions-catalogue.md) — `add-plant-to-library`, `search-plants-ai`

## Code references for ongoing maintenance

- `src/lib/unifiedPlantSearch.ts`
- `src/components/shared/PlantSearch.tsx`
- `src/components/shopping/AddItemSheet.tsx` — first migrated host
- ~~`src/components/library/LibrarySearchTab.tsx`~~ — deleted with the retired `/library` UI (commit `7700447`)
- `src/components/shed/PlantSearchTakeover.tsx` — the Shed's full-page host (Stage 2)
- `src/components/BulkSearchModal.tsx` — Add-to-Shed host (`multiSelect`)
- `src/lib/plantCatalogue.ts` — `libraryRowToPlantDetails` (shared library-row → `PlantDetails` mapper)
- `supabase/migrations/20260525120000_plant_library_search_extensions.sql` — relevance + fuzzy RPCs
- `supabase/migrations/20260628100000_plant_library_relevance_filtered.sql` — filtered relevance RPC
