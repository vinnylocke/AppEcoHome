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

### Behaviour

- Debounced (350ms) library search on type; stale-guarded via a sequence ref.
- Spelling chips render when library results ≤1 (`didYouMean`), tapping re-runs the search.
- External + AI are **opt-in buttons** below the library results (never auto-fired) — the common case stays free + instant.
- Empty query → gentle prompt.
- Gates false → the CTA renders as a locked upgrade nudge instead of a button.

### Library row → `plants` (per host)

`PlantSelection { source: "library" }` carries `library_id` **and** the full row in `raw`. Hosts that need a `plants` row convert it one of two ways, both already built:

- **`/library` preview** routes the selection as a `ProviderSearchResult { _provider: "ai", plant_library_id }` → `ensureCataloguePlantFromSearchResult` → `ensureCataloguePlantFromLibrary(libraryId)` clones it into the **global catalogue** (dedup by sci name).
- **Add-to-Shed (BulkSearchModal)** maps `raw` → `PlantDetails` via the shared `libraryRowToPlantDetails(lib)` helper and forwards it as `preloadedDetails` on an `{ type: "ai" }` cart item. TheShed's AI branch consumes `preloadedDetails` and writes a **home-scoped** `plants` row with `source: "ai"` — no Gemini call, no `plants_source_check` change.

Hosts that only need a name + thumbnail (Shopping) use the `PlantSelection` basics directly.

### Tier gating

| Tier | Library + spelling | External (more databases) | Create with AI |
|------|--------------------|---------------------------|----------------|
| Sprout | ✅ | ✅ (Verdantly free; Perenual self-gates) | ❌ nudge |
| Botanist | ✅ | ✅ | ❌ nudge |
| Sage / Evergreen | ✅ | ✅ | ✅ |

`plant_library` RLS is `USING(true)` — readable by every authenticated user, so the library tier needs no permission change.

### Migration status (surface by surface)

| Surface | Status |
|---------|--------|
| Shopping → Add Item (plant tab) | ✅ migrated (first proof surface) |
| `/library` search | ✅ migrated — library hits route through the existing `plant_library_id` clone path |
| Add-to-Shed (BulkSearchModal) | ✅ migrated — `<PlantSearch multiSelect showFilters>`; review/manual/paste-list/import preserved. Library selections forward `preloadedDetails` (mapped via `libraryRowToPlantDetails`) through TheShed's AI branch — no Gemini, no `plants_source_check` change (saved as `source: "ai"`, matching the `/library` clone path). |
| Nursery plant picker (PlantSearchModal) | ✅ migrated — `<PlantSearch showFilters>` (single-select). The **premium wall is removed** (library free for all tiers). Preview pane + `handleAddToShed` insert + single-add `onSuccess(savedPlant)` contract kept verbatim, so the packet-editor host still links the returned row. Library selections preview instantly via `libraryRowToPlantDetails` and save through the AI insert branch. Dropped on this surface: scientific/common toggle, preference sort, per-provider pagination, AI-thumbnail prefetch, snapshot cache. |
| Companion plants (CompanionPlantsTab) | ✅ covered — it has no search box of its own; it hosts the migrated `BulkSearchModal` (and `PlantSourcePicker` for batch name-resolution). Its `handleBulkAdd` consumes the same cart-item shapes and benefits from library `preloadedDetails`. |
| Admin Search Lab | stays on its own RPC methods (power tool) |

**Legacy fan-out status:** `searchAllProviders` is no longer called by any surface directly — its only caller is `unifiedPlantSearch.searchExternal`, i.e. it's now the engine behind the opt-in "search more databases" tier. `PlantSourcePicker` (a batch *name-resolver*, not a search box) still resolves names via the individual provider services; converting it to library-first resolution is a possible future enhancement, not part of the search-box consolidation.

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
- `src/components/library/LibrarySearchTab.tsx` — `/library` host
- `src/components/BulkSearchModal.tsx` — Add-to-Shed host (`multiSelect`)
- `src/lib/plantCatalogue.ts` — `libraryRowToPlantDetails` (shared library-row → `PlantDetails` mapper)
- `supabase/migrations/20260525120000_plant_library_search_extensions.sql` — relevance + fuzzy RPCs
- `supabase/migrations/20260628100000_plant_library_relevance_filtered.sql` — filtered relevance RPC
