# Plan — Watchlist Add: tiered search (library → databases → Rhozly AI)

## Goal
Make the Watchlist "Add" flow work like the plant search:
1. Type a term → search the **ailment library** first; results show with a **Library** chip.
2. A **"Search more databases"** action → searches the Perenual pest/disease API.
3. At the bottom, **"Search with Rhozly AI"** → AI generates the full ailment, **saves it to
   the shared `ailment_library`** for future users, and adds it to the watchlist.
4. Remove the standalone **"Ask Rhozly AI"** (create-with-Rhozly) tab to declutter and match
   the plant pattern. Keep **Add manually** as a fallback.

## App-reference consulted
- [`06-ailments/…` Watchlist](docs/app-reference) + [`99-cross-cutting/06-data-model-ailments.md`](../app-reference/99-cross-cutting/06-data-model-ailments.md)
- [`25-plant-providers.md`](../app-reference/99-cross-cutting/25-plant-providers.md) (Perenual pest/disease), [`13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md), [`10-edge-functions-catalogue.md`](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)
- Plant pattern: `src/components/PlantSearchModal.tsx` + `src/components/shared/PlantSearch.tsx` + `src/lib/unifiedPlantSearch.ts`

## Current state
- `AddAilmentModal` (in `AilmentWatchlist.tsx`) has 3 tabs: `ai` (default) · `perenual` · `manual`.
- `ailmentLibraryService.ts` already has `fetchAilmentLibrary()` (fetches all; client filters),
  `mapLibraryToWatchlistPayload`, `addLibraryAilmentToWatchlist`.
- `PerenualService.searchPestDisease(q)` powers the database tier.
- `generate-ailment-suggestions` (AI) **reads** `ailment_library` for grounding + returns a
  `library_id` when a result already exists — but it **does not write** new entries.
- `ailment_library` is **read-only for `authenticated`** (writes are service-role only); unique
  generated `name_key`. So persisting an AI result needs a **service-role edge function**.

## Approach

### 1. New edge function `add-ailment-to-library` (service role)
Mirror of `add-plant-to-library`. Input: an AI-generated ailment (name, kind, scientific_name,
description, symptoms[], causes, treatment, prevention, severity, affected_plant_types[], …).
Upserts into `ailment_library` `ON CONFLICT (name_key)` (don't clobber a seeded row — only fill
nulls / insert new). Returns the library row (with `id`) so the client can add it to the
watchlist and show the Library chip next time. Pure mapper `_shared/ailmentLibraryMap.ts`
(AI suggestion → library row) — Deno-tested.

### 2. Restructure `AddAilmentModal` into a unified tiered search
Replace the `ai | perenual | manual` tab switcher with one search surface (keep the existing
Perenual + AI handlers + the manual builder; reuse `mapLibraryToWatchlistPayload`):
- **Search input** (autofocus) + debounced query.
- **Tier 1 — Library (always, free):** filter `fetchAilmentLibrary()` by name/aliases/scientific
  (new pure `filterAilmentLibrary(rows, q)` in `ailmentLibraryService.ts`). Each result shows the
  **Library** chip; tap → `addLibraryAilmentToWatchlist`.
- **Tier 2 — "Search more databases":** button under the library results → `searchPestDisease(q)`
  → results with the existing **Plant Database** chip → tap → existing Perenual add path.
- **Tier 3 — "Search with Rhozly AI ✦"** (gated by `aiEnabled`, bottom of the list): →
  `generate-ailment-suggestions` → for the picked result, call `add-ailment-to-library` (persist
  to the shared library) → then add to the watchlist (via the returned library row). Shows the
  Library chip thereafter.
- **"Add manually"** stays as a small secondary action (keeps the `StepBuilder` manual path).
- Remove the `ai`/`perenual` tabs + `mode` state; `aiEnabled` gates only the AI tier (the
  earlier `aiEnabled is not defined` bug area — now a single gated button).

### 3. Wiring / reuse
- Keep the Perenual mapping + the AI suggestion → watchlist payload already in the component.
- `aiEnabled` already plumbed (28.0022). The AI tier button is hidden/locked when false.

## Files
| File | Change |
|------|--------|
| `supabase/functions/add-ailment-to-library/index.ts` (new) + `config.toml` | service-role upsert into `ailment_library` |
| `supabase/functions/_shared/ailmentLibraryMap.ts` (new) | pure AI→library-row mapper |
| `supabase/tests/ailmentLibraryMap.test.ts` (new) | Deno tests |
| `src/services/ailmentLibraryService.ts` | `filterAilmentLibrary(rows, q)` + an `addAiAilmentToLibraryAndWatchlist` helper |
| `tests/unit/lib/…ailmentLibrary*.test.ts` | filter + mapping unit tests |
| `src/components/AilmentWatchlist.tsx` | replace tabs with tiered search; remove AI/perenual tabs |
| `docs/app-reference/06-…ailment-watchlist*.md` + `06-data-model-ailments.md` + `10-edge-functions-catalogue.md` | document the new flow + function |
| `docs/e2e-test-plan/…ailments` | update Add-flow rows |

## Tests
- Unit (Vitest): `filterAilmentLibrary` (name/alias/scientific, case-insensitive); AI→watchlist mapping.
- Deno: `ailmentLibraryMap` (AI suggestion → library row, dedup-safe nulls).
- `tsc` + `build` + `test:unit` + `test:functions` green.

## Risks / decisions
- **Scope:** this is a meaningful UI rewrite of `AddAilmentModal`. I'll reuse the existing
  Perenual/AI handlers rather than building a full shared `<AilmentSearch>` engine (a bigger
  refactor) — same UX, less churn. Can extract a shared engine later if desired.
- **AI→library dedup:** upsert on `name_key`, never overwrite a seeded row's populated fields
  (fill-nulls only), so the curated library stays authoritative.
- **Gating:** library + Perenual tiers are free; AI tier is AI-only (locked button → upgrade).
- **No migration** (uses existing `ailment_library`; service role already writes it via the seeder).

## Deploy
Deploy `add-ailment-to-library` + `generate-ailment-suggestions` (unchanged unless mapping
tweaks) → `deploy-app-only` → commit + push. No DB migration.
