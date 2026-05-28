# Plan — Unified Plant Search (Design)

This is the **design** plan: what the search looks like, how the flow works, the data sources, tiering, and the back-end work needed. A **second plan** (later) will cover migrating every call site in the app to use it. Nothing here is built yet — this is for alignment.

---

## The problem with search today

Search is implemented per-surface (BulkSearchModal, PlantSearchModal, Library, Plant Doctor patient picker, Watchlist add, Shopping add, Planner). Each one calls `searchAllProviders` which fires **Perenual + Verdantly + AI in parallel**, gated by tier. Consequences:

- **Bottom-tier users get a thin experience.** Perenual is Botanist+, AI is Sage+ — so a Sprout user searching gets only Verdantly, which is patchy.
- **Every search costs** external API quota + (for AI) tokens, even for common plants.
- **No spelling tolerance** — a typo returns nothing.
- **Inconsistent** — each surface behaves slightly differently.

Meanwhile we now have a **well-populated `plant_library`** (local Postgres, ~tens of thousands of rows, full care fields, trigram-indexed `search_text`, relevance + fuzzy RPCs already built) that is **already readable by every authenticated user** (RLS `USING(true)`). It's free, instant, and gated by nothing. It should be the backbone of search.

---

## The two gardeners

**Sarah (amateur).** Types "tomato" or "lavender", not Latin. Makes typos ("rosemarry"). Doesn't know or care which database a result comes from — she wants a relevant list *now*, for free, and to tap one to add it. If she misspells, she needs "did you mean?". The library-first model means she always gets good results without hitting a paywall.

**Marcus (expert).** Types scientific names ("Lavandula angustifolia"), filters hard (hardiness zone, full sun, edible, evergreen). Wants breadth for rare cultivars the library may not have, and the ability to conjure a plant that isn't in any DB. He values exact-match ranking and the external/AI fallback — but only when he chooses to reach for it.

A single design serves both: **library-first for instant free relevance + filters + spelling (Sarah's whole journey), with opt-in "go wider" via external DBs and AI (Marcus's power tools).**

---

## Every data source we have (and when each should fire)

| Source | Cost | Gating today | Role in new design |
|--------|------|--------------|--------------------|
| **Plant Library** (local Postgres) | Free, instant | None (RLS open to all) | **Primary.** Every search hits this first, for everyone. Relevance-ranked + filterable + spelling-tolerant. |
| **Perenual** (commercial API) | API quota | Botanist+ | **Opt-in "search wider"** when the library is thin. Botanist+. |
| **Verdantly** (curated API) | API quota | All tiers | **Opt-in "search wider"**, merged with Perenual. |
| **AI on-the-fly** (`search-plants-ai` + `add-plant-to-library`) | AI tokens | Sage+ | **"Can't find it? Create with AI"** — enriches + inserts into the library (so it's then free for everyone forever). Sage+. |
| **Manual entry** | Free | All | Always-available ultimate fallback ("add it by hand"). |

**Key reframing:** external DBs + AI stop being *always-on parallel calls* and become *explicit, user-triggered "expand my search" actions*. This makes the common case free + instant, slashes API/AI cost, and makes the gating legible ("you've searched our library; upgrade to also search Perenual / create with AI").

---

## What the search looks like (UX)

A single shared `<PlantSearch>` surface (component) with this anatomy:

```
┌────────────────────────────────────────────┐
│  🔍 [ Search any plant…            ] [Filters ▾] │   ← input + filter toggle
├────────────────────────────────────────────┤
│  Did you mean "Rosemary"?  [Lavender] [Sage]   │   ← spelling chips (only when relevant)
├────────────────────────────────────────────┤
│  ● Tomato            Solanum lycopersicum  +   │
│  ● Cherry Tomato     Solanum lycopersicum  +   │   ← library results (relevance-ranked)
│  ● Tomatillo         Physalis ixocarpa     +   │
│  …                                             │
├────────────────────────────────────────────┤
│  Not what you wanted?                          │
│  [ 🌐 Search Perenual + Verdantly ]  (Botanist) │   ← opt-in expand (tier-gated)
│  [ ✦ Create "<query>" with AI ]      (Sage)     │
│  [ ✏️ Add manually ]                            │   ← always available
└────────────────────────────────────────────┘
```

### Flow

1. **Type → instant library results.** Debounced call to `search_plant_library_relevance(query, …)`. Relevance ranking: exact common-name → prefix → contains → trigram. Filters (if set) apply as structured WHERE clauses. Fast, free, for every tier.
2. **Spelling suggestions.** If the relevance search returns 0 (or very few) results, fire `search_plant_library_fuzzy(query, …)` and show the top 1–3 distinct names as "Did you mean?" chips. Tapping a chip re-runs the search with that term.
3. **Expand (opt-in).** Below the library results, persistent CTAs:
   - **Search Perenual + Verdantly** (Botanist+) → merges external results in, badged by source. For < Botanist, the button is an upgrade nudge.
   - **Create "\<query>" with AI** (Sage+) → runs AI enrichment, inserts into `plant_library` (reusing `add-plant-to-library`), and the new plant drops into the results as a normal library row. For < Sage, upgrade nudge.
   - **Add manually** (all tiers) → opens the manual entry form.
4. **Select → the embedding surface decides** what "select" means (add to Shed, pick a patient, add to a plan, add to shopping list…). The search component emits a normalised `PlantSelection`; each host wires the action.

### Filters

Reuse the filter set we already have (cycle, edible, sunlight, hardiness, etc.) but apply them against the **structured `plant_library` columns** rather than passing them to external APIs. This is more powerful and free. The filter panel keeps the design we like from the admin Search Lab. (Mobile scroll bug just fixed.)

### Relevance + spelling — already built

`search_plant_library_relevance` and `search_plant_library_fuzzy` (migration `20260525120000`) already do exactly the ranking + typo-tolerance we want. The fuzzy RPC IS the spelling-suggestion engine. The admin "Relevance" method the user likes is this exact RPC.

---

## Tier-by-tier experience (the big change)

| Tier | Library search + filters + spelling | Search Perenual/Verdantly | Create with AI | Manual |
|------|--------------------------------------|---------------------------|----------------|--------|
| **Sprout** | ✅ full | upgrade nudge | upgrade nudge | ✅ |
| **Botanist** | ✅ full | ✅ | upgrade nudge | ✅ |
| **Sage / Evergreen** | ✅ full | ✅ | ✅ | ✅ |

Sprout goes from "thin Verdantly-only search" to "full, fast, free search of the whole library with filters and spelling help" — a real upgrade for the free tier, exactly what the user asked for.

---

## Back-end work the design needs

1. **Add filter support to the relevance RPC.** `search_plant_library_relevance` is currently name-only. Add optional filter params (edible, cycle, sunlight contains, hardiness range, edible/toxic flags) as a new RPC `search_plant_library_relevance_filtered` (or extend signature). All filtering on indexed/structured columns.
2. **A "did you mean" helper.** Thin wrapper that calls the fuzzy RPC and returns deduped top names — could be client-side (call the existing fuzzy RPC) with no new SQL.
3. **No RLS change** — `plant_library` is already readable by all authenticated users.
4. **Reuse `add-plant-to-library`** (just shipped) for the AI "create" path — it already enriches + dedups + inserts.
5. **A unified client service** `unifiedPlantSearch.ts`: `searchLibrary(query, filters, page)`, `didYouMean(query)`, `searchExternal(query, filters)` (gated), `createWithAI(query)` (gated). Plus a shared `<PlantSearch>` component + a normalised `PlantSelection` result type.

---

## What this plan deliberately defers (to a second plan)

- **Migrating each call site** (BulkSearchModal, PlantSearchModal, Library, Plant Doctor patient picker, Watchlist add, Shopping add, Planner) to the shared component. That's the bigger lift and deserves its own plan once this design is locked.
- **Deprecating `searchAllProviders`** parallel-fan-out once all call sites move over.
- **Image handling** — library rows may lack thumbnails; the lazy image-fetch pattern from the admin tab carries over.

---

## Locked decisions (2026-05-28)

1. **Expand model: OPT-IN.** External DBs + AI are user-triggered "expand my search" buttons, not auto-parallel calls. Common case is free + instant; gating is legible.
2. **AI "create" inserts into the shared library.** A Sage user enriching a niche plant grows the library for everyone — it's free thereafter.
3. **Spelling trigger: 0 OR weak results.** Show "did you mean?" when relevance returns nothing, or only weak trigram-only (rank-3) matches.
4. **Empty query: gentle prompt.** Show a friendly prompt (optionally "popular this season") rather than a blank panel or recents.
5. **Friendly naming.** The wider search reads **"Search more databases"**, not "Search Perenual + Verdantly".

Design is locked. Implementation + migration is covered in [plant-search-overhaul-implementation.md](./plant-search-overhaul-implementation.md).
