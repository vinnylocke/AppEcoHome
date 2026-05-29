# Plan — Multi-ID v2: confirm, info + full-care, and add-to-Shed per detected plant

## Goal

Make each plant the Multi-ID action detects actionable, mirroring patterns we already have elsewhere:

1. **Select + confirm** — per detected plant, pick one of its candidate identities and confirm it (like the single-plant Identify's confirm).
2. **Click for info → See more** — tapping a candidate searches our **library first, else AI** and shows the info pills + description (the shared `PlantInfoPanel`), with a **See full care** button that opens the **Care / Grow Guide / Companions / Light** overlay (`PlantDetailModal`).
3. **Check + add to Shed** — tick any detected plants and add them to the Plants area in one go (their confirmed identity).

## App-reference files consulted

- `docs/app-reference/05-tools/02-plant-doctor.md` — Multi-ID action + result card, the single-identifier confirm flow, Save-to-Shed.
- `docs/app-reference/08-modals-and-overlays/11-companion-plants-tab.md` — the existing **library→provider→AI** ⓘ resolution + `PlantDetailModal` hand-off this reuses.
- `docs/app-reference/08-modals-and-overlays/38-plant-detail-modal.md` — the full-care overlay (Care/Grow/Companions/Light) and its props.
- `docs/app-reference/99-cross-cutting/25-plant-providers.md`, `03-data-model-plants.md` — provider resolution + `plants`/shed insert semantics.

## Key reuse (so this stays modular — "one place to update")

- **Resolution** is currently inlined in `CompanionPlantsTab.resolveCompanion` (library → Verdantly/Perenual → AI-by-name). **Extract it** into `src/lib/plantInfoResolver.ts` → `resolvePlantInfo(name, scientificName?) → { details: PlantDetails | null; result: ProviderSearchResult }`. Refactor `CompanionPlantsTab` to call it (keeping its own per-row cache/loading) — no behaviour change. `SceneMapResultCard` uses the same helper.
- **Info pills/description**: `PlantInfoPanel` (already used by companions + plant search).
- **Full care**: `PlantDetailModal` (Care/Grow/Companions/Light).
- **Add to Shed**: `ensureCataloguePlantFromSearchResult(result, { homeId })` (library/provider fast-paths, AI only when needed — exactly "library first, else AI") → `saveToShed(skeleton, details, homeId)` (the single shed-insert invariant holder).

## Changes

### 1. `src/lib/plantInfoResolver.ts` (new, unit-tested)

`resolvePlantInfo(name, scientificName?)`:
- `searchLibrary(name, { pageSize: 1 })` → hit → `libraryRowToPlantDetails` + `result = { _provider:"ai", plant_library_id }`.
- miss → `searchAllProviders(name, undefined, ["perenual","verdantly"])`, prefer Verdantly → `getProviderPlantDetails` → `result = the provider hit`.
- total miss → `{ details: null, result: { _provider:"ai", common_name } }`.
Pure, no React; the exact logic lifted from `CompanionPlantsTab.resolveCompanion`.

### 2. `src/components/CompanionPlantsTab.tsx` (refactor only)

`resolveCompanion` delegates to `resolvePlantInfo` (keeps the `companionDetails`/`companionResult` cache + loading set). No UX change — covered by existing companion tests + the new resolver unit test.

### 3. `src/components/lens/SceneMapResultCard.tsx` (the main work)

New props: `homeId: string`, `aiEnabled: boolean`, `isPremium: boolean`, `onPlantsAdded?: () => void`.

Per region (detected plant):
- **Candidate selection + confirm** — candidates become radio-selectable; the top candidate is pre-selected. A per-region **Confirm** button locks the choice (shows "Confirmed ✓ <name>") and logs a feedback event. The confirmed identity is what the checkbox-add and the box label use.
- **Info (ⓘ) + See full care** — tapping a candidate's ⓘ resolves it via `resolvePlantInfo` and expands `PlantInfoPanel` (pills + description); a **See full care** button sets `detailResult` → renders `PlantDetailModal`. Per-candidate resolved details cached in component state.
- **Checkbox** — per region; ticking includes its confirmed candidate in the add set.

Footer:
- Sticky **"Add N to Shed"** when ≥1 region checked → for each checked region: `resolvePlantInfo` (or reuse cached `result`) → `ensureCataloguePlantFromSearchResult(result, { homeId })` → build a `SaveToShedSkeleton` from the catalogue details → `saveToShed(...)`, with a light `common_name` dedup so re-adds don't duplicate. Progress state + summary toast ("Added N plants to your Shed"), then `onPlantsAdded?.()`.

Box overlay + mapping (existing) stay; the box badge label now reflects the confirmed name. `PlantDetailModal` rendered from the card (static import — no cycle back to this card).

### 4. `src/components/PlantDoctor.tsx`

Pass `homeId`, `aiEnabled`, `isPremium`, and `onPlantsAdded={onTasksAdded}` (dashboard refresh) to `<SceneMapResultCard>`.

## Out of scope (flagged)

- **AI-training feedback for Multi-ID confirm** — the single-identifier writes `plant_doctor_sessions.confirmed_value`; Multi-ID has no session (sessions are single-plant). Confirm here is a client-side lock + analytics event; wiring a per-region training session would need schema thought. Say the word if you want it.
- **Per-region source picker** — we auto-resolve library→provider→AI (matching "library first, else AI"); no manual source-choice step.

## Tests

- **Vitest** `tests/unit/lib/plantInfoResolver.test.ts` — library hit / provider fallback / AI-by-name miss (mock `searchLibrary`, `searchAllProviders`, `getProviderPlantDetails`).
- **Vitest** extend `tests/unit/components/SceneMapResultCard.test.ts` — selecting a candidate + confirm updates the confirmed label; checkbox toggles add-set; "Add N to Shed" appears; ⓘ expands info (mock `plantInfoResolver` + `saveToShed` + `ensureCataloguePlantFromSearchResult`). Existing companion tests guard the refactor.
- **E2E** — extend the DOC Multi-ID rows: confirm a plant, open See full care, check + add to Shed (mock `plant-doctor` + the resolve/save paths). New testids: `scene-map-candidate-{r}-{c}`, `scene-map-confirm-{r}`, `scene-map-check-{r}`, `scene-map-add-to-shed`, `scene-map-see-care-{r}`.

## Docs to update

- `05-tools/02-plant-doctor.md` — Multi-ID now supports confirm, info + full-care, and add-to-Shed; component graph + code refs (`plantInfoResolver.ts`).
- `08-modals-and-overlays/11-companion-plants-tab.md` — note resolution now lives in `plantInfoResolver.ts`.
- `08-modals-and-overlays/38-plant-detail-modal.md` — add SceneMapResultCard as a host.
- `docs/e2e-test-plan.md` — extend the Multi-ID rows.

## Migration

None. Reuses `plants`/`plant_schedules` (via `saveToShed`), the catalogue resolver, and `PlantDetailModal`.

## Risks / edge cases

- **Multiple AI care-guide generations on add** — only for checked plants not in our library/provider DBs; library/provider hits are cheap. Progress state covers latency; dedup avoids double-adds.
- **Refactor risk** — extracting the resolver could regress companions; mitigated by keeping behaviour identical + the existing companion tests + the new resolver unit test.

## Process

1. Extract `plantInfoResolver.ts`; refactor `CompanionPlantsTab` to use it.
2. Enhance `SceneMapResultCard` (confirm + info/See-more + check/add).
3. Wire props in `PlantDoctor`.
4. `npx tsc --noEmit` + `npm run build` + `npm run test:unit`.
5. Docs.
6. Release note; deploy `--bump 1`; push to main.
