# #10 — Discover: library-first + keep exclusions + Verdantly (gated)

## Problem / goal
`PlantSwipeDeck` (Garden Profile → Swipe / "Discover plants") sources from **AI** (`generate-swipe-plants`) + **Perenual**. Sprout tier (no source enabled) sees *"No plant data source is enabled."* Owner wants: use the internal **`plant_library`** instead of AI (primary, free for everyone), **add Verdantly**, **keep the owned/disliked exclusions**, and AI optional for higher tiers.

## Decisions (locked)
- **Library-first** — free for all tiers (unbreaks Sprout); **AI optional** (`aiEnabled`); **Verdantly behind the `enable_perenual` gate** (`perenualEnabled`).
- **Keep exclusions** — owned + disliked as **hard** filters in the RPC. Rotation-avoidance stays an AI-source nicety (family-based + soft; not ported to SQL — documented limitation).

## Approach
1. **Migration** `20261026000000_plant_library_swipe_sample.sql` — new **authenticated** RPC `plant_library_swipe_sample(p_home_id uuid, p_sample_size int, p_exclude_names text[])` → random full `plant_library` rows, excluding owned (`inventory_items.plant_name`) + disliked (`planner_preferences` negative `plant`) + provided seen names. `SECURITY DEFINER` + **same-home membership guard** (the exclusions reveal home data). `GRANT EXECUTE … TO authenticated`.
2. **`src/lib/librarySwipePlant.ts`** (NEW, pure) — `libraryRowToSwipePlant(row)` builds a `SwipePlant` (tagline + trait tags) from library columns.
3. **`PlantSwipeDeck`**:
   - `fetchLibraryBatch` (RPC → mapper) — **always on, primary**.
   - `fetchVerdantlyBatch` (`verdantly-search` `filter`, empty query, random page) — behind `perenualEnabled`.
   - `loadBatch`: library always + AI (`aiEnabled`) + Verdantly (`perenualEnabled`), interleaved. **Perenual dropped from the deck** (Verdantly is the gated provider now). Remove the "no source" error.
   - `SwipePlant.source`: `"library" | "ai" | "verdantly"`; source badge accordingly.

## Files
- `supabase/migrations/20261026000000_plant_library_swipe_sample.sql` (NEW)
- `src/lib/librarySwipePlant.ts` (NEW) + `tests/unit/lib/librarySwipePlant.test.ts`
- `src/components/PlantSwipeDeck.tsx`

## Docs
- `99-cross-cutting/25-plant-providers.md`, the Garden-Profile swipe reference, `17-tier-gating.md` (library Discover is free for all).

## Risks
- **DEFINER membership guard is mandatory** — without it, a non-member could infer a home's owned/disliked plants via exclusions.
- Verdantly `filter` with an empty query browses varieties by page — confirm it returns rows on-device.
- Apply the migration **locally first** (`supabase migration up`), never a reset.
