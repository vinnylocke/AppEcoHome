# Plan — Keep Multi-ID runs in history + show them in the History tab

## Goal

Multi-ID (group plant ID) runs should be **kept in history** and appear in the Plant Doctor **History** tab as their own entry — showing the photo, the detected plants, their candidate IDs, and which the user confirmed.

## Current state

- Multi-ID **runs** write no `plant_doctor_sessions` row.
- Last turn's confirm feature writes a per-plant **`identify`-shaped** session on each confirm. That surfaces in History as separate "Identify" rows — not as a single group entry, and unconfirmed runs leave nothing.

## App-reference files consulted

- `docs/app-reference/05-tools/02-plant-doctor.md` — Multi-ID action + session model.
- `docs/app-reference/05-tools/04-plant-doctor-history.md` — the History tab.

## Approach — one group session per run, with per-plant drill-down (hybrid)

Replace the per-plant `identify` confirm-sessions with a **single group "Group ID" session per Multi-ID run** (action `"scene"`), updated in place as the user confirms plants. One clean history entry per run; no duplicates; unconfirmed runs are still kept.

**Drill-down:** the Group ID history card shows the **main photo** + a summary; expanding it lists **each detected plant** with the **photo cropped to that plant's bounding box** (so you see exactly what was highlighted) plus its ranked candidate IDs and which was confirmed.

### Cropping

The stored region `box` ([ymin,xmin,ymax,xmax], 0–1000) + the session photo are enough to crop each plant. A small `CroppedPlantImage` renders the region into a `<canvas>` via `drawImage(img, sx,sy,sw,sh, …)` (display-only — no `toDataURL`, so no CORS-taint issue with the signed storage URL), preserving the region's true aspect ratio. The pure rect math (`boxToCropRect(box, naturalW, naturalH)`) goes in `src/lib/sceneMap.ts` and is unit-tested.

### 1. `src/hooks/usePlantDoctorSessions.ts`

- Extend `action` union with `"scene"`.
- Extend `results` with `regions?: { box: number[]; candidates: SessionCandidate[] }[]` and `confirmed?: Record<string, string>` (regionIndex → confirmed name; jsonb keys are strings).

### 2. `src/components/PlantDoctor.tsx`

- **On run** (`handleMultiId`, after `setSceneResult(data)`): if `userId` and `data.regions.length > 0`, upload the photo once to `doctor-sessions`, insert a session `{ action: "scene", image_path, results: { regions, notes, confirmed: {} } }`, and stash its id in `sceneSessionIdRef`. (Replaces the `sceneImageBase64`/`scenePathRef` confirm-upload bookkeeping.)
- **On confirm** (`confirmScenePlant`, now `(regionIndex, confirmedName)`): merge into a local `sceneConfirmedRef` map and `update` the group session's `results` (rebuilt from `sceneResult.regions` + notes + the confirmed map) + `confirmed_at`. No per-plant `identify` rows. No DB read (results rebuilt from in-memory `sceneResult`).
- Reset `sceneSessionIdRef` / `sceneConfirmedRef` on new run + `clearImage`.

### 3. `src/components/lens/SceneMapResultCard.tsx`

- Change `onConfirm` signature to `(regionIndex: number, confirmedName: string)`; `confirmRegion(r)` calls `onConfirm?.(r, cand.name)`.

### 4. `src/components/PlantDoctorHistory.tsx`

- New `"scene"` action in `SessionCard`:
  - Collapsed: a **Group ID** badge (ScanSearch icon) + summary line ("N plants — Basil, Rosemary…", confirmed names preferred) + the main-photo thumbnail.
  - Expanded (**drill-down**): the main photo + notes, then one row per detected plant — a **`CroppedPlantImage`** (the photo cropped to that plant's box) beside its ranked candidates with confidence, the confirmed one marked (from `results.confirmed[i]`).
- New `CroppedPlantImage` subcomponent (canvas crop via `boxToCropRect`).
- Add `"scene"` to the `ActionFilter` union + `ACTION_LABELS` ("Group ID") + the search haystack (region candidate names + confirmed values).

## Tradeoff (flagged)

Confirmations move from per-plant `identify` rows (`confirmed_value`) to the group session's `results.confirmed` map. This gives a clean single history entry per run and full per-plant fidelity; the `confirmed_value` *column* stays null for scene sessions (History reads `results.confirmed` for them). If a future AI-training job specifically scans `confirmed_value`, we'd point it at `results.confirmed` for scene rows too.

## Tests

- **Vitest** — `sceneMap.test.ts`: `boxToCropRect` (sx/sy/sw/sh from box × natural dims, min-1 guards).
- **Vitest** — extend `SceneMapResultCard.test.ts`: `onConfirm` now fires `(0, "Basil")`.
- **Vitest** — add `tests/unit/components/PlantDoctorHistory.test.ts`: a `"scene"` session shows the Group ID badge + detected plant names; expanding shows per-plant rows + confirmed mark (stub `CroppedPlantImage`'s canvas / jsdom).
- **E2E** — update DOC-017 (confirm updates the group `scene` session) + note the Group ID History entry + drill-down.

## Docs

- `05-tools/02-plant-doctor.md` — Multi-ID writes a `scene` session on run, updated on confirm.
- `05-tools/04-plant-doctor-history.md` — document the new Multi-ID history entry + filter.
- `docs/e2e-test-plan.md` — adjust the Multi-ID rows.

## Migration

None. `plant_doctor_sessions` already has `action` (text) + `results` (jsonb) + `image_path`; we only add a new action value + use the jsonb for regions/confirmed.

## Process

1. Hook type → PlantDoctor (run-session + confirm-update) → SceneMapResultCard onConfirm sig → History renderer + filter.
2. `npx tsc --noEmit` + `npm run build` + `npm run test:unit`.
3. Docs.
4. Release note; deploy `--bump 1`; push to main.
