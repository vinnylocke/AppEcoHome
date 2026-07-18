# Garden Walk — bed profile capture (pH, peak light, water movement, nutrient source) + EC reading

**Date:** 2026-07-18 (revised same day — supersedes the v1 draft below the fold)
**Goal:** From a walk area card, capture the fields the user sees under Location management →
area → Advanced settings — **Medium pH, Peak light, Water movement, Nutrient source** — plus EC
in the existing reading fields. Better structured soil data for the AI phase later.

## What those fields actually are (changes the whole shape)

They are **static columns on `areas`** edited via `AreaAdvancedFields` inside Area Details'
edit-area modal (`src/components/AreaDetails.tsx:930`, saved by `handleUpdateArea()` →
`areas.update`):

| Field | Column | Input |
|---|---|---|
| Medium pH | `areas.medium_ph` | number 0–14 (step 0.1) |
| Peak light | `areas.light_intensity_lux` | number (lux) — backed by `area_lux_readings` time-series (`AreaLuxReadings.tsx`: insert reading + bump column to freshest) |
| Water movement | `areas.water_movement` | select: Well-Drained / Low-Drained / Recirculating / Static |
| Nutrient source | `areas.nutrient_source` | select: Organic Breakdown / Synthetic / Biowaste |

**Consequence: no migration, no new tables.** The v1 plan's `area_ph_readings` design is dropped
— "pH" meant `areas.medium_ph`, which already exists. The only time-series involved is the
existing `area_lux_readings` (peak light), mirrored from the established behaviour.

## App-reference files consulted

- `docs/app-reference/02-dashboard/13-garden-walk.md` (walk card + reading-sheet contract)
- `docs/app-reference/03-garden-hub/04-area-details.md` + `03-location-manager.md` (advanced fields surface)
- `docs/app-reference/07-management/07-integrations-readings.md`, `99-cross-cutting/09-data-model-integrations.md` (readings model)
- Code-level trace: `AreaAdvancedFields.tsx`, `AreaDetails.tsx` save path, `AreaLuxReadings.tsx`
  lux write path, `area-sensor-analysis` + `agent-chat/context.ts` AI reads.

**AI grounding facts:** `area-sensor-analysis` already grounds on `growing_medium` +
`medium_ph`; **peak light already grounds five AI functions** (`generate-landscape-plan`,
`generate-plant-first-plan`, `generate-swipe-plants`, `optimise-area-ai`,
`suggest-rotation-plants` — via `_shared/luxBand.ts`) but not the Area Coach; `agent-chat`
context carries area id/name only. Part B below wires `water_movement`, `nutrient_source`, and
`light_intensity_lux` into the two remaining AI surfaces (user request, second revision).

## Design

**One sheet, two sections.** The walk's existing **Log reading** sheet (`WalkReadingSheet`)
gains a second, collapsed-by-default **"Bed profile"** section under the reading fields — one
button on the area card, one save action, no new card clutter:

- **Readings section (stamped now):** moisture %, temp °C — **plus EC (µS/cm)** (the message-1
  ask; posts with `ec_source: "calibrated_us_cm"` — a human typing EC read a handheld meter;
  raw-ADC + backdating stay in the full LogReadingModal).
- **Bed profile section (durable characteristics):** the quartet, **prefilled with current
  values** so the gardener sees what's set and adjusts. On open, the sheet fetches
  `medium_ph, light_intensity_lux, water_movement, nutrient_source` fresh from `areas`
  (one small select — no threading through the walk-route composition, always current).
- **Save behaviour:** filled reading fields → `logManualReading` (unchanged path); *changed*
  profile fields → one `areas.update` with only the diff; a peak-light change additionally
  inserts an `area_lux_readings` row stamped now + bumps `light_intensity_lux` (exactly what
  `AreaLuxReadings` does). Save enabled when any reading is filled OR any profile field changed.
  A successful save fires the existing `onLogged` walk bookkeeping once.
- Persona helper text for new gardeners (pH: "6.0–7.0 suits most plants"; EC: "most veg beds
  read 200–1200 µS/cm"); selects reuse the exact option values from `AreaAdvancedFields` (they
  are stored strings — must match or we'd corrupt the field).

## Source changes

1. **`src/lib/walkBedProfile.ts`** (new, pure) — `buildBedProfilePatch(current, inputs)`:
   returns only changed fields (null for cleared, skip unchanged, `{}`→no-op), plus
   `validateBedProfile` (pH 0–14 finite; lux positive finite). Keeps the sheet logic testable.
2. **`src/services/areaReadingsService.ts`** — no change needed for profile fields (they're an
   `areas.update`, not readings). EC already supported.
3. **`src/components/walk/WalkReadingSheet.tsx`** — EC field (`walk-reading-ec`); collapsible
   "Bed profile" section (`walk-bed-profile-toggle`) with `walk-profile-ph` /
   `walk-profile-lux` / `walk-profile-water` / `walk-profile-nutrient` inputs; fetch-on-open
   prefill; combined save (readings insert + diffed `areas.update` + lux reading insert);
   `humanise` gains EC/pH/lux codes.
4. **`src/components/walk/WalkSectionCard.tsx`** — none (same single Log-reading button).
5. No `gardenWalk.ts` select changes — the sheet fetches its own prefill.

## Part B — feed water movement, nutrient source + peak light into the AI

6. **AI Area Coach** (`supabase/functions/area-sensor-analysis/index.ts` +
   `_shared/areaAnalysisPrompt.ts`):
   - The areas select (`index.ts:80`) gains `water_movement, nutrient_source,
     light_intensity_lux`.
   - `AreaAnalysisInput.area` + `buildAreaAnalysisPrompt` gain a **Bed profile block** —
     e.g. `Bed profile: pH 6.5 · Well-Drained · Organic (Compost) · peak light ~24,000 lux
     (bright)` — using the existing `_shared/luxBand.ts` for the band label (same convention
     as the five functions already grounding on lux). Unset fields are omitted, never "null".
   - **Cache note:** `area_ai_insights` regenerates only on a newer reading or `force` — a
     profile edit alone serves the cached insight until the panel's existing **Refresh** button
     (force) or the next reading. Accepted; noted in the app-reference. (Auto-invalidation on
     profile change would need schema for a profile hash — not worth it now.)
7. **Garden AI chat** (`supabase/functions/agent-chat/context.ts`):
   - The areas select gains `growing_medium, medium_ph, water_movement, nutrient_source,
     light_intensity_lux`; each area's context line gains a compact profile suffix when any
     field is set (e.g. `- Raised Bed A (id=…, location=…) — pH 6.5, well-drained, organic
     feed, peak ~24k lux`), built by a small exported pure `formatAreaProfile(area)` so it's
     Deno-testable. Unset fields omitted; no suffix when nothing is set (token discipline).
   - Context cache is 5-min TTL — walk edits reach the chat within 5 minutes. Accepted.
8. Explicitly NOT wired here: garden-brain / daily brief / adaptive care (moisture-centric;
   separate concern if ever needed).

## Tests

- **Vitest:** new `tests/unit/lib/walkBedProfile.test.ts` — patch diffing (unchanged→omitted,
  cleared→null, select value passthrough, pH/lux validation bounds, all-unchanged→empty patch);
  keeps the existing `areaReadingsService` behaviour untouched (no new cases needed there —
  EC validation already covered by its rules; add a pin only if missing).
- **Deno:**
  - `areaAnalysisPrompt.test.ts` (extend) — Bed profile block renders pH/water/nutrient/lux
    with the luxBand label; absent fields omitted; fully-unset area emits no profile line
    (regression pin on the existing prompt content tests).
  - `agentChatContext` profile formatting — new small test file (or extend an existing
    agent-chat test) for `formatAreaProfile`: full quartet, partial, all-unset → empty string.
- **Playwright:** extend WALK-032 (`garden-walk.spec.ts`): fill moisture + EC, expand Bed
  profile, set pH + water movement, save; assert toast + (via one supabase query in the spec or
  reload) the persisted `areas.medium_ph`. Update `PlantDoctorPage`-style Page Object if the
  walk has one wrapping the sheet.

## Test documentation updates

- `docs/e2e-test-plan/29-garden-walk.md` — WALK-032 row (EC + bed-profile coverage, new testids).
- `TESTING.md § Current Test Inventory` — new `walkBedProfile.test.ts` row + totals.

## App-reference updates (same task)

- `02-dashboard/13-garden-walk.md` — reading sheet contract: EC field + Bed profile section
  (fields, prefill, diff-save, lux time-series side-effect), component graph line.
- `03-garden-hub/04-area-details.md` — note the walk can now edit the advanced quartet
  (cross-link both ways).
- `99-cross-cutting/02-data-model-spatial.md` *(corrected target — the areas columns live here,
  not in 09-data-model-integrations)* — record which AI surfaces ground on the area profile
  after this task (Area Coach + chat + the five lux-banded planners) and the remaining facts
  (`latest_soil_*` columns still have no server-side reader; manual readings absent from
  history charts). Also fixed a column-name drift found mid-task: the doc listed `ph` where
  the real column is `medium_ph`.
- `99-cross-cutting/13-ai-gemini.md` — Area Coach + agent-chat grounding now includes the bed
  profile quartet; cache/TTL staleness semantics.
- `99-cross-cutting/10-edge-functions-catalogue.md` — one-phrase updates to the
  `area-sensor-analysis` and `agent-chat` entries (bed-profile grounding).

## Risks / edge cases

- **Select values are stored strings** — the walk's selects must use the identical option
  values as `AreaAdvancedFields` (e.g. `"Organic Breakdown"`), or we'd write variants the
  Advanced settings UI can't display. Single source: export the option lists from a small
  shared constant (moved out of `AreaAdvancedFields` or duplicated with a comment? → **moved to
  `src/constants/areaProfileOptions.ts`** and imported by both, so they can't drift).
- **Concurrent edit:** the sheet's diff-update only touches changed fields, so a walk-save
  can't clobber an Advanced-settings edit to a *different* field made mid-walk.
- **Lux semantics:** peak light via the walk inserts a manual `area_lux_readings` row stamped
  now + bumps the column — same as the existing modal, so the Light Sensor history stays
  coherent.
- No migration → no schema-gate concerns; RLS: `areas` update + `area_lux_readings` insert are
  already home-member policies (same as the existing surfaces).

## Out of scope

- Garden-brain / daily brief / adaptive-care grounding on the profile (moisture-centric today).
- Auto-invalidating the Area Coach cache on a profile edit (Refresh button covers it).
- Growing medium / medium texture in the walk (not asked; the sheet stays focused — trivially
  addable to the Bed profile section later).
- The v1 `area_ph_readings` time-series design — dropped entirely (pH is `areas.medium_ph`).
- Manual readings in history charts (pre-existing write-only gap, separate task).

## Code review outcome (2026-07-18)

Fresh `code-reviewer` verdict: **ship**. RLS verified sound (walk reuses the exact client
paths `AreaAdvancedFields`/`AreaLuxReadings` already exercise), option lists value-identical,
diff semantics correct (`"6.50"` ≡ 6.5, `0`/null via `!= null`), prompt block + `luxBandLabel`
consistent, E2E race-gating sound. Findings and how they were handled:

- **Applied (Medium):** partial-failure retry could double-post readings and show a misleading
  "nothing saved" error — the readings insert is now guarded by a saved-ref (retry skips it;
  `areas.update` is idempotent for the same diff; the lux insert is last so it can't dupe), and
  the failure toast says "Reading saved, but the bed profile update failed — tap Save to retry
  it" when that's what happened.
- **Documented (Low):** clearing peak-light in the walk nulls the column but old
  `area_lux_readings` rows survive — the next Advanced-settings lux edit re-derives the column
  and resurrects the value. Deliberate (a quick walk sheet shouldn't delete history rows);
  now commented on `BedProfileDiff.luxReading`.
- **Accepted (Low, cosmetic):** supabase errors aren't `Error` instances so the `humanise`
  code-mapping branch is mostly dead — generic copy renders, nothing leaks. No change.
- **Accepted (Low, pre-existing):** the chat context's areas fetch has no row cap (unlike
  plants/blueprints/plans) and the profile suffix amplifies token cost on many-area homes —
  pre-existing shape; flagged for the future AI-context tuning pass rather than changed here.

## Release notes

Add under next bump: "Record a bed's pH, peak light, water movement and nutrient source right
from the Garden Walk — plus EC alongside moisture and temperature. The AI Area Coach and Garden
AI now take the full bed profile into account in their advice."

---

<details><summary>v1 draft (superseded 2026-07-18 — kept for the record)</summary>

The original plan assumed "pH like areas allow" meant a new time-series metric and designed an
`area_ph_readings` table + `areas.latest_soil_ph` + triggers mirroring
`20260720000000_area_soil_readings.sql`, with pH fields in `LogReadingModal` + the walk sheet.
The user clarified the fields live in Location management → area → Advanced settings
(`areas.medium_ph` etc.), which already exist — so the migration and readings-service changes
were dropped. The v1 drift findings stand and are recorded above: the walk strip carries EC but
doesn't render it (still true — but strip changes were dropped from scope with the pivot;
capture-only now), nothing server-side reads `areas.latest_soil_*`, and manual readings never
reach history charts.

</details>
