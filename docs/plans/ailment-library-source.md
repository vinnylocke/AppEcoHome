# Add `library` as a first-class ailment source

## Problem
A Sprout user's main ailment source is the **Library** (the seeded `ailment_library`), but `addLibraryAilmentToWatchlist` persists it as `source: "ai"` — indistinguishable from a real AI-generated ailment. On a no-AI Sprout account that's wrong (looks like AI content), and it breaks the product's manual/library/perenual/ai source model. Plants don't have this problem (library plants are global-catalogue rows marked by `home_id IS NULL`); ailments are always home-scoped, so they need a real source value.

## Goal
Make `library` a valid, distinct ailment source so library-added ailments are labelled correctly (Library badge, not AI), for every tier.

## App-reference consulted
- `docs/app-reference/99-cross-cutting/25-plant-providers.md` (just corrected)
- `docs/app-reference/99-cross-cutting/06-data-model-ailments.md`
- the Ailment Watchlist surface reference

## Changes
1. **Migration** `…_ailment_source_library.sql` — drop + re-add `ailments_source_check` to allow `('manual','perenual','ai','library')`. Additive + safe; no new Data-API grants (existing table). Apply locally first, push to prod on confirmation.
2. **`src/services/ailmentLibraryService.ts`** — the library-add payload `source: "ai"` → `source: "library"` (and the `LibraryAilment` payload type).
3. **`src/components/AilmentWatchlist.tsx`** — add `"library"` to the `Ailment.source` union; render a **Library** badge for it (the `Library` lucide icon is already imported); make sure any source-based filtering/grouping handles it. The Perenual/AI/manual paths are unchanged.
4. **Audit** — grep every `source ===`/source switch on ailments (badges, filters, `getProviderPlantDetails`-style lookups) and add the `library` case so nothing falls through.
5. **Seed** — `AILMENT_LIBRARY_SOURCE = "library"`; re-seed the Sprout prod account so its 5 library ailments read `library`.
6. **Tests** — extend the ailment-source unit/Deno coverage with a `library` case; update any Page Object/badge assertions.
7. **Docs** — update `25-plant-providers.md` (ailment library source is now `library`, not `ai`), `06-data-model-ailments.md`, the watchlist reference, and `TESTING.md`.

## Notes / risks
- **No historical backfill.** Existing ailments stored as `ai` that were really library adds stay `ai` — we can't reliably tell old library-from-AI rows apart, and mislabelling genuine AI rows would be worse. New adds use `library`. (The test account is re-seeded, so it's clean.)
- The biggest risk is a missed `source ===` branch somewhere rendering `library` as “unknown”; the audit step (4) covers that.
- Plants are intentionally **left as-is** (library plants are global `ai` rows, correctly distinguished by `home_id IS NULL`) — this change is ailments-only. Say if you want plants unified onto a `library` value too (bigger: touches the global-catalogue clone path).

## Deploy
Migration + 2 source files + tests/docs → `npm run deploy` (bump 1), then re-run the seed for the Sprout account.
