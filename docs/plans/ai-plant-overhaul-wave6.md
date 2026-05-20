# Plan — AI Plant Overhaul Wave 6: Override flow (detach-on-edit + reset)

## Goal

Let users edit AI catalogue plants without breaking the auto-update loop for everyone else. This is the final piece of the read/write story — Wave 5 made updates visible, Wave 6 lets users opt out of them per plant.

Flow in plain words:

1. User opens a catalogue-tracking AI plant (a shallow fork, in today's data model) in Plant Edit Modal.
2. They change a care field — say "Watering — min days" from 2 to 4.
3. On save, a confirm modal appears: *"Editing this plant stops automatic care-guide updates for your home. You can reset it later to rejoin the catalogue (your edits would be lost)."*
4. On confirm: their edits save, `overridden_fields` records which fields they touched, the Wave 5 chip disappears for this plant, the source pill flips to "AI · Custom (your home's edits)".
5. If they later want catalogue updates back: **Reset to catalogue** button on the same modal restores the global's care data and re-attaches.

## Deferred-work register (carried forward from Wave 5)

Closed by Wave 6:
- Override semantics (D6.1 — new this wave): "AI · Auto-updating catalogue" vs "AI · Custom" chips, `<DetachConfirmModal>`, `<ResetConfirmModal>`, per-field overridden indicator.

Still open after Wave 6 (will be revisited in Wave 7's cleanup pass):

| # | Item | Status |
|---|------|--------|
| D2 | `PlantSearchModal` single-add AI branch pre-existing broken | Wave 7 |
| D3 | `inventory_items → global plant_id` refactor | Wave 7 decision |
| D4 | §13 Pass 2 backfill (per-home AI duplicate collapse) | Wave 7 |
| D6 | RLS prod smoke test after first deploy | Wave 7 |
| D7 | Seed orchestration bug (`09_cross_home_markers.sql`) | Wave 7 |
| D8 | Realtime sub on global AI plants for cross-device freshness/ack sync | Wave 7 |
| D9 | Per-field background highlight inside `ManualPlantCreation` | Optional polish |

## App-reference files consulted

- [99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — `forked_from_plant_id`, `overridden_fields`, fork semantics, the two existing RPCs (`fork_ai_plant_for_home`, `reset_ai_plant_fork`).
- [99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — confirms Wave 1's RLS already prevents users from updating AI globals; updates to home-scoped rows go through normal `home_members` checks.
- [08-modals-and-overlays/06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — current Care tab structure + the Wave 5 callout already in place.
- [docs/plans/ai-plant-overhaul.md §8.6](./ai-plant-overhaul.md) — original Case A / B / C design (Wave 6 scope).

## Design tension — re-examined

The original §8.6 design split the world into:

- **Case A (global, `home_id IS NULL`, `forked_from_plant_id IS NULL`)** — auto-updating
- **Case B (home fork)** — custom, has "Reset to catalogue"

But Wave 3's shallow-fork compromise means **every catalogue-add already creates a home-scoped row** (`home_id = X, forked_from_plant_id = global_id, overridden_fields = []`). The Plant Edit Modal will essentially never see a pure global, because The Shed only shows home-scoped rows.

So the practical Wave 6 model becomes:

- **"Catalogue-tracking" row** (the Wave 6 equivalent of Case A): `source = 'ai'` AND `(overridden_fields IS NULL OR overridden_fields = [])`. Includes shallow forks.
- **"Custom fork" row** (Case B): `source = 'ai'` AND `overridden_fields.length > 0`.

Editing a catalogue-tracking row triggers the detach confirm. The transition is **in-place** — we don't insert a new `plants` row, we just populate `overridden_fields` on the existing one. The `fork_ai_plant_for_home` RPC from Wave 1 is therefore **not called** in this flow — it was designed for a "global → new home row" transition that Wave 3 already pre-emptively did at catalogue-add time.

**Same logic for reset:** the existing `reset_ai_plant_fork` RPC deletes the home-scoped row and repoints inventory_items at the global. But TheShed reads `plants` filtered by `home_id = X`, so after reset the plant disappears from the shed entirely (we don't have D3's inventory-points-at-global refactor yet). That's the wrong UX.

So Wave 6 introduces an **in-place revert** instead of deleting: clear `overridden_fields`, restore care fields from the global's `care_guide_data`, seed the ack at the global's current version. The row stays in TheShed; future cron updates flow through again.

## What lands in Wave 6

### 1. New migration — in-place revert RPC

`supabase/migrations/20260622000000_ai_plant_revert_in_place.sql`

```sql
CREATE OR REPLACE FUNCTION public.revert_ai_plant_fork_in_place(p_fork_id integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fork_row    public.plants%ROWTYPE;
  parent_row  public.plants%ROWTYPE;
  caller_uid  uuid := auth.uid();
BEGIN
  IF caller_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO fork_row FROM public.plants WHERE id = p_fork_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fork_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF fork_row.source <> 'ai' OR fork_row.home_id IS NULL THEN
    RAISE EXCEPTION 'not_a_fork' USING ERRCODE = 'P0001';
  END IF;
  IF fork_row.forked_from_plant_id IS NULL THEN
    RAISE EXCEPTION 'no_parent_link' USING ERRCODE = 'P0001';
  END IF;

  -- Caller must belong to the fork's home.
  IF NOT EXISTS (
    SELECT 1 FROM public.home_members
     WHERE home_id = fork_row.home_id AND user_id = caller_uid
  ) THEN
    RAISE EXCEPTION 'not_a_home_member' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO parent_row FROM public.plants WHERE id = fork_row.forked_from_plant_id;
  IF NOT FOUND OR parent_row.source <> 'ai' OR parent_row.home_id IS NOT NULL THEN
    RAISE EXCEPTION 'parent_unavailable' USING ERRCODE = 'P0001';
  END IF;

  -- Restore care data from the parent + clear overrides + sync to current version.
  UPDATE public.plants SET
    care_guide_data         = parent_row.care_guide_data,
    sunlight                = parent_row.sunlight,
    watering                = parent_row.watering,
    cycle                   = parent_row.cycle,
    care_level              = parent_row.care_level,
    hardiness_min           = parent_row.hardiness_min,
    hardiness_max           = parent_row.hardiness_max,
    is_edible               = parent_row.is_edible,
    is_toxic_pets           = parent_row.is_toxic_pets,
    is_toxic_humans         = parent_row.is_toxic_humans,
    attracts                = parent_row.attracts,
    description             = parent_row.description,
    maintenance_notes       = parent_row.maintenance_notes,
    overridden_fields       = '[]'::jsonb,
    freshness_version       = parent_row.freshness_version,
    updated_care_fields     = NULL,
    last_care_generated_at  = parent_row.last_care_generated_at
  WHERE id = p_fork_id;

  -- Seed acks for every home member so no chip flashes immediately on rejoin.
  INSERT INTO public.user_plant_ack (user_id, plant_id, seen_freshness_version)
  SELECT hm.user_id, parent_row.id, parent_row.freshness_version
    FROM public.home_members hm
   WHERE hm.home_id = fork_row.home_id
  ON CONFLICT (user_id, plant_id) DO UPDATE
    SET seen_freshness_version = EXCLUDED.seen_freshness_version,
        acked_at = now();

  RETURN p_fork_id;
END;
$$;

REVOKE ALL ON FUNCTION public.revert_ai_plant_fork_in_place(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_ai_plant_fork_in_place(integer) TO authenticated;
```

**Why a new RPC instead of reusing `reset_ai_plant_fork`:** that one deletes the home-scoped row + repoints `inventory_items` at the global. Without D3's "shed shows globals" refactor, deletion makes the plant disappear from TheShed. The in-place revert is the forward-compatible behaviour for today's data model.

We **keep** `reset_ai_plant_fork` for the future when D3 lands — it'll become the correct primitive at that point. Wave 6 just uses `revert_ai_plant_fork_in_place` for now and documents the migration path.

### 2. New components

**`src/components/aiPlants/SourceChip.tsx`** — single source-of-truth pill for AI plants. Renders:
- "AI · Auto-updating catalogue" (amber) when `source = 'ai'` AND `overridden_fields` is empty/null.
- "AI · Custom (your edits)" (purple) when `source = 'ai'` AND `overridden_fields.length > 0`.
- `null` for non-AI plants.

**`src/components/aiPlants/DetachConfirmModal.tsx`** — small confirm modal with the warning copy. Two buttons: Cancel, "Save my edits". Returns `Promise<boolean>` via an onConfirm callback.

**`src/components/aiPlants/ResetConfirmModal.tsx`** — same shape, different copy: "Your edits will be lost…". Two buttons: Cancel, "Reset and rejoin".

### 3. New helper — `src/lib/aiPlantOverrides.ts`

Pure function `diffOverriddenFields(before, after)`:

- Inputs: two flat objects (the existing row's top-level columns + the form submission).
- Compares the set of editable AI care fields (the same set Wave 5's `CareUpdateCallout` uses — `STRUCTURED_CARE_FIELDS` from `_shared/aiPlantCatalogue.ts`, mirrored here on the client).
- Returns `string[]` of field names where the values differ (normalised: lowercase strings, sorted arrays — same rules as `diffCareGuide`).
- Used by the modal to (a) decide whether to fire the detach confirm at all, and (b) populate `overridden_fields` on save.

Vitest tests cover: no-change → empty array, scalar change, array change, case-insensitive comparison, sort-insensitive array comparison.

### 4. PlantEditModal integration

[src/components/PlantEditModal.tsx](../../src/components/PlantEditModal.tsx) changes:

- Replace the inline source chip (currently absent for AI) with `<SourceChip plant={plant}/>` in the header area, alongside the Wave 5 "catalogue updated N days ago" pill.
- **Intercept `onSave`** with a new `handleSaveWithOverride(payload)`:
  - Compute `addedOverrides = diffOverriddenFields(plant, payload)`.
  - **If** `plant.source === 'ai'` AND the row is catalogue-tracking (`overridden_fields` empty) AND `addedOverrides.length > 0`:
    - Open `<DetachConfirmModal>`. Cancel → bail out, no save. Confirm → call the parent `onSave` with `payload + { overridden_fields: addedOverrides }`.
  - **Else if** `plant.source === 'ai'` AND already a custom fork (`overridden_fields.length > 0`):
    - Merge new overrides into the existing list (de-duplicated): `payload.overridden_fields = unique([...plant.overridden_fields, ...addedOverrides])`. No modal needed — they've already opted out.
  - **Else** (`source !== 'ai'` OR no diff): pass `payload` to the parent `onSave` unchanged.
- **Reset button** in the Care tab footer when `plant.source === 'ai'` AND `overridden_fields.length > 0`:
  - Opens `<ResetConfirmModal>`. On confirm:
    - Call `supabase.rpc("revert_ai_plant_fork_in_place", { p_fork_id: plant.id })`.
    - On success: toast "Care guide restored" + close the modal (caller refreshes the shed list).
- **Overridden field summary** (header strip): when the fork has overrides, show a small "Overridden: Watering — min days, Sunlight" string above the form. This is the Wave 6 substitute for per-field "✎" badges — see deferred D9.

### 5. TheShed `handleUpdatePlant` update

[src/components/TheShed.tsx](../../src/components/TheShed.tsx):

- Extend the `cleanPayload` parameter shape to include `overridden_fields` (passed through from the modal). Currently the function destructures `{ instance_count, inventory_items, ...cleanPayload }` and updates everything in `cleanPayload`. Just need to make sure `overridden_fields` rides along when the modal sets it.
- No new logic — the modal does the diff + decision; this function still just runs the UPDATE.

### 6. Tests

**Vitest unit:**

- `tests/unit/lib/aiPlantOverrides.test.ts` — `diffOverriddenFields` semantics (6 cases as above).

**Vitest component (`.test.ts` via React.createElement, matching Wave 5 pattern):**

- `tests/unit/components/SourceChip.test.ts` — renders correctly for non-AI / catalogue / custom states.

**Deno SQL test (optional — defer if migration testing is complex):**

- Skipped this wave. The RPC is straightforward (membership check + bulk UPDATE + ack upsert) and runs through `revert_ai_plant_fork_in_place` paths that mirror the existing `reset_ai_plant_fork` we already have working in dev. We'll smoke-test the migration locally before commit.

**Playwright E2E:**

- `tests/e2e/specs/ai-plant-override.spec.ts` — three flows:
  1. Edit a catalogue-tracking plant → DetachConfirmModal appears → confirm → row is now Custom (source chip changes, Wave 5 chip suppressed).
  2. Edit a catalogue-tracking plant → DetachConfirmModal appears → cancel → no DB change (verified by reopening the modal and checking the chip is still present).
  3. On a custom fork → click Reset → ResetConfirmModal → confirm → care fields restored (sunlight changes back to seeded value).

Seed addition: extend [supabase/seeds/13_ai_freshness.sql](../../supabase/seeds/13_ai_freshness.sql) with one more plant — a Cherry Tomato with `overridden_fields = ["watering_min_days"]` already set, so the E2E has a pre-existing custom fork to reset.

### 7. Docs

- **[03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md)** — add `revert_ai_plant_fork_in_place` to the RPC table. Clarify the lifecycle: shallow fork → custom fork on edit → revert in-place.
- **[06-plant-edit-modal.md](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md)** — new section "Editing AI plants" describing the detach flow + reset button + the two source-chip states.
- **[10-edge-functions-catalogue.md](../app-reference/99-cross-cutting/10-edge-functions-catalogue.md)** — no new edge fn (RPC only), but cross-link `revert_ai_plant_fork_in_place` from the existing AI section.
- **[19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md)** — note the new SECURITY DEFINER function and the caller-membership check it enforces.
- **[ai-plant-overhaul.md](./ai-plant-overhaul.md)** — mark Wave 6 shipped. Final deferred-work register sets the agenda for Wave 7.
- **[e2e-test-plan.md](../e2e-test-plan.md)** — Section 24 added.
- **TESTING.md** — bump test counts.

## Out of scope for Wave 6 (Wave 7 territory)

- Per-field "✎ Overridden" badges inside `ManualPlantCreation` (still needs the form refactor that D9 covers).
- The pure-global "Case A" branch in the original §8.6 — moot because Wave 3's shallow forks mean the modal never sees a pure global. If D3 lands later and TheShed starts showing globals directly, this branch becomes relevant again and Wave 7 can wire it.
- Cross-device sync of the detach/reset state (relies on D8's realtime sub on globals — not blocking for single-device users).
- E2E for the "detach also fires from Instance Edit Modal" path — Wave 6 implements it in `PlantEditModal` only. Instance Edit Modal's Care Guide tab is read-only today, so there's no edit-then-save flow there to intercept.

## Files modified / created

| File | Type | Notes |
|------|------|-------|
| `supabase/migrations/20260622000000_ai_plant_revert_in_place.sql` | new | The in-place revert RPC. |
| `src/components/aiPlants/SourceChip.tsx` | new | "Auto-updating" vs "Custom" pill. |
| `src/components/aiPlants/DetachConfirmModal.tsx` | new | Confirm dialog. |
| `src/components/aiPlants/ResetConfirmModal.tsx` | new | Confirm dialog. |
| `src/lib/aiPlantOverrides.ts` | new | `diffOverriddenFields` helper. |
| `src/components/PlantEditModal.tsx` | edit | SourceChip in header, save interception, Reset button, overridden summary. |
| `src/components/TheShed.tsx` | edit | Allow `overridden_fields` in the update payload (just pass-through). |
| `supabase/seeds/13_ai_freshness.sql` | edit | Add a pre-customised plant for the reset E2E. |
| `tests/unit/lib/aiPlantOverrides.test.ts` | new | Diff semantics. |
| `tests/unit/components/SourceChip.test.ts` | new | Render variants. |
| `tests/e2e/specs/ai-plant-override.spec.ts` | new | Three flows. |
| `docs/app-reference/99-cross-cutting/03-data-model-plants.md` | edit | RPC table + lifecycle. |
| `docs/app-reference/08-modals-and-overlays/06-plant-edit-modal.md` | edit | Editing AI plants section. |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | edit | Cross-link the RPC. |
| `docs/app-reference/99-cross-cutting/19-rls-patterns.md` | edit | Note the new SECURITY DEFINER fn. |
| `docs/plans/ai-plant-overhaul.md` | edit | Mark Wave 6 shipped; final register. |
| `docs/e2e-test-plan.md` | edit | Section 24. |
| `TESTING.md` | edit | Test counts. |

## Process / verification

1. Write the migration. Apply locally with `supabase migration up`. Verify the RPC exists in `pg_proc`.
2. Build the helper + Vitest tests.
3. Build the chip + modals + Vitest tests.
4. Wire into PlantEditModal — manual visual verify in `npm run dev`:
   - Open Cherry Tomato (catalogue-tracking) → SourceChip says "Auto-updating".
   - Change Sunlight, click Save → DetachConfirmModal appears.
   - Cancel → no DB change. Confirm → save succeeds, chip flips to "Custom", Wave 5 update chip suppressed.
   - Click Reset → ResetConfirmModal → confirm → care fields restored, chip back to "Auto-updating".
5. Extend the seed; add the Playwright spec; run E2E once local DB is in the right state.
6. `npx tsc --noEmit` clean, Vitest green, Deno still green.
7. Update all docs.
8. Commit + push with `[skip ci]`. **No remote db push until user gives the go-ahead** — the RPC migration won't reach prod automatically.

## Risk register

| Risk | Mitigation |
|------|------------|
| User dismisses DetachConfirmModal accidentally → loses their changes | The form data is held in `ManualPlantCreation`'s internal state. Cancelling the modal keeps the form populated but unsaved. No data loss; user can re-submit. |
| User edits multiple fields before noticing the chip → all get added to `overridden_fields` | This is the intended behaviour — they edited them, they own them. |
| Reset triggered on a fork whose parent has been deleted | The RPC raises `parent_unavailable` → toast shows the error, no destructive action. Future: a Wave 7 admin tool could re-link orphan forks. |
| Race: user A in home edits plant → fork is now custom → user B in same home opens it before refresh and edits another field | B's open shows the row as "Custom" (overridden_fields already populated). B's edits merge into the list. No detach modal because already custom. Behaviour is correct. |
| `revert_ai_plant_fork_in_place` runs while another user in the home is editing → their unsaved form state is now stale | Same realtime sub gap as D8. Acceptable for Wave 6; we'll close in Wave 7 with the realtime sub. |
| The form payload contains fields not in our diff set, but they're still saved | That's fine — non-AI fields (e.g. `labels`, `thumbnail_url`) save normally without triggering the override flow. Only the fields in `STRUCTURED_CARE_FIELDS` count toward override detection. |
| Migration applied locally but never pushed → reset button 500s on remote | Local-first workflow per CLAUDE.md. `npm run deploy` will push it when ready. Documented in the commit summary. |
