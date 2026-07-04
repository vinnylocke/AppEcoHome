# Plant Sensor Requirements — surface, generate, and backfill soil ranges

## Goal (from the request)

1. A **new tab on the plant modal** showing a plant's **soil moisture**, **EC**, and **soil temperature** requirements (for now).
2. It should read the **existing tables we already use for the AI analysis** (not a new store).
3. Let a user **use AI to generate** this information for **API-sourced** and **AI-sourced** plants.
4. A **cron job + edge function** that ensures our **internal library** plants have this data, so once generated we **always have a record**.
5. The end use: feed **automation-suitability** decisions — sensor readings vs plant requirements.

## Headline finding — most of the backend already exists

Reading the code first (per the mandate) changes the shape of this substantially. The data model, the AI prompt/parser, the seeder, and a lazy backfill are **already built**. This feature is mostly a **UI surface + closing two gaps + one new dedicated cron**, not a greenfield build.

**Already in place — reuse, don't rebuild:**

| Piece | Where | Notes |
|-------|-------|-------|
| The 6 range columns on **both** `plants` and `plant_library` | `supabase/migrations/20260729000000_plant_care_ranges.sql:9-23` — `soil_moisture_min/max`, `soil_ec_min/max`, `soil_temp_min/max` (nullable numeric) | No new columns needed. Grants already exist. |
| The **AI generation prompt + schema + parser** (pure) | `supabase/functions/_shared/plantCareRangeGen.ts` — `CARE_RANGE_SCHEMA`, `buildPlantCareRangePrompt()`, `parseCareRangeResponse()` | Currently only *called* lazily inside `area-sensor-analysis`. Reuse verbatim for on-demand + cron. |
| **Library seeder** already asks Gemini for the ranges | `supabase/functions/seed-plant-library/index.ts` (daily 02:00 UTC) + `_shared/plantSeedPrompt.ts:57-62` | New library rows get ranges at seed time. |
| **Library verifier** cross-checks the ranges | `supabase/functions/verify-plant-library/index.ts` (weekly Tue 04:30 UTC, **currently paused**) | Sets `plant_library.valid` / `verified_at`; must not be clobbered. |
| **Lazy on-view backfill** for API plants | `area-sensor-analysis/index.ts:129-150, 167, 243-269` — resolves `plants.soil_*` from `plant_library` by `scientific_name_key`, and Gemini-fills ≤5 missing plants/run, persisting back to **both** tables | Already partially satisfies "generate for API plants" — but only when that plant is viewed inside an area analysis. |
| **Merge/resolution** logic | `supabase/functions/_shared/careRanges.ts:32-41` — `mergeCareRanges()` coalesces plant → library → null, per field | Server-side. |
| Area Coach **already grades fit** | `_shared/areaAnalysisPrompt.ts:346-352` returns per-plant `moisture_fit` / `temp_fit` / `ec_fit` (`good`/`low`/`high`) and an advisory `automation_review` | This is the current (advisory-only) "suitability" signal. |

**Genuine gaps this feature closes:**

- **G1 — No UI** anywhere shows a *single plant's* requirements. (The Area Coach shows them per-area, buried in analysis.)
- **G2 — AI-sourced plants get no ranges.** The care-guide schema (`plant-doctor/index.ts` `CARE_GUIDE_SCHEMA`) does **not** include the 6 soil fields, so a `source='ai'` catalogue plant is created with them NULL and only ever filled if it later happens to be resolved against a library match. The request explicitly wants generation "for … ai plants."
- **G3 — Generation is only lazy** (area-view triggered). There's no **on-demand** "generate for this plant now" from the UI, and no **dedicated library backfill cron** to guarantee coverage independent of who views what.

## App-reference consulted

- `docs/app-reference/08-modals-and-overlays/38-plant-detail-modal.md` — the tabbed modal to extend.
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` — documents the `soil_*` "ideal stable care ranges per species, populated by the plant-library AI seeder"; self-healing write-back.
- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` — `device_readings`, `soil_moisture_profiles`, `automation_suggestions`, area readings, **EC units caveat** (WH51 raw ADC vs WH52 calibrated µS/cm).
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`, `11-cron-jobs.md`, `13-ai-gemini.md` — edge-fn + cron + Gemini conventions.
- Cross-cutting to touch at implementation: `13-ai-gemini.md` (new AI action), `17-tier-gating.md` (is on-demand AI gated?).

Source read end-to-end: `PlantDetailModal.tsx` (tabs at `:21`, `:23-28`, `:47`, content switch `:135-196`), `plantCareRangeGen.ts`, `careRanges.ts`, `area-sensor-analysis/index.ts`, `refresh-stale-ai-plants/index.ts` + `20260621000000_refresh_stale_ai_plants_cron.sql` (the cron pattern to copy), `AreaAiAnalysisPanel.tsx:40,237` (the `fmtRange` display pattern).

---

## Proposed changes

### Part 1 — UI: a "Soil Requirements" tab on `PlantDetailModal` (closes G1)

- Extend the tab union (`PlantDetailModal.tsx:21`), add one `TABS` row (`:23-28`), and one branch in the content switch (`:135-196`). Icon: `Droplet`/`Gauge`.
- New `src/components/SensorRequirementsTab.tsx` reading `plant.soil_moisture_min/max`, `soil_ec_min/max`, `soil_temp_min/max`. Reuse the display idiom from `AreaAiAnalysisPanel.tsx:40,237` (`fmtRange(min,max,unit)`): three rows — **Soil moisture** (`%`), **EC** (`µS/cm`), **Soil temperature** (`°C`) — each showing the min–max band.
- **Empty state** when all/most are null: a short explainer + a **"Generate with AI"** button (Part 2). If some are null and others set (mixed), show what exists and offer to fill the rest.
- **`data-testid`s** on the tab, each range row, and the generate button.
- Copy note: label EC clearly as µS/cm (calibrated) so it reconciles with the units caveat (Open Q4).

*Open question O1:* which surface(s)? `PlantDetailModal` is the clear tabbed modal (search/preview + library). Do you also want the tab on the **owned-plant** detail (The Shed) so it shows for plants you already grow? Recommend: `PlantDetailModal` now; add to the owned-plant view as a fast follow if wanted.

### Part 2 — On-demand generation for a single plant (closes G3, and G2 for AI plants)

- New edge function **`generate-plant-sensor-ranges`** (or an action on an existing plant fn). Input: a catalogue plant id (or `{common_name, scientific_name}`). It:
  1. `requireAuth` → `guardAiByUser` → `enforceRateLimit` (per `13-ai-gemini.md`).
  2. Reuses `buildPlantCareRangePrompt()` + `CARE_RANGE_SCHEMA` + `parseCareRangeResponse()` from `plantCareRangeGen.ts` via `callGeminiCascade` (cheap default model cascade).
  3. Persists to `plants.soil_*` (and, when the plant maps to a `plant_library` row by `scientific_name_key` **and** that row is missing values, to `plant_library.soil_*` — never overwriting `verified`/`valid` library values, Open Q5).
  4. `logAiUsage(...)` with the user/home for attribution.
- The tab's "Generate with AI" button calls this and optimistically shows the result.
- **G2 (AI plants at creation):** the cleanest fix is to **extend the care-guide generation** (`plant-doctor` `generate_care_guide`) so a newly-created `source='ai'` catalogue plant gets its 6 ranges at birth — either by adding the 6 fields to `CARE_GUIDE_SCHEMA`, or by chaining a `generate-plant-sensor-ranges` call right after the care-guide insert. Recommend chaining (keeps the care-guide schema focused, reuses the tested range prompt). *Open Q2.*

### Part 3 — Dedicated backfill cron for the internal library (closes G3 for library)

- New edge function **`backfill-plant-sensor-ranges`** (service-role; no JWT — invoked by cron like `refresh-stale-ai-plants/index.ts`):
  - Select `plant_library` rows where any of the 6 columns `IS NULL`, bounded batch (env `BACKFILL_BATCH_SIZE`, default 25), oldest/most-viewed first.
  - Generate via the shared helper; `UPDATE` only the NULL columns; **skip rows already `verified`/`valid=true`** to respect the verifier (Open Q5).
  - Optionally also sweep `plants` where `source IN ('api','ai','verdantly') AND home_id IS NULL AND soil_* IS NULL` (the global catalogue), so every catalogue plant converges to having a record even if never viewed in an area analysis.
  - `logAiUsage` at **system level** (`user_id: null, home_id: null`) — matches `refresh-stale-ai-plants` cost attribution.
- New **pg_cron migration** copying `20260621000000_refresh_stale_ai_plants_cron.sql:15-28` (pg_net `http_post` to the function). Cadence: daily, **staggered** off the existing 02:00 seeder / 03:00 profiles / 03:30 suggestions crons — e.g. **03:45 UTC**. Idempotent; safe to re-run.
- **Note on non-duplication:** the seeder already fills ranges for *new* library rows; this cron is the **belt-and-braces sweep** for older/missed rows and for the global `plants` catalogue. It must not re-generate rows that already have values.

### Part 4 — Automation suitability (the downstream "why") — **flag as a separate follow-up**

Today this is **advisory only**: the Area Coach returns `moisture_fit/temp_fit/ec_fit` + an `automation_review` narrative (`areaAnalysisPrompt.ts:346-368`); nothing enforces it. The condition-tree evaluator (`_shared/conditionTree.ts:27-40`, `automationEvaluator.ts:52-95`) fires on **raw** `sensor` thresholds with no plant awareness.

Once requirement coverage is solid (Parts 1–3), the enforcement path is one of:
- **(a) A `plant_requirement` condition leaf** — resolve a plant's ideal range at eval time and compare (`inside_range`/`below`/`above`). Deterministic, first-class.
- **(b) A suitability check / pattern** extending `patterns/soilDrydownWatering.ts:19-90` to flag "this area's watering automation threshold sits below the plants' `soil_moisture_min`."
- **(c) Prefill** the automation builder's sensor-threshold `value` from the area's plants' ideal band midpoint instead of free text.

Recommend scoping this as its own plan after Parts 1–3 land (it needs the EC-unit reconciliation, Open Q4, resolved). Calling it out here so the data we generate is shaped to serve it.

---

## Data model

- **No new columns required** — reuse the 6 `soil_*` on `plants` + `plant_library`.
- *Optional (Open Q3):* a `plants.sensor_ranges_generated_at` / provenance flag so the UI can show "generated by AI on <date>" and the backfill cron can re-check stale rows. Small additive migration if wanted (with the mandatory grants).
- No new table. No new RLS (reads ride existing plant/library policies; writes are service-role via edge fns).

## Tests (mandatory)

- **Deno** (`supabase/tests/`): the backfill **selection predicate** (which rows qualify: null-range, not-verified) and the persist rule (only fill NULLs, don't clobber verified) as pure functions; the reuse of `parseCareRangeResponse` on a sample payload. `plantCareRangeGen` may already have coverage — extend, don't duplicate.
- **Vitest** (`tests/unit/lib/`): a small pure `formatSensorRange`/tab-view-model helper (band text, empty vs partial vs full states).
- **Playwright** (`tests/e2e/`): the Soil Requirements tab renders on `PlantDetailModal`, shows the three bands for a seeded plant with ranges, and shows the empty state + "Generate with AI" button for one without. Add a seeded catalogue plant with known ranges to the fixtures if none exists (`docs/e2e-test-plan/01-seeded-fixtures.md`).

## Docs to update (same task as code)

- `08-modals-and-overlays/38-plant-detail-modal.md` — new tab (both roles), its data source + generate action.
- `03-data-model-plants.md` — note the new UI surface + on-demand generation path (the columns are already documented).
- `10-edge-functions-catalogue.md` — `generate-plant-sensor-ranges` + `backfill-plant-sensor-ranges`.
- `11-cron-jobs.md` — the new backfill cron (schedule, batch, system-level cost).
- `13-ai-gemini.md` — the new AI action (model cascade, rate limit, usage logging).
- `docs/e2e-test-plan/` + `TESTING.md` counts for the new specs.

## Decisions (approved 2026-07-04)

- **O1 — Surfaces:** ✅ Both — `PlantDetailModal` **and** the owned-plant detail in The Shed.
- **O2 — AI plants at creation:** ✅ **Chain** a range-generation call after the care-guide insert (leave `CARE_GUIDE_SCHEMA` unchanged).
- **O4 — EC units:** ✅ Record/display µS/cm now; defer raw-ADC-vs-calibrated reconciliation to the Part 4 suitability plan.
- **O6 — Tier gating:** ✅ Viewing ranges = all tiers; on-demand AI **generation** gated to `aiEnabled`.
- **O7 — Part 4 (automation suitability):** ✅ Separate **later** plan, not this pass.
- **O3 — Provenance column:** deferred — not adding `sensor_ranges_generated_at` in this pass (backfill selects on NULL columns; UI shows a generic "generated by AI" note). Revisit if staleness re-checks are wanted.
- **O5 — Overwrite policy:** only fill NULL columns in the cron/chain paths and **never clobber** `plant_library` rows the verifier marked `valid`/`verified`; the user-triggered "Generate with AI" button may regenerate an already-filled plant on the `plants` catalogue (explicit user action) while leaving verified library provenance intact.
- **Cost/rate:** the backfill cron is bounded per run (batch size) + system-attributed; daily cadence bleeds through the catalogue gradually rather than a spike.
