# Plan — AI Plant Overhaul Wave 7: Cleanup pass

## Goal

The original 6-wave plan is feature-complete. Wave 7 closes the deferred-work register accumulated through Waves 1–6 and gets the AI catalogue feature production-ready.

This is a "polish + paydown" wave, not a new-feature wave. Every item is small-to-medium effort with clear value. Strategic / large-cost items get an **explicit deferral decision** so the register is finally empty.

## Deferred-work register — scoping decisions

| # | Item | Wave 7 decision |
|---|------|-----------------|
| D2 | PlantSearchModal single-add AI branch pre-existing broken | **DO** — small, visible bug fix |
| D3 | `inventory_items → global plant_id` refactor | **DEFER** — strategic, needs prod data and a product call |
| D4 | §13 Pass 2 backfill (per-home AI duplicate collapse) | **DEFER** — only meaningful once prod has duplicate AI rows |
| D6 | RLS prod smoke test after first deploy | **DOCUMENT** — manual post-deploy step, can't pre-flight |
| D7 | Seed orchestration bug | **DO** — blocks `npm run test:seed` from a fresh DB |
| D8 | Realtime sub on global AI plants | **DEFER** — page-load refresh is acceptable today |
| D9 | Per-field background highlight in `ManualPlantCreation` | **DO** — finishes Wave 5's UX |
| D10 | Edit-then-save AI flow in Instance Edit Modal | **WONTFIX** — single edit entry point is clearer UX |

After Wave 7 ships, the register is closed. Anything still flagged "DEFER" graduates out of this feature's scope and becomes regular product backlog.

## App-reference files consulted

- [03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — confirms `forked_from_plant_id` lifecycle is unchanged by Wave 7.
- [08-modals-and-overlays/05-plant-search-modal.md](../app-reference/08-modals-and-overlays/05-plant-search-modal.md) — current behaviour of `handleAddToShed` (Verdantly + Perenual only).
- [08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — current Care tab structure + Wave 5/6 integrations.
- [08-modals-and-overlays/08-instance-edit-modal.md](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — confirms Care Guide tab is read-only (no `onSave` passed in).
- `scripts/seed-test-db.mjs` + `supabase/seeds/09_cross_home_markers.sql` — seed orchestration mechanics.
- `src/components/PlantSearchModal.tsx` lines 243–362 — the broken Add-to-Shed branch.
- `src/components/ManualPlantCreation.tsx` — the form into which per-field highlighting needs to thread.

## What lands in Wave 7

### 1. D7 — Seed orchestration bug

`scripts/seed-test-db.mjs` currently iterates `for w = 1..N; for each seed file`. That ordering means `09_cross_home_markers.sql` (which inserts rows into W2's home, hardcoded) runs during W1's pass before W2 is bootstrapped → FK violation → seed run aborts.

**Fix:** invert the loop so all worker bootstraps land first, then all subsequent seeds run per-worker. Specifically:

1. First pass: run `00_bootstrap.sql` for every worker.
2. Second pass: run all remaining seeds (`01_*` through `13_*`) per worker.

This is a 6-line script change. `09_cross_home_markers.sql` keeps its hardcoded `00000002-...` references and works as designed.

### 2. D2 — PlantSearchModal AI Add-to-Shed branch

`handleAddToShed` in [src/components/PlantSearchModal.tsx](../../src/components/PlantSearchModal.tsx) currently has two branches:

- `isVerdantly` (when `previewPlant.source === "verdantly"`)
- else (assumed Perenual — uses `previewPlant.perenual_id`)

When the user picks an AI search result and clicks "Add to Shed", the else branch fires with `perenual_id = undefined`. The insert builds a malformed row (`source: "api"`, `perenual_id: "undefined"`) — pre-existing bug from before the AI search results were added.

**Fix:** add a third branch matching Wave 3's bulk-add behaviour:

- `isAi` (when `previewPlant.source === "ai"`)
- Skeleton: `source: "ai"`, NO `perenual_id` / `verdantly_id`, copy of the AI care fields.
- When `previewPlant.db_plant_id` is present (forwarded from Wave 3's hook), also set `forked_from_plant_id = db_plant_id`, `overridden_fields = []` to register the row as a shallow fork — same shape Wave 3's bulk-add produces.
- Duplicate check uses `common_name` (case-insensitive) + `home_id` since AI plants don't have a stable provider ID. Matches Wave 3's `ilike(common_name)` check in TheShed.

### 3. D9 — Per-field highlight in `ManualPlantCreation`

Wave 5's `<CareUpdateCallout>` lists changed field names as chips. Wave 5's plan deliberately deferred the per-field background highlighting inside the form because the form's MultiSelect / scalar input structure didn't expose hooks.

**Fix:** thread two optional props through `ManualPlantCreation`:

- `highlightedFields?: string[]` — fields to render with a yellow background + small "Updated" badge next to the label.
- `overriddenFields?: string[]` — fields to render with a purple background + small "Custom" badge next to the label.

Applied where each field's label is rendered. Field names match the `OVERRIDABLE_CARE_FIELDS` set from Wave 6. PlantEditModal passes `freshness.updated_care_fields` and `plant.overridden_fields` down respectively.

Visual hierarchy: a field that's BOTH updated AND overridden shows the purple custom indicator (it's the more permanent state).

### 4. D6 — RLS prod smoke test (documentation)

Wave 1 tightened the `plants` UPDATE policy to deny user-context updates on AI globals. We haven't verified this on remote yet because the migrations are local-only.

**Decision:** add a post-deploy smoke-test checklist to `docs/plans/ai-plant-overhaul.md` § "Wave 7 — Post-deploy gates". After `npm run deploy` lands the cron + RPCs + RLS changes:

1. Sign in as a real user, open the Audit Log, attempt to `UPDATE` a global AI plant row via the JS console (`supabase.from("plants").update({ care_level: "test" }).eq("id", <global_id>)`). Expect: empty result / RLS rejection.
2. Verify the `refresh-stale-ai-plants` cron has fired at least once (check `ai_usage_log` for a row with `function_name = "refresh-stale-ai-plants"`).
3. Trigger the manual refresh button on a global AI plant in Plant Edit Modal (Sage+ account). Verify a `plant_care_revisions` row lands on the global.
4. Trigger detach + reset on a shallow fork. Verify `overridden_fields` populates then clears.

This isn't code — it's a runbook entry. No Wave 7 commit can verify it.

### 5. D3 / D4 / D8 — Deferred with rationale

- **D3 (inventory_items refactor):** Today's shallow-fork model works. Migrating `inventory_items` to point at global plant_ids when possible would cut row counts but adds significant migration risk and rework on TheShed's queries (which filter by `plants.home_id`). Worth doing only when a measurable data-bloat or query-perf signal appears in prod.
- **D4 (§13 Pass 2 backfill):** Only meaningful when prod has multiple per-home AI plants with the same `scientific_name_key`. We don't have prod AI data yet. When we do, run the backfill as a one-shot script (the design plan describes it in detail at §13 Pass 2).
- **D8 (realtime on globals):** The cron runs daily on rows changing every ~90 days. Cross-device freshness sync would be nice (acknowledge on phone → chip clears on desktop instantly) but page-load refresh already catches the change. Pure polish; revisit if multi-device users actually report stale chip behaviour.

Wave 7 marks all three as **deferred indefinitely** unless a future need surfaces. They are no longer tracked in the active register — when they come up they get their own dedicated plan.

### 6. D10 — Instance Edit Modal edit flow (wontfix)

The Care Guide tab in `InstanceEditModal` is intentionally read-only. Editing care fields affects the species record (`plants` table), not the inventory item. Having two edit entry points (Plant Edit Modal AND Instance Edit Modal Care Guide) would just confuse users about which scope they're modifying.

**Decision:** keep the tab read-only. Document the rationale in `docs/app-reference/08-modals-and-overlays/08-instance-edit-modal.md`:

> The Care Guide tab is read-only by design. To edit the underlying species record, open the parent plant from The Shed — there's a single, clear entry point for plant-level edits.

The Wave 5 freshness callout still appears here; "Mark as reviewed" still works. Only editing is owned by Plant Edit Modal.

## Tests

- **Vitest:** no new test files in Wave 7. The fixes touch existing surfaces.
  - `tests/unit/lib/aiPlantOverrides.test.ts` — no change (helper is unchanged).
  - Existing tests should pass unchanged. Wave 7 doesn't add new behaviour to test units of.
- **Playwright:**
  - Extend `tests/e2e/specs/ai-plant-override.spec.ts` with one new case verifying the per-field highlight appears on the form's labelled inputs when `overridden_fields` is set (visible asserting via `data-testid="form-field-overridden-watering_min_days"` on the affected input wrapper).
- **Seed orchestration:** after the D7 fix, `npm run test:seed` from a fresh `supabase db reset --local` should succeed end-to-end. We verify by running it locally before commit.

## Files modified / created

| File | Type | Notes |
|------|------|-------|
| `scripts/seed-test-db.mjs` | edit | Two-pass seed orchestration (D7). |
| `src/components/PlantSearchModal.tsx` | edit | New `isAi` branch in `handleAddToShed` (D2). |
| `src/components/ManualPlantCreation.tsx` | edit | New `highlightedFields` + `overriddenFields` props + per-field badge rendering (D9). |
| `src/components/PlantEditModal.tsx` | edit | Pass the two prop sets down (D9). |
| `tests/e2e/specs/ai-plant-override.spec.ts` | edit | One new assertion for per-field highlight. |
| `docs/app-reference/08-modals-and-overlays/08-instance-edit-modal.md` | edit | D10 wontfix rationale. |
| `docs/app-reference/08-modals-and-overlays/05-plant-search-modal.md` | edit | D2 fix documented. |
| `docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md` | edit | D9 per-field highlight noted. |
| `docs/plans/ai-plant-overhaul.md` | edit | Wave 7 marked shipped; final post-deploy checklist; deferral decisions on D3/D4/D8. |
| `docs/plans/ai-plant-overhaul-wave7.md` | new | This plan. |

No migrations. No new edge functions. No new RPCs.

## Process / verification

1. **D7 first** — fix the seed script, run `supabase db reset --local && npm run test:seed --workers 1` and `--workers 4` to verify both modes work.
2. **D2** — fix `PlantSearchModal`, manually test in `npm run dev` by searching an AI plant and adding it. Verify the row lands with `source = "ai"` + correct shallow-fork link when the AI catalogue is hit.
3. **D9** — thread the props through `ManualPlantCreation`, visually verify in `npm run dev` against the seeded "Lavender" custom fork (purple highlight on `watering_min_days`) and the seeded "Cherry Tomato" shallow fork (yellow highlight on `sunlight` + `watering_min_days` after Wave 5 chip is showing).
4. Update docs in the same task.
5. `npx tsc --noEmit` clean, Vitest still 330/330, Playwright spec extension passes.
6. Commit + push with `[skip ci]`. No remote db push needed (no migrations).

## Risk register

| Risk | Mitigation |
|------|------------|
| D7 fix breaks current per-worker isolation in seed data | The fix is loop-order only. Per-worker substitutions (UUID prefix, email, plant IDs) still happen in pass 2. Verify by inspecting `auth.users` + `homes` rows for each worker after the fix. |
| D2 fix creates duplicate AI rows when user adds the same AI plant from BulkSearch then PlantSearchModal | The new branch's duplicate check uses `home_id + common_name (ilike)`, matching Wave 3's bulk-add. Both paths converge on the same shallow-fork pattern. |
| D9 highlighting flickers because `freshness.updated_care_fields` is fetched async | Form already loads + re-renders without the highlight first. Adding it once data arrives is a smooth fade-in, not a flicker. If it bothers a reviewer, we can gate render on `freshness != null`. |
| Per-field badges break form layout on mobile | Badges are small inline pills next to the label, not separate elements. Layout already wraps. Will verify visually before commit. |
| D10 wontfix decision frustrates future contributors | The decision is documented in the modal's app-reference doc + this Wave 7 plan. If someone wants to revisit it later, they have the rationale to argue against. |
