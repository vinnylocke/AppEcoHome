# PR 2 — E2E suite: Shed + Plants (sections 03.1 + 03.2)

## Scope

Covers the catalogue's 03.1 (The Shed) and 03.2 (Plant Edit / Assignment / Instance Edit / Bulk Assign) sections, filtered to the gaps not already covered by `shed-crud.spec.ts` (785 lines, ~30 tests).

Target: ~15 new tests across two new spec files, one new page object (`InstanceEditPage`), and modest extensions to `ShedPage` + the existing seeds.

## App-reference files consulted

- [`03-garden-hub/01-the-shed.md`](../app-reference/03-garden-hub/01-the-shed.md) — search uses both common AND scientific name; sort mode `"preference"` exists; source filter dropdown is `Filter by source`; nursery toggle swaps the body content; tier gating (Sprout no AI search / no Ask AI button).
- [`08-modals-and-overlays/06-plant-edit-modal.md`](../app-reference/08-modals-and-overlays/06-plant-edit-modal.md) — Care tab covers name, scientific, sun/water/soil; provider info chip; save flows through `onSave` parent callback.
- [`08-modals-and-overlays/07-plant-assignment-modal.md`](../app-reference/08-modals-and-overlays/07-plant-assignment-modal.md) — two-step modal; Step 1 = location/area/quantity; Step 2 = state/date/propagation/smart-schedules; "Add to garden, area unknown" CTA on Step 1.
- [`08-modals-and-overlays/08-instance-edit-modal.md`](../app-reference/08-modals-and-overlays/08-instance-edit-modal.md) — 10 tabs; Routine + Journal + Yield need real seed data; Care Guide gated on Sage+.
- [`08-modals-and-overlays/39-bulk-assign-modal.md`](../app-reference/08-modals-and-overlays/39-bulk-assign-modal.md) — single combined insert; quantity stepper per plant (1–99); smart schedules opt-in gated on AI + area.

Also re-read [`13-ai-gemini.md`](../app-reference/99-cross-cutting/13-ai-gemini.md) (tier gating on `search-plants-ai`), [`24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) (credit badge contract), [`17-tier-gating.md`](../app-reference/99-cross-cutting/17-tier-gating.md) (Sprout caps).

## What we already have

`tests/e2e/specs/shed-crud.spec.ts` covers SHED-005 through SHED-033 — tabs (active/archived), source filter (manual / api), common-name search, no-match, partial match, case-insensitive, manual add (happy + blank-name + duplicate), library search, external opt-in, card edit/archive/restore/delete (with-instances flows), and assign Step 1.

So we DON'T need to write basics — focus exclusively on the catalogue gaps.

## New tests — final list

### `shed-discovery.spec.ts` (NEW — 7 tests)

| ID | Test | What it asserts |
|---|---|---|
| SHED-DSC-001 | Tab routing — `/shed?tab=watchlist` switches to Watchlist | URL → app responds; Watchlist heading visible |
| SHED-DSC-002 | Tab routing — `/shed?tab=nursery` switches to Nursery view | Nursery rail visible; plant grid hidden |
| SHED-DSC-003 | Search by scientific name matches a card | Type "Solanum" → only tomato visible |
| SHED-DSC-004 | Sort A-Z orders the rendered cards alphabetically | Switch sort → first card text < last card text |
| SHED-DSC-005 | Sort by AI preference floats preferred plants up | Preference seed sets tomato priority; verify it appears first |
| SHED-DSC-006 | Manual plant — name exceeding the input maxLength is truncated | Type 300 chars → input shows truncated value, no validation panic |
| SHED-DSC-007 | Credit badge popover shows source + licence | Click image-credit-badge → popover with "Source:" + "Licence:" rendered |

### `plant-edit-assignment.spec.ts` (NEW — 5 tests)

| ID | Test | What it asserts |
|---|---|---|
| PE-001 | Plant edit — saving without a name shows inline validation | Clear name → click Save → field-level error visible, no write fires |
| PA-001 | Assignment — quantity stepper enforces min 1 | Start at 1, click "−" → still 1; aria-valuemin = 1 |
| PA-002 | Assignment — quantity stepper enforces max 99 | Type 100 → clamped to 99 on blur |
| PA-003 | Assignment — "Add to garden, area unknown" creates instance with `area_id = NULL` | CTA → Step 2 → confirm → seeded plant gains an `inventory_items` row with `area_id` null |
| BA-001 | Bulk assign — selecting 3 plants and confirming creates 3 inventory_items | Select-mode → tap 3 cards → Assign → confirm → DB has 3 new rows |

### `instance-edit-tabs.spec.ts` (NEW — 3 tests)

| ID | Test | What it asserts |
|---|---|---|
| IE-001 | Journal tab — adding an entry persists across reload | Open instance → Journal tab → type entry → save → reload → entry still visible |
| IE-002 | Routine tab — seeded blueprints render as rows | Open instance with a watering blueprint → Routine tab → blueprint row visible |
| IE-003 | Yield tab — recording a harvest stores the amount | Yield tab → log harvest 250g → row appears in history with "250 g" |

Total: **15 tests** across **3 new spec files**.

## Page object work

- `ShedPage.ts` — extend with:
  - `sortModeButton` / `sortAlphaOption` / `sortPreferenceOption`
  - `creditBadge(plantName)` + `creditPopover`
  - `nurseryToggleButton`
  - `tabRouteWatchlistButton` (or rely on `goto("/shed?tab=watchlist")` directly)
- `PlantEditPage.ts` — NEW (tiny): nameInput, saveButton, fieldErrorName.
- `PlantAssignmentPage.ts` — NEW: locationSelect, areaSelect, quantityInput, decrementButton, incrementButton, nextButton, confirmButton, addToGardenButton.
- `BulkAssignPage.ts` — NEW: quantityFor(plantName), confirmButton, modalRoot.
- `InstanceEditPage.ts` — NEW: tab(name), journal helpers (entryInput, saveButton, entries), yield helpers (amountInput, unitSelect, recordButton, historyRows), routine helpers (rows).

## data-testid deltas needed

I'll scan during implementation. Expected:
- `plant-edit-name-input` + `plant-edit-name-error` + `plant-edit-save` on PlantEditModal
- `plant-assign-location` / `plant-assign-area` / `plant-assign-quantity` / `plant-assign-decrement` / `plant-assign-increment` / `plant-assign-next` / `plant-assign-confirm` / `plant-assign-add-to-garden` on PlantAssignmentModal
- `bulk-assign-quantity-{plantId}` already exists (per ShedPage); `bulk-assign-modal` exists
- `instance-edit-tab-{name}` per InstanceEditModal tab
- Existing `image-credit-badge` is enough for the credit test

I will NOT change selectors that already work; only add testids on elements currently unreachable.

## Seed data

Existing seeds should cover everything:
- `02_plants_shed.sql` already has tomato (scientific: `Solanum lycopersicum`), enough for scientific-name search and sort-A-Z.
- `03_tasks_blueprints.sql` has a watering blueprint linked to a plant.
- `08_profile_preferences.sql` already has preferences that would float specific plants.

If during implementation I find a seeded plant lacks `scientific_name`, I'll patch the seed in the same PR.

## Fixture strategy

All tests use the existing `authenticatedPage` fixture — no new fixtures needed. The seeded test1@rhozly.com user has the home, plants, blueprints, and preferences set up.

Per CLAUDE.md isolation rules — never seed inside tests; use fixed seed UUIDs. The instance-edit tests target the seeded `Solanum lycopersicum` plant + a known `inventory_items` row.

## Risks / things to watch

- **Sort A-Z**: depends on whether the Shed has an explicit "A-Z" sort mode in the UI or relies on default order. If there's no UI control, I'll downgrade SHED-DSC-004 to assert default-order stability instead.
- **Nursery toggle**: source already mentions a `Plants / Nursery` toggle pill. If the testid doesn't exist, I'll add it.
- **AI preference sort**: requires preferences seed to be active. If the test1 preferences don't actually move the order, I'll skip the test rather than fudge it.
- **Tab routing tests** (`/shed?tab=watchlist`): need to confirm the route is wired this way; the app-reference doc mentions the watchlist's route is `/shed?tab=watchlist` but if it's actually `/watchlist` I'll adjust.
- **Instance edit tab order** — if the seed inventory_item for the tomato doesn't already exist with the expected ID, IE-001/002/003 each fall back to "create then assert" patterns rather than relying on pre-existing data.

## What this does NOT do

- Doesn't touch the Care Guide tab AI rendering (Sage+ tier, separate flow).
- Doesn't cover Companions, Light, Stats, or Photo Timeline tabs (each is a separate PR per the catalogue).
- Doesn't cover the AssistantCard on the Shed (cross-cutting AI feature, separate PR).
- Doesn't cover the paste-list bulk add or `bulk-queue-shows-pending-processing-success-error` — those need a more elaborate fixture for the multi-stage async UI; deferring to PR 3 or later.
- Doesn't cover the Sprout tier-gate on AI Generate — requires a Sprout-tier fixture variant; deferring.

## Test plan + doc updates

- [`docs/e2e-test-plan.md`](../e2e-test-plan.md) — append rows for the 15 new tests (Section 03.x)
- [`TESTING.md`](../../TESTING.md) — bump inventory: add `shed-discovery.spec.ts (7)`, `plant-edit-assignment.spec.ts (5)`, `instance-edit-tabs.spec.ts (3)`
- Page-object files added to the directory tree section
- Catalogue file ([`e2e-test-suite-comprehensive.md`](./e2e-test-suite-comprehensive.md)) — flip the implemented 🆕 → ✅

## Acceptance criteria

- 15 / 15 new tests green when run under `--workers=1` against local DB
- Suite still parallel-safe (no shared mutable state introduced)
- `tsc --noEmit` clean
- `shed-crud.spec.ts` regression — still green

---

**Plan ready for approval.** Reply "go ahead" / "looks good" / "yes" and I'll implement, or call out which tests to drop/swap/add.
