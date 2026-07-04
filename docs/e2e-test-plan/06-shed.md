# 6. The Shed (Plant Inventory)

**Spec files:** `tests/e2e/specs/plants.spec.ts` · `tests/e2e/specs/shed-crud.spec.ts` · `tests/e2e/specs/shed-discovery.spec.ts` · `tests/e2e/specs/plant-edit-assignment.spec.ts` · `tests/e2e/specs/instance-edit-tabs.spec.ts` · `tests/e2e/specs/favourites.spec.ts`
**Page Objects:** `tests/e2e/pages/ShedPage.ts` · `tests/e2e/pages/PlantEditPage.ts` · `tests/e2e/pages/PlantAssignmentPage.ts` · `tests/e2e/pages/BulkAssignPage.ts` · `tests/e2e/pages/InstanceEditPage.ts`
**Seed dependencies:** `01_locations_areas.sql`, `02_plants_shed.sql`, `13_ai_freshness.sql` (AI-source lock case), `15_favourites.sql` (favourites fixtures + W1 second home)
**App-reference:** [03-garden-hub/02-shed-plants.md](../app-reference/03-garden-hub/02-shed-plants.md)

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
| SHED-MOBILE-001 | ✅ | Phone-portrait (390×844): "Find a plant" + Bulk add both visible (regression: bulk add was `hidden sm:flex`) | — | ✅ Passing |
| SHED-005 | ✅ | Active tab default | — | ✅ Passing |
| SHED-006 | ✅ | Archived tab shows Mint | — | ✅ Passing |
| SHED-007 | ✅ | Active plants absent from Archived | — | ✅ Passing |
| SHED-008..009 | ✅ | Filter by source (Manual / API) | — | ✅ Passing |
| SHED-010 | ✅ | Search matching ("Tomato") | — | ✅ Passing |
| SHED-011 | ❌ | Search no-match ("xyzqwerty") → empty state | — | ✅ Passing |
| SHED-012 | ✅ | Clear search restores plants | — | ✅ Passing |
| SHED-013 | ✅ | Case-insensitive search ("tomato") | — | ✅ Passing |
| SHED-014 | ✅ | Partial match ("Bos" → "Boston Fern") | — | ✅ Passing |

## Add plants

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-015 | ✅ | Add button opens BulkSearchModal | — | ✅ Passing |
| SHED-016 | ✅ | Add modal — close without saving | — | ✅ Passing |
| SHED-017 | ✅ | Manual plant happy path | — | ✅ Passing |
| SHED-018 | ❌ | Manual plant — empty name validation | — | ✅ Passing |
| SHED-019 | ❌ | Manual plant — duplicate name warning | — | ✅ Passing |
| SHED-020 | ✅ | Library-first input opens by default; "search more databases" CTA on typing | — | ✅ Passing |
| SHED-021 | ❌ | Nonsense query — no result rows, no Review CTA (library + mocked-empty external) | Perenual API mock (empty) | ✅ Passing |
| SHED-022a | ✅ | Preview → "See full care" → cart select → Review & Add CTA appears | Perenual API mock | ✅ Passing |
| SHED-022b | 🔲 | Result thumbnails self-resolve via `plant-image-search` | `plant-image-search` mock | 🔲 Planned |
| SHED-022c | 🔲 | Library clone keeps the selected variant's name (`ensureCataloguePlantFromLibrary`) | — | 🔲 Planned |

## Bulk add — CSV upload + template + favourites (RHO-4 Phase 1)

The "Bulk add" header button opens `BulkPastePlantsModal`, which now has a **mode toggle**: "Paste a list" (existing free-text → AI/regex) and "Upload CSV" (new: strict parse against `PLANT_TEMPLATE`). Both feed the same review step. The CSV path is deterministic + tier-free (no Gemini, works on Sprout). Rows are inserted as `source='manual'` via `saveToShed`; rows with the `favourite` flag call `favouritePlant()` after insert.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-BULK-001 | ✅ | Bulk add opens with a mode toggle (Paste / Upload CSV) | — | ✅ Passing |
| SHED-BULK-002 | ✅ | CSV mode "Download template" downloads `rhozly-plants-template.csv` | — | ✅ Passing |
| SHED-BULK-003 | ✅ | CSV upload renders review rows; bad row (watering min>max) flagged + excluded, save counts only valid rows | — | ✅ Passing |
| SHED-BULK-004 | ✅ | Import valid CSV rows creates manual plants; `favourite=true` row lands in the Favourites scope | — | ✅ Passing |
| SHED-BULK-005 | ✅ | Free-text paste still reaches the shared review step (with "Mark all as favourites" toggle) | — | ✅ Passing |

## Plant card actions

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-022 | ✅ | Card click opens PlantEditModal | — | ✅ Passing |
| SHED-023 | ✅ | PlantEditModal close | — | ✅ Passing |
| SHED-023b | ✅ | Tile light icon opens Light tab (not Sun Tracker) | — | ✅ Passing |
| SHED-023c | ✅ | Delete plant with instances → "Keep history" vs "Delete everything" modal | — | ✅ Passing |
| SHED-023d | ✅ | Bulk delete — same choice modal | — | ✅ Passing |
| SHED-023e | ✅ | Bulk assign — modal opens with per-plant qty inputs | — | ✅ Passing |
| SHED-024 | ✅ | Archive plant happy path | — | ✅ Passing |
| SHED-025 | ✅ | Archive cancel keeps Tomato in Active (Tomato chosen because Lavender + Cherry Tomato have AI freshness forks that duplicate names) | — | ✅ Passing |
| SHED-026 | ✅ | Restore archived Mint | — | ✅ Passing |
| SHED-027 | ✅ | Delete plant happy path | — | ✅ Passing |
| SHED-028 | ✅ | Cancel on delete dialog leaves plant in list (handles the bulk-delete-with-instances choice dialog for Rose) | — | ✅ Passing |
| SHED-029 | ❌ | Delete plant with inventory items — dialog warns about cascade | — | ✅ Passing |
| SHED-030 | ✅ | Assign opens modal | — | ✅ Passing |
| SHED-031 | ✅ | Assign — select location + area + Save → Planted | — | ✅ Passing |
| SHED-032 | ✅ | Assign cancel keeps status | — | ✅ Passing |
| SHED-033 | ❌ | Assign — no locations → empty dropdown | Supabase route | ✅ Passing |

## Shed discovery (`shed-discovery.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| SHED-DSC-001 | ✅ | `/shed?tab=watchlist` switches GardenHub to Watchlist; plants grid hidden | — | ✅ Passing |
| SHED-DSC-002 | ✅ | `shed-view-nursery` toggle hides plant grid + search | — | ✅ Passing |
| SHED-DSC-003 | ✅ | Scientific-name search ("Solanum") matches Tomato | — | ✅ Passing |
| SHED-DSC-004 | ✅ | Sort A-Z is the default and renders alphabetically | — | ✅ Passing |
| SHED-DSC-005 | ✅ | Source filter "Plant Database" narrows to api-source (Lavender) | — | ✅ Passing |
| SHED-DSC-006 | ✅ | "All Sources" restores manual plants | — | ✅ Passing |
| SHED-DSC-007 | ⏭ | Credit badge popover shows source + licence — skipped (no api image credits in current seed) | — | ⏭ Skipped |

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
| FAV-004 | ✅ | "Add to this home" copies the tombstone (Snapdragon) into the active home → flips to "In this home" + appears on Home tab | — | ✅ Passing |
| FAV-005 | ✅ | Tier lock — forced Sprout sees disabled hearts on api (Lavender) + ai (Cherry Tomato) plants with upsell tooltip; manual heartable | Sprout profile route patch | ✅ Passing |
| FAV-006 | ✅ | Home-switch persistence (W1 only) — favourites identical after switch to Rooftop Terrace; Fig flips to "In this home"; Home tab re-roots | — | ✅ Passing (W1); skipped on W2–W4 |

## Instance Edit Modal tabs (`instance-edit-tabs.spec.ts`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| IE-001 | ✅ | Journal — add entry persists | — | ✅ Passing |
| IE-002 | ⏭ | Routine — seeded blueprints render as rows — skipped (no blueprints linked to seeded Basil) | — | ⏭ Skipped |
| IE-003 | ✅ | Yield — log harvest stores amount | — | ✅ Passing |
