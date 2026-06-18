# Ailment / pest / disease library (catalogue, like the plant library)

## Problem
We have a per-home **Watchlist** (`ailments` — user-tracked pests/diseases/
invasives), Perenual pest/disease search, and AI suggestions
(`generate-ailment-suggestions`) — but **no curated global catalogue** of
ailments the way `plant_library` is a catalogue of species. Users want a browsable,
consistent library of pests/diseases/invasives with symptoms, treatment and the
plants they affect.

## Current state (verified)
- `ailments` (home-scoped watchlist) + `plant_instance_ailments` + `area_scan_ailments`.
- No `ailment_library` table; no seeding pipeline for ailments.
- `plant_library` is the model to mirror: global catalogue + AI seeder/verifier
  (`seed-plant-library`, `verify-plant-library`), `plant_library_runs`,
  `_run_schedules`, `_batches`, `_source_cursors`, freshness versioning, admin UI.

## App-reference consulted
- [99-cross-cutting/06-data-model-ailments.md](../app-reference/99-cross-cutting/06-data-model-ailments.md)
  — ailments/watchlist data model.
- Plant Library admin + data-model references (the architecture to mirror) +
  [13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md),
  [10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md),
  [11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md).
- [06-watchlist] AilmentWatchlist + `LinkAilmentModal` — the consumer/browse + add flow.

## Approach (mirror the plant-library architecture)
1. **Schema** — `ailment_library` (global, like `plant_library`): `id`,
   `name`, `kind` (pest|disease|invasive|disorder), `scientific_name`,
   `aliases`, `symptoms` (jsonb/text[]), `causes`, `treatment`, `prevention`,
   `severity`, `affected_plant_types`/`affected_families`, `image_url`/`thumbnail_url`,
   `source` ('ai'|'perenual'|'manual'), freshness fields, `created_at`. Plus the
   pipeline tables mirrored as needed (`ailment_library_runs` etc.) — or reuse a
   generic run framework if one exists. RLS: public read (catalogue), service-role
   writes. Data-API grants.
2. **AI seeding pipeline** — `seed-ailment-library` / `verify-ailment-library`
   edge fns + a `_shared/ailmentLibrary` prompt + JSON schema (mirror the plant
   versions), with run-schedule cron + batching + source cursors. Optionally seed
   from Perenual pest/disease as a provider source, AI-fill the rest.
3. **Browse UI** — an `AilmentLibrary` surface (mirroring `GuideList`/plant browse):
   search + filter by kind/severity/affected plant, detail view, image.
4. **Watchlist integration** — "Add to watchlist" from a library entry pre-fills
   the `ailments` row (name/kind/symptoms/treatment); `LinkAilmentModal` can pull
   from the library. `generate-ailment-suggestions` can ground its output in the
   library for consistency.
5. **Tier/beta gating** — match the plant library's gating; likely behind a beta
   flag during rollout.

## Phasing (this is a mini-project)
- **Phase 1** — schema + AI seeder/verifier + a minimal seed run (no UI), behind beta.
- **Phase 2** — browse UI + detail view + watchlist "add from library".
- **Phase 3** — Perenual provider source + grounding `generate-ailment-suggestions`
  + Plant Doctor links into library entries.

## Files (Phase 1)
| File | Change |
|------|--------|
| `supabase/migrations/<ts>_ailment_library.sql` (new) | `ailment_library` (+ run tables); RLS + grants |
| `supabase/functions/_shared/ailmentLibrary*.ts` (new) | prompt + JSON schema + normalisers |
| `supabase/functions/seed-ailment-library/`, `verify-ailment-library/` (new) | seeder/verifier (mirror plant fns) |
| cron migration | run-schedule for the seeder (mirror plant_library) |

## Tests
- **Deno**: ailment-library contract tests (schema/normalise/dedup), mirroring
  `aiPlantCatalogue.test.ts`.
- **Vitest**: browse/list helpers + watchlist prefill mapping (Phase 2).
- e2e + test-plan: new `ailment-library` section.

## Risks
- Largest item — treat as its own project; reuse plant-library patterns heavily
  to de-risk (proven seeder/verifier/cron/freshness design).
- Content quality/safety — verifier step + severity/treatment validation;
  avoid unsafe chemical advice (guardrails in the prompt).
- Don't duplicate Perenual — use it as one source, AI-fill gaps.

## Docs to update
- New app-reference surface for the Ailment Library + admin; `06-data-model-ailments.md`;
  `10-edge-functions-catalogue.md`; `11-cron-jobs.md`; `13-ai-gemini.md`; watchlist refs.
