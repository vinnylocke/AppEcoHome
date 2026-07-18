# 29. Garden Walk

**Spec file:** `tests/e2e/specs/garden-walk.spec.ts`
**Page Object:** `tests/e2e/pages/GardenWalkPage.ts`
**Utilities:** `tests/e2e/utils/walkSeedReset.ts` — service-role reset of the worker home's `garden_walk_sessions` (+ cascaded visits), the walk seed tasks (incl. the "Harvest Tomatoes" window task's `next_check_at`), test-logged Tomato `yield_records`, and the walker's persona (→ null), run in `beforeEach` so same-day visit rows never leak between tests (the RHO-17 route rebuild is visit-derived). Also exports `setWalkPersona()` for the §11 persona toggle test.
**Seed dependencies:** `01_locations_areas.sql` (Outside Garden / Indoor Space + areas), `02_plants_shed.sql` (≥ 5 plants for the dashboard launcher; planted + unplanted plants exercise area and unassigned sections), `03_tasks_blueprints.sql` (`TASK_UNASSIGNED` "Sweep the Potting Bench" — no location/area/plants → Home step; `TASK_PERSONAL` "Sharpen Your Secateurs" — `scope='personal'` → Home step; "Harvest Tomatoes" — due today, window +7d, linked to the unassigned Tomato → in-walk harvest strip), `05_planner.sql` + `12_shopping_lists.sql` ("Summer Veg Plan" In Progress with `linked_area_id` = Raised Bed A → phase 2 digests/banners), `06_ailments_watchlist.sql` (3 active ailments + 1 archived), `09_stats.sql` (Basil → Aphid active link → area context chip)
**App-reference:** [02-dashboard/13-garden-walk.md](../app-reference/02-dashboard/13-garden-walk.md)

Covers the Garden Walk (`/walk`). Since **RHO-17** the walk is a hierarchical route: Home section card → per-Location cards → per-Area cards → plant cards → unassigned plants → summary, with task rows (complete / postpone / skip) on every card, note + photo capture on section cards, skip-section + same-day resume. **Phase 2** adds telemetry (sensor chips + valve rows fed by `home-overview view:"walk"`), manual valve open/close with a duration timer, and manual soil readings from area cards. **Phase 3** weaves in the watchlist (home digest + per-bed context), actionable In-Progress plans (home digest + area banners), the full harvest experience on task rows (ripeness / partial-pick / snooze via the Task Detail sheets), and the §11 persona copy/density pass.

Because the walk route depends on seed state, tests that need a card self-skip when the seed produced none. The Page Object's `waitForCardOrEmpty()` dismisses a leftover resume prompt via **Start fresh**; `advanceToPlantCard()` continues through section cards to reach a plant card; `advanceToAreaCard()` stops at the first area card; `advanceUntilVisible(locator)` (Phase 3) steps through the whole route (Continue on sections, Skip on plants) hunting a specific banner or task row.

Key selectors: `dash-garden-walk`, `walk-section-card` (+ `data-section-kind`), `walk-section-title`, `walk-section-continue`, `walk-section-skip`, `walk-section-note(-sheet/-input/-save)`, `walk-section-snap(-sheet/-save)`, `walk-section-skipped-earlier`, `walk-section-devices`, `walk-sensor-row-{id}`, `walk-sensor-chip-{id}`, `walk-valve-row-{id}` (+ `data-valve-state`), `walk-valve-duration-{5|10|15}-{id}`, `walk-valve-custom-{id}`, `walk-valve-open-{id}`, `walk-valve-close-{id}`, `walk-area-readings`, `walk-area-latest(-empty)`, `walk-log-reading`, `walk-reading-sheet` (+ `-moisture/-temp/-save/-cancel/-close`), `walk-task-row-{id}` (+ `data-state`), `walk-task-complete-{id}`, `walk-task-postpone-{id}` (+ `-tomorrow/-3d/-date/-confirm`), `walk-task-skip-{id}`, `garden-walk-resume`, `walk-resume-continue`, `walk-resume-fresh`, `walk-card`, `walk-card-section-label`, `walk-card-stop`, `walk-summary`, `walk-summary-skipped`, `walk-summary-again`, `garden-walk-empty-back`, `garden-walk-error-back`. Phase 3 adds: `walk-watchlist-panel` (+ `data-variant`), `walk-watchlist-item-{id}`, `walk-watchlist-symptom-{id}`, `walk-watchlist-guidance`, `walk-section-plans`, `walk-plan-banner-{id}` (+ `data-variant`), `walk-plan-phase-{id}`, `walk-plan-open-{id}`, `walk-plan-activate-{id}`, `walk-plan-completed-{id}`, `walk-plan-guidance-{id}`, `walk-task-plan-chip-{id}`, `walk-task-description-{id}`, `walk-task-details-{id}`, `walk-task-harvest-{id}`, `walk-harvest-strip-{id}`, `walk-harvest-harvested-{id}`, `walk-harvest-partial-{id}`, `walk-harvest-notyet-{id}`, `walk-harvest-ai-{id}`, `walk-harvest-snooze-{d}-{id}`, `walk-harvest-guidance-{id}`, `walk-task-window-closed-{id}`, `walk-guidance-devices`, `walk-guidance-readings`, `walk-reading-moisture-helper`, `walk-reading-temp-helper`, `walk-summary-subtitle` (plus the shared harvest-sheet ids `harvest-partial-*`, `harvest-ripeness-*`, `harvest-eol-*`).

## Hierarchical route (RHO-17)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WALK-020 | ✅ | The walk opens on the Home section card, then Continue descends into a location card and an area card (`data-section-kind` home → location → area) | — | ✅ Passing |
| WALK-021 | ✅ | The Home card lists the seeded unassigned + personal tasks (Personal chip); completing one resolves the row to `data-state="completed"` | — | ✅ Passing |
| WALK-022 | ✅ | Skipping a location section jumps past all its areas and plants (next card never belongs to the skipped location; if the walk ends, the summary lists it as skipped) | — | ✅ Passing |
| WALK-024 | ✅ | A note saved from a section card closes the sheet and stays on the same card (notes don't advance sections) | — | ✅ Passing |
| WALK-025 | ✅ | Leaving mid-walk (navigate away with an open session) offers the Resume prompt on relaunch; Resume drops sections marked done earlier today | — | ✅ Passing |
| WALK-026 | ✅ | A skipped section reappears on "Walk what's left", flagged "Skipped earlier"; the summary lists it under `walk-summary-skipped` | — | ✅ Passing |

## Telemetry, valve control & manual readings (RHO-17 Phase 2)

The walk bootstrap calls `home-overview` with `view: "walk"`; these tests mock that function (same `mockEdgeFunction` pattern as HOME-008) with an unassigned sensor + an unassigned eWeLink valve so both land on the Home card, and mock `integrations-ewelink-control` so no real valve command fires.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WALK-030 | ✅ | Sensor chip (moisture % + band) and valve row (duration presets 5/10/15 + custom + Open) render on the Home card from the walk-view payload | `home-overview` | ✅ Passing |
| WALK-031 | ✅ | Opening a valve with the 5-min preset invokes `integrations-ewelink-control` (the exact ValveControlPanel path) → row shows `data-valve-state="running"` + Close; Close returns it to idle | `home-overview`, `integrations-ewelink-control` | ✅ Passing |
| WALK-032 | ✅ | Log reading on an area card: moisture + temp + **EC** saved through `areaReadingsService.logManualReading` (stamped now) **and the Bed profile section** (`walk-bed-profile-toggle`) diff-saves pH + water movement to `areas` (values chosen to differ from the prefill so re-runs always change something); sheet closes, walk stays on the area card, combined toast, then re-opening the sheet proves persistence via the fresh prefill (`walk-profile-ph` / `walk-profile-water`) | `home-overview` | ✅ Passing (self-skips if no area card in the seed state) |

## Watchlist, plans & harvest (RHO-17 Phase 3)

No mocks — these run against the seeds. `resetWalkState` restores the harvest task, drops test-logged Tomato yields and resets persona before each test.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WALK-040 | ✅ | The Home card's "Look out for" digest lists the 3 active seeded ailments with link counts (Aphid "1 plant" via the Basil link), excludes the archived Powdery Mildew, and (default persona = new) shows symptom hints + guidance prose | — | ✅ Passing |
| WALK-041 | ✅ | The Home card digests "Summer Veg Plan" (In Progress, "Phase 2 of 5") and excludes Completed/Archived plans; the staged area (Raised Bed A) carries the `data-variant="area"` banner with "Part of…", an Open-plan button, and NO activate button (phase 2 is a staging-UI phase — only phase 5 lifts into the walk) | — | ✅ Passing |
| WALK-042 | ✅ | An area card whose plants carry active ailment links shows the "Flagged in this bed" context ("Aphid · 1 plant" on Raised Bed A) | — | ✅ Passing |
| WALK-043 | ✅ | An in-window harvest task row opens the full harvest strip (Harvested / Picked some / Not yet / Check with AI); "Picked some" mounts the shared `HarvestPartialPickSheet`, logs a 250 g yield and snoozes the task — the row resolves to `data-state="snoozed"` | — | ✅ Passing |
| WALK-044 | ✅ | With persona = experienced (set via `setWalkPersona`, reset in `finally`), the watchlist panel still renders but the symptom hints + guidance prose are gone (§11 — copy/density only) | — | ✅ Passing |

## Return navigation (RHO-7 / RHO-8)

The walk returns to the surface it was launched from (`navigate("/walk", { state: { from } })`), defaulting to `/quick` when origin is absent. The empty/error exit button was relabelled from "Back to Quick Menu" to **"Back"**.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WALK-001 | ✅ | Launched from the dashboard, the walk returns to `/dashboard` on exit (Stop→Done from any card kind, or empty→Back) — not `/quick` | — | ✅ Passing |
| WALK-002 | ✅ | The empty-state exit button reads "Back", not "Back to Quick Menu" | — | ✅ Passing (asserts only on the empty branch) |

## Snap sheet scroll & focus (RHO-6)

Opening the Snap sheet scrolls its own `overflow-y-auto` body (`walk-snap-sheet-body`) into view and moves focus inside the newly-mounted section (respects `prefers-reduced-motion`). Since RHO-17 the test first advances through the section cards to reach a plant card, and polls for the smooth-scroll to land.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WALK-010 | ✅ | Opening the Snap sheet brings its scroll body into view (top within viewport, polled) | — | ✅ Passing (self-skips if no walkable plant in the seed state) |
