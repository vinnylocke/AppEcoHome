# 6. The Shed (Plant Inventory)

**Spec files:** `tests/e2e/specs/plants.spec.ts` · `tests/e2e/specs/shed-crud.spec.ts` · `tests/e2e/specs/shed-discovery.spec.ts` · `tests/e2e/specs/plant-edit-assignment.spec.ts` · `tests/e2e/specs/instance-edit-tabs.spec.ts` · `tests/e2e/specs/favourites.spec.ts`
**Page Objects:** `tests/e2e/pages/ShedPage.ts` · `tests/e2e/pages/PlantEditPage.ts` · `tests/e2e/pages/PlantAssignmentPage.ts` · `tests/e2e/pages/BulkAssignPage.ts` · `tests/e2e/pages/InstanceEditPage.ts`
**Seed dependencies:** `01_locations_areas.sql`, `02_plants_shed.sql`, `13_ai_freshness.sql` (AI-source lock case), `15_favourites.sql` (favourites fixtures + W1 second home), `17_plant_library.sql` (3 global catalogue rows `910001–910003` for deterministic library-first search results)
**App-reference:** [03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md)

> **Design overhaul Phase 4.3 (2026-07):** the Shed toolbar collapsed to a single sticky row — the source/sort selects and smart-filter chips now live behind a **Filters** disclosure (`shed-filters-btn` → `shed-filters-panel`, with a real active-filter count badge), and the per-card ghost icons (layout / light / Ask AI / archive / delete) moved into a **kebab menu** (`plant-card-kebab-{id}` → `plant-card-menu-{id}`, `role=menu`) next to the favourite heart. All original aria-labels and menu-item testids are preserved, so existing locators still resolve once the container is open. `ShedPage` gained `filtersButton` / `filtersPanel` locators plus `openFilters()` and `openCardMenu(name)` helpers; specs call `openFilters()` before any source/sort select interaction and `openCardMenu()` before every archive/restore/delete/light click (~15 sites, incl. the favourites Snapdragon flows and the SHED-BULK-004 cleanup loop, which now gates on card visibility before opening the menu). Unphotographed plants render a genus-tinted `PlantInitialTile` (`plant-initial-tile`) instead of the old shared Unsplash forest photo.

## Navigation + basic render

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-001 | ✅ | `/shed` → "The Shed" / "Plant Library" heading | — | ✅ Passing |
| SHED-002 | ✅ | Search input visible | — | ✅ Passing |
| SHED-003 | ✅ | Nav link → `/shed` | — | ✅ Passing |
| SHED-004 | ✅ | Plant cards render for seeded plants | — | ✅ Passing |

## Tabs + filters

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-MOBILE-001 | ✅ | Phone-portrait: the search launcher + ⋯ overflow (holding Bulk add) are reachable (Stage 3 — one primary affordance) | — | ✅ Passing |
| SHED-SOIL-001 | ✅ | Plant edit modal → "Soil Needs" tab renders the sensor-requirements list or empty state | — | ✅ Passing |
| SHED-005 | ✅ | Stage C: All is the default presence chip; Active shows only live plants (Unplanted counts; Mint excluded) | — | ✅ Passing |
| SHED-006 | ✅ | Stage C: the Inactive chip (derived) shows Mint | — | ✅ Passing |
| SHED-007 | ✅ | Stage C: live plants absent from Inactive | — | ✅ Passing |
| SHED-008..009 | ✅ | Filter by source (Manual / API) — the select now sits inside the Filters panel: `openFilters()` → "Filter by source" (aria-label unchanged) | — | ✅ Passing |
| SHED-010 | ✅ | One search: typed owned-plant name surfaces the takeover's "In your Shed" section | — | ✅ Passing |
| SHED-011 | ✅ | No-match query: no owned section + `Nothing called "…" yet.` copy | — | ✅ Passing |
| SHED-012 | ✅ | Clear-× empties the query and returns to the idle state (recents/examples/chips) | — | ✅ Passing |
| SHED-A1 | ✅ | Hub v3: owned search rows carry ONE derived presence pill (`data-presence` ∈ active/inactive/saved) from the `plant_presence` view | — | ✅ Passing |
| SHED-013 | ✅ | Owned matching is case-insensitive | — | ✅ Passing |
| SHED-014 | ✅ | Partial owned match works ("Bos" → Boston Fern) | — | ✅ Passing |

## Add plants

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-015 | ✅ | Add button opens the full-page **PlantSearchTakeover** (Stage 2, 2026-07-21 — the Manual tab it asserts kept its `bulk-search-tab-manual` testid) | — | ✅ Passing |
| SHED-016 | ✅ | Takeover — Escape closes without saving; plant count unchanged (Escape-to-close is real now — the old modal never handled it) | — | ✅ Passing |
| SHED-TKO-001 | ✅ | `?open=add-plant&query=` deep-links into the full-page takeover (`plant-search-takeover`, no `aria-modal` dialog, query seeded into `plant-search-input`, params consumed) | — | ✅ Passing |
| SHED-TKO-002 | ✅ | The takeover's back button (`shed-search-back`) returns to the Shed grid | — | ✅ Passing |
| SHED-TKO-003 | ✅ | Overlay pins `plant-search-input` in the top band (y<130), paints over the app header (`elementFromPoint` = the input), and the Escape ladder clears a typed query before closing | — | ✅ Passing |
| SHED-S3-001 | ✅ | One search, two worlds: owned section + seed-17 library row coexist for "Tomato" | Seed 17 | ✅ Passing |
| SHED-S3-002 | ✅ | Persona browse chips live in the takeover idle state; chip seeds browse-by-filter (panel auto-opens) | — | ✅ Passing |
| SHED-FAV-001 | ✅ | Stage 4: "Add & assign…" (`favourite-add-assign-{id}`, seeded Fig favourite 0017-…03) copies the favourite into this home and opens the assignment modal; self-cleaning (cancels + deletes the copy via the card flow) | — | ✅ Passing |
| SHED-017 | ✅ | Manual plant happy path | — | ✅ Passing |
| SHED-018 | ❌ | Manual plant — empty name validation | — | ✅ Passing |
| SHED-019 | ❌ | Manual plant — duplicate name warning | — | ✅ Passing |
| SHED-020 | ✅ | Library-first input opens by default; seed-17 Tomato row (910001) renders; "Search wider" CTA on typing | Seed 17 (plant_library) | ✅ Passing |
| SHED-021 | ❌ | Nonsense query — no result rows, no Review CTA (library + mocked-empty external) | Perenual API mock (empty) | ✅ Passing |
| SHED-022a | ✅ | Row-body tap → `PlantDetailModal` (viewing ≠ adding); `+` button adds → top-bar basket (`bulk-search-review`) pops in | Perenual API mock + Seed 17 | ✅ Passing |
| SHED-022b | 🔲 | Result thumbnails self-resolve via `plant-image-search` | `plant-image-search` mock | 🔲 Planned |
| SHED-022c | 🔲 | Library clone keeps the selected variant's name (`ensureCataloguePlantFromLibrary`) | — | 🔲 Planned |

## Bulk add — CSV upload + template + favourites (RHO-4 Phase 1)

The "Bulk add" header button opens `BulkPastePlantsModal`, which now has a **mode toggle**: "Paste a list" (existing free-text → AI/regex) and "Upload CSV" (new: strict parse against `PLANT_TEMPLATE`). Both feed the same review step. The CSV path is deterministic + tier-free (no Gemini, works on Sprout). Rows are inserted as `source='manual'` via `saveToShed`; rows with the `favourite` flag call `favouritePlant()` after insert.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-BULK-001 | ✅ | Bulk add opens with a mode toggle (Paste / Upload CSV) | — | ✅ Passing |
| SHED-BULK-002 | ✅ | CSV mode "Download template" downloads `rhozly-plants-template.csv` | — | ✅ Passing |
| SHED-BULK-003 | ✅ | CSV upload renders review rows; bad row (watering min>max) flagged + excluded, save counts only valid rows | — | ✅ Passing |
| SHED-BULK-004 | ✅ | Import valid CSV rows creates manual plants; `favourite=true` row lands in the Favourites scope. Post-import cleanup loop gates on each card being visible, then deletes via the kebab (`openCardMenu`) | — | ✅ Passing |
| SHED-BULK-005 | ✅ | Free-text paste still reaches the shared review step (with "Mark all as favourites" toggle) | — | ✅ Passing |

## Plant card actions

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-022 | ✅ | Card click opens PlantEditModal | — | ✅ Passing |
| SHED-023 | ✅ | PlantEditModal close | — | ✅ Passing |
| SHED-023b | ✅ | "Light needs" via the card kebab (`openCardMenu` → `plant-card-light-*`) opens the Light tab (not Sun Tracker) | — | ✅ Passing |
| SHED-023c | ✅ | Delete plant with instances → "Keep history" vs "Delete everything" modal | — | ✅ Passing |
| SHED-023d | ✅ | Bulk delete — same choice modal | — | ✅ Passing |
| SHED-023e | ✅ | Bulk assign — modal opens with per-plant qty inputs | — | ✅ Passing |
| SHED-024 | ✅ | Archive plant happy path — Archive lives in the card kebab (`openCardMenu` first; aria-label `Archive {name}` unchanged) | — | ✅ Passing |
| SHED-025 | ✅ | Archive cancel keeps Tomato in Active — via the kebab (Tomato chosen because Lavender + Cherry Tomato have AI freshness forks that duplicate names) | — | ✅ Passing |
| SHED-026 | ✅ | Restore archived Mint via the kebab (`openCardMenu` → `Restore Mint`); cleanup re-archives the same way | — | ✅ Passing |
| SHED-027 | ✅ | Delete plant happy path — Delete lives in the card kebab (`openCardMenu` first) | — | ✅ Passing |
| SHED-028 | ✅ | Cancel on delete dialog leaves plant in list — delete opened via Rose's kebab (handles the bulk-delete-with-instances choice dialog for Rose) | — | ✅ Passing |
| SHED-029 | ❌ | Delete plant with inventory items — via Boston Fern's kebab; dialog warns about cascade | — | ✅ Passing |
| SHED-030 | ✅ | Assign opens modal | — | ✅ Passing |
| SHED-031 | ✅ | Assign — select location + area + Save → Planted | — | ✅ Passing |
| SHED-032 | ✅ | Assign cancel keeps status | — | ✅ Passing |
| SHED-033 | ❌ | Assign — no locations → empty dropdown | Supabase route | ✅ Passing |

## Shed discovery (`shed-discovery.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-DSC-001 | ✅ | `/shed?tab=watchlist` switches GardenHub to Watchlist; plants grid hidden | — | ✅ Passing |
| SHED-DSC-002 | ✅ | Two-tab hub (no nursery/senescence tabs); ⋯ → `shed-open-seed-box` opens the Seed box sheet hosting `nursery-tab`; close removes it (Stage D) | — | ✅ Passing |
| SHED-DSC-003 | ✅ | Scientific-name search ("Solanum") matches Tomato | — | ✅ Passing |
| SHED-DSC-004 | ✅ | Sort A-Z is the default and renders alphabetically — sort select read inside the Filters panel (`openFilters()` first) | — | ✅ Passing |
| SHED-DSC-005 | ✅ | Source filter "Plant Database" narrows to api-source (Lavender) — inside the Filters panel (`openFilters()` first) | — | ✅ Passing |
| SHED-DSC-006 | ✅ | "All Sources" restores manual plants — `openFilters()` before each select interaction (helper is idempotent via `aria-expanded`) | — | ✅ Passing |
| SHED-DSC-007 | ⏭ | Credit badge popover shows source + licence — skipped (no api image credits in current seed) | — | ⏭ Skipped |

## Phase 4.3 surface — Filters disclosure, card kebab, placeholder tile

The redesigned chrome is exercised indirectly by every row above that goes through `openFilters()` / `openCardMenu()`, but the new surface itself deserves direct coverage:

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-P43-001 | ✅ | Card kebab (`plant-card-kebab-{id}`) opens its menu (`plant-card-menu-{id}`, `role=menu` visible, `aria-expanded=true`); clicking the backdrop or re-clicking the kebab closes it | — | 🔲 Planned |
| SHED-P43-002 | ✅ | Filters button shows a real active-filter count badge: source=Manual → "1", + smart chip → "2", reset to defaults → badge gone | — | 🔲 Planned |
| SHED-P43-003 | ✅ | `openFilters()` discloses `shed-filters-panel` with the source + sort selects and smart chips (All / Unassigned / In a plan, zero-count chips disabled); the old "Quick filters:" label is gone | — | 🔲 Planned |
| SHED-P43-004 | ✅ | Plant with no `thumbnail_url` renders the genus-tinted `plant-initial-tile` (initial glyph, no shared fallback photo); a plant with a photo does not | — | 🔲 Planned |

## Plant edit + assignment (`plant-edit-assignment.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PE-001 | ❌ | Plant edit — empty name surfaces "Mandatory Field" error | — | ✅ Passing |
| PA-001 | ✅ | Assignment — quantity stepper clamps min at 1 | — | ✅ Passing |
| PA-002 | ✅ | Assignment — increment ticks +1 each press | — | ✅ Passing |
| PA-003 | ✅ | Assignment — Add to garden CTA advances to Step 2 | — | ✅ Passing |
| BA-001 | ✅ | Bulk assign — modal lists per-plant qty inputs | — | ✅ Passing |

## Cross-home favourites (`favourites.spec.ts`)

Cross-Home Favourites Phase 1 (2026-07-03). Fixtures: `15_favourites.sql` (0017 UUID segment + W1's second home "Rooftop Terrace") and `13_ai_freshness.sql` (Cherry Tomato AI fork for the AI-source lock).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| FAV-001 | ✅ | `/shed?scope=favourites` deep link → Favourites scope; seeded Tomato (live ref) + Snapdragon (tombstone) render; hint banner shows + dismisses | — | ✅ Passing |
| FAV-002 | ✅ | Heart a Home-tab plant → appears in Favourites; remove cleans up + unfills the heart | — | ✅ Passing |
| FAV-003 | ✅ | Seeded Tomato favourite — heart pre-filled on Home tab, "In this home" on Favourites (dedupe) | — | ✅ Passing |
| FAV-004 | ✅ | "Add to this home" copies the tombstone (Snapdragon) into the active home → flips to "In this home" + appears on Home tab. Pre-test leftover sweep + post-test cleanup both delete the Snapdragon copy via its card kebab (`openCardMenu`) | — | ✅ Passing |
| FAV-005 | ✅ | Tier lock — forced Sprout sees disabled hearts on api (Lavender) + ai (Cherry Tomato) plants with upsell tooltip; manual heartable | Sprout profile route patch | ✅ Passing |
| FAV-006 | ✅ | Home-switch persistence (W1 only) — favourites identical after switch to Rooftop Terrace; Fig flips to "In this home"; Home tab re-roots | — | ✅ Passing (W1); skipped on W2–W4 |

## Instance Edit Modal tabs (`instance-edit-tabs.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| IE-001 | ✅ | Journal — add entry persists | — | ✅ Passing |
| IE-002 | ⏭ | Routine — seeded blueprints render as rows — skipped (no blueprints linked to seeded Basil) | — | ⏭ Skipped |
| IE-003 | ✅ | Yield — log harvest stores amount | — | ✅ Passing |

## Photo timeline observations (Garden Brain Phase 3, 2026-07-10)

Instance detail → Photos tab (`PhotoTimelineTab.tsx`). Observations come from the nightly `scan-journal-photos` cron (Sage/Evergreen owner); rows seeded via service role for E2E.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PTO-001 | ✅ | Analysed journal photo shows `photo-observation-chip` (health colour: healthy emerald / watch amber / concern rose) on its tile | Seed: `photo_observations` row (service role) | 🔲 Pending (verified live 2026-07-10) |
| PTO-002 | ✅ | Lightbox shows `photo-observation-panel`: stage + health chips, findings, and each recommended action with Apply/Dismiss | same seed | 🔲 Pending (verified live 2026-07-10) |
| PTO-003 | ✅ | `create_task` Apply (`photo-action-apply`) inserts a one-off task (due = today + `due_in_days`, linked to the plant + its area) and writes `status: applied` + `applied_task_id` into the actions jsonb | same seed | 🔲 Pending (validation covered by SJP-011..017) |
| PTO-004 | ✅ | Dismiss (`photo-action-dismiss`) writes `status: dismissed`; both Apply and Dismiss insert an `ai_feedback` row (`function_name: scan-journal-photos`, rating ±1) | same seed | 🔲 Pending |
| PTO-005 | ✅ | Sub-Sage tier sees `photo-observation-upsell` line instead of observations when journal photos exist | Sprout profile route patch | 🔲 Pending |

> **2026-07-19 selector fix:** six spec sites waited for a "Save to Shed" button that was relabelled "Add to Shed" in an earlier sprint — the whole SHED-015..027 manual-add family was retry-flaky because of it. Specs now match the real label; the tests pass first-try.
