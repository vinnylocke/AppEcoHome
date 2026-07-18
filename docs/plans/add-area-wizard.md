# Add-Area Wizard — conditions, plants, and an AI setup review

**Date:** 2026-07-18
**Goal:** Replace the bare "add area" stub (today: `LocationManager.addArea` inserts
`{ name: "New Area", location_id }` and everything else is edit-later) with a wizard:

1. **Set up the bed** — name, type, and the advanced environment properties (growing medium,
   texture, pH, peak light, water movement, nutrient source) at creation time.
2. **Add plants straight away** — new instances from plants already in the Shed, or search
   new plants (which also adds them to the Shed catalogue).
3. **AI setup review** (AI tiers) — scores how well the chosen plants suit the configured
   conditions and each other, and offers recommendations: companion plants, care tasks (e.g.
   soil feeding), and automation/routine ideas.

## App-reference files consulted

- `03-garden-hub/03-location-manager.md`, `03-garden-hub/04-area-details.md` (area creation/edit today)
- `06-the-shed/*` + `99-cross-cutting/03-data-model-plants.md`, `25-plant-providers.md` (plants + instances)
- `99-cross-cutting/13-ai-gemini.md`, `10-edge-functions-catalogue.md`, `17-tier-gating.md`
- `99-cross-cutting/02-data-model-spatial.md` (areas columns), `04-data-model-tasks.md` (blueprints)
- Code-level trace (Explore agent): `LocationManager.addArea` (stub insert), `AreaAdvancedFields`
  (edit-only today; lux sub-panel needs an existing area id), `shared/PlantSearch` (embeddable,
  selection-returning, `multiSelect`) vs `PlantSearchModal` (self-persisting `plants` row with the
  3-way verdantly/AI/perenual enrichment + dupe check, returns via `onSuccess`),
  `TheShed.handleAssign` (the canonical `inventory_items` insert with area context +
  `AutomationEngine.applyPlantedAutomations`), `TaskActionButtons` (AI-suggested-task committer:
  recurring → `task_blueprints`, one-off → `tasks`, dependency linking, `inventoryItemIds`
  scoping), `guardAiByUser` (server) + `aiEnabled` prop / `FeatureGate` (client),
  care columns for scoring (`plants.soil_ph_min/max`, `sunlight`, `watering_*`,
  `soil_moisture/ec/temp_min/max` from the care-ranges cron, `hardiness_*`, toxicity, `attracts`),
  `companion-planting` edge fn shape + static `constants/companionPlants` rules.

## UX design

New full-screen wizard modal `AddAreaWizard`, launched from Location Manager's add-area button
(per location card → `location_id` is fixed). Four steps, linear with back navigation:

**Step 1 — The bed.** Name (required), area type, then the `AreaAdvancedFields` field set
(growing medium, texture, pH, water movement, nutrient source) + a plain **peak light (lux)**
number input (the full `AreaLuxReadings` history panel needs an existing area id — the wizard
collects just the value and logs it as a reading on commit, exactly like the walk's Bed profile
does). A **"Skip — just create the area"** escape hatch preserves today's quick-add speed
(creates with name only, closes the wizard).

**Step 2 — The plants.** Two tabs:
- *From your Shed:* list of the home's `plants` catalogue rows; picking one adds a pending
  instance (with quantity stepper). This creates **new** instances — moving existing placed
  instances stays in `InstanceEditModal` (out of scope).
- *Search new:* opens the existing `PlantSearchModal` (as the Nursery does) — it persists the
  `plants` row with all its provider enrichment and hands it back via `onSuccess`; the wizard
  adds it to the pending list. The plant is in the Shed from that moment (matches the ask —
  and a cancelled wizard leaves only a harmless catalogue row, no orphan area/instances).

**Commit point.** "Create area" at the end of Step 2 performs the writes in order: insert
`areas` row (name/type + advanced fields), insert the lux reading when set, insert
`inventory_items` rows (`TheShed.handleAssign` shape: home/plant/area/location context,
`planted_at`, `growth_state`), then `AutomationEngine.applyPlantedAutomations`. Non-AI tiers
finish here with a success screen.

**Step 3 — AI review (AI tiers only; `aiEnabled` client gate + `guardAiByUser` server).** Runs
against the now-real area + instances. Renders:
- **Suitability score** (0–100) with a headline + summary.
- **Per-plant fit** — verdict + note per plant (pH/light/moisture/hardiness vs the bed's setup).
- **Compatibility** — do these plants suit sharing the bed (companion logic).
- **Recommendations**, each actionable:
  - *Plants* → suggestion cards with "Search & add" reopening `PlantSearchModal` with
    `initialSearchTerm` (added plants join the area via the same instance insert).
  - *Tasks/routines* (e.g. "feed the soil for the brassicas") → rendered with the existing
    `TaskActionButtons` (`SuggestedTask[]` shape, scoped to the new `inventoryItemIds`) —
    one-tap creates blueprints/tasks exactly like Plant Doctor's commit.
  - *Automations* → text suggestions + a deep-link to `/integrations?tab=automations`
    (actually creating one needs devices/valves the wizard can't assume — suggest-only,
    stated in the UI).
- `AiFeedback` (👍/👎) on the review + a Regenerate button (per the AI-feature conventions).

## Server — new edge function `area-setup-review`

- Auth: user JWT + home membership + `guardAiByUser`. Rate-limited via the shared
  `enforceRateLimit` pattern; usage logged via `logAiUsage` (context block, prompt, raw result,
  cost — the full observability contract).
- Grounding: the `areas` row (all six env fields + `light_intensity_lux` via `luxBandLabel`),
  the area's instances joined to `plants` care columns (`soil_ph_min/max`, `sunlight`,
  `watering_min/max_days`, `soil_moisture/ec/temp_min/max`, `hardiness_min/max`, cycle,
  toxicity, `attracts`), and the home's `hardiness_zone` / `climate_zone`. Deliberately
  area-scoped rather than the chat-scale `buildUserContext` (noted as a conscious choice —
  the review is about one bed, not the whole garden).
- One Gemini JSON-mode call (`callGeminiCascade`, default cascade) with a pinned
  `responseSchema`: `{ score, headline, summary, plant_fit[], compatibility{verdict, note},
  recommendations{ plants[{name, reason, search_query}], tasks[SuggestedTask shape],
  automations[{title, description}] }, notes }`. The **prompt builder + response
  parser/validator live in `_shared/areaSetupReview.ts`** (pure, Deno-tested): closed
  vocabularies for verdicts, task shape coerced to exactly what `TaskActionButtons` accepts
  (task_type enum, `due_in_days`/`frequency_days` clamps), score clamped 0–100, garbage → null.
- **No caching table** — the review is on-demand at setup time (re-runnable via Regenerate,
  bounded by the rate limit). No migration needed anywhere in this feature.

## Source changes (summary)

1. `src/components/area/AddAreaWizard.tsx` (new) — the wizard shell + steps; state machine in
   a pure lib `src/lib/addAreaWizard.ts` (step transitions, pending-plant list ops, commit
   payload builder `buildAreaCommit(state)` → `{ areaInsert, luxReading?, instanceRows }`) so
   the logic is Vitest-tested without the component.
2. `src/components/LocationManager.tsx` — add-area button opens the wizard (stub insert
   removed; the wizard's Skip path covers quick-add).
3. Reuse untouched: `AreaAdvancedFields` (accepts a data/onChange contract already),
   `PlantSearchModal`, `TaskActionButtons`, `AutomationEngine.applyPlantedAutomations`.
4. `supabase/functions/area-setup-review/index.ts` (new) + `_shared/areaSetupReview.ts` (new).
5. `src/services/areaSetupReviewService.ts` (new, thin) — invoke + error mapping
   (`ai_required` / rate-limited / unavailable) following the `companionCache` pattern.

## Tier behaviour

| Tier | Experience |
|---|---|
| Sprout / Botanist | Steps 1–2 + success screen (no review step shown) |
| Sage / Evergreen (`ai_enabled`) | Steps 1–3 with score + recommendations |

Client gate via the `aiEnabled` prop (threaded from App.tsx like Plant Doctor); server re-verifies
with `guardAiByUser` (RHO-10 convention).

## Tests

- **Vitest** (`tests/unit/lib/addAreaWizard.test.ts`, new): step-transition rules (can't pass
  step 1 without a name; skip path), pending-plant ops (add/remove/quantity, dedupe by plant id),
  `buildAreaCommit` (area insert shape incl. nulls for unset fields, lux reading only when set,
  instance rows carry area/location context + quantity expansion).
- **Deno** (`supabase/tests/areaSetupReview.test.ts`, new): prompt builder (env block via
  `luxBandLabel`, per-plant care lines, omitted-when-unset), schema pinning, parser/validator
  (valid / fenced / score clamp / bad task_type coerced or dropped / garbage → null).
- **Playwright** (new rows in the management spec area): wizard happy path — create an area
  with one Shed plant, assert the `areas` row fields + `inventory_items` row exist; AI step
  with a mocked `area-setup-review` (score renders, a suggested task commits via
  TaskActionButtons); non-AI path skips step 3 (mock profile). Seeds: existing plants from
  `02_plants_shed.sql` suffice — no seed changes.

## Documentation (same task)

- **New surface file** `docs/app-reference/03-garden-hub/10-add-area-wizard.md` from
  `_template.md` (both roles) + `00-INDEX.md` row.
- Update: `03-location-manager.md` (creation flow replaced), `04-area-details.md` (cross-link),
  `10-edge-functions-catalogue.md` (+`area-setup-review`), `13-ai-gemini.md` (new caller +
  grounding), `17-tier-gating.md` (review step), e2e-test-plan `13-management.md` rows,
  `TESTING.md` inventory, `release-notes.json`.

## Risks / edge cases

- **Cancel semantics:** nothing is written until the Step-2 commit except `plants` rows created
  by the search modal (deliberate — "adds them to the shed" is the requested behaviour, and a
  stray catalogue row is harmless + reusable).
- **Commit partial failure:** area insert succeeds but an instance insert fails → wizard shows
  which plants failed with a retry that re-runs only the failed inserts (area id kept) — same
  saved-ref pattern as the walk sheet fix.
- **AI review of an empty-plant area:** allowed — the review scores the setup and its
  recommendations lean on plant suggestions (prompt handles zero plants explicitly).
- **Score honesty:** the schema's verdicts use closed vocabularies and the parser drops
  malformed recommendations rather than rendering junk (same defensive posture as
  `scanJournalPhotos` / `sketchDetection` contracts).
- Automations are suggest-only (no device assumptions); tasks commit through the proven
  `TaskActionButtons` path so blueprint/task/dependency handling isn't reimplemented.

## Out of scope

- Moving existing placed instances between areas (InstanceEditModal already does this).
- Editing an existing area through the wizard (AreaDetails edit modal remains the editor).
- Caching/persisting review results or a review-history table.
- Automation auto-creation from recommendations.

## Implementation notes (2026-07-18)

- **Schema drift caught mid-build:** the spatial data-model doc listed an `areas.area_type`
  column that does not exist on prod (verified) — the wizard's "type" field was dropped and
  the doc corrected (it also listed a phantom `soil_moisture_pct`; replaced with the real
  `medium_texture`). The new surface file landed as `15-add-area-wizard.md` (10 and 14 were
  taken).
- Four legacy E2E tests (MGMT-012/014/015 + the Section-12 blank-name case) exercised the old
  stub insert — converted to the wizard via a shared `quickCreateArea` helper (name + Skip);
  the blank-name case now asserts the wizard rejects a nameless Skip. Full area-setup spec:
  14/14 passing including the new WIZ-001.
- `TaskActionButtons`' `SuggestedTask` requires `end_offset_days`/`depends_on_index` — the
  review contract deliberately omits them (the model isn't asked for cross-task dependencies)
  and the wizard maps them to null at the render boundary.

## Code review outcome (2026-07-18)

Fresh `code-reviewer` verdict: **fix first** — two data-integrity findings + a race, all
applied before ship:

- **Applied (retry double-insert):** a post-insert failure (e.g. the planted-automations call
  throwing) invited a retry that re-inserted the whole instance batch → doubled plantings. The
  instance stage is now guarded by a ref ("batch landed" — the single insert is atomic, so
  landed means fully landed), and `applyPlantedAutomations` is best-effort (logged, non-fatal)
  matching every other planting surface.
- **Applied (skip drops chosen plants):** `pending` survives Back-navigation, so "Skip — just
  create" from step 1 could silently discard a step-2 selection. Skip now means *skip the
  review*, never the plants — anything chosen is committed.
- **Applied (double-tap race):** commit is guarded by a synchronous in-flight ref plus a ref
  for the created area id (state is async; a fast double-tap could double-create).
- **Applied (E2E hygiene):** the cleanup util now scopes deletes to the worker's own seeded
  home (per the `0000000{N}` UUID convention) so parallel workers can't wipe each other's
  in-flight rows.
- Reviewer verified clean: batch-insert atomicity assumption, guard order + `guardAiByHome`
  parity with `area-sensor-analysis`, the parser fully closing the task vocabulary before
  `TaskActionButtons`, `PlantSearchModal` contract fields, no dangling `addArea` callers.

Re-verified after fixes: typecheck, build, full area-setup spec 14/14.

## Release notes (drafted for the deploy that ships this)

"New Add-Area wizard — set up a bed's soil, light and conditions, add plants from your Shed or
search new ones, and (on AI plans) get an instant suitability score with plant, task and
routine recommendations before you plant."
