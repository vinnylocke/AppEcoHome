# PR 6 — E2E suite: Schedule edge cases + Shopping gaps + Planner restore

## Why this scope (not the full catalogue PR 6)

The catalogue PR 6 line says "Planner + Shopping + Blueprints (~50 tests)". This area already has substantial coverage — 77 existing tests across `planner.spec.ts` (24), `shopping.spec.ts` (27), and `schedule.spec.ts` (26). The catalogue lists ~37 🆕 gaps; most are deep flows (5-phase Plan Staging, Optimise scenarios, AI-mocked Garden Overhaul) that deserve their own focused PRs.

This PR closes 12 of the highest-value, most-easily-testable gaps — the validation edge cases and small-scope flows whose absence would surface as user-reported bugs. The deep flows are deferred and documented.

## App-reference files consulted

- [`04-planner/01-planner-dashboard.md`](../app-reference/04-planner/01-planner-dashboard.md) — plan card actions (archive/restore/delete), empty state.
- [`04-planner/05-shopping-lists.md`](../app-reference/04-planner/05-shopping-lists.md) — list lifecycle, item validation, reopen flow, add-to-shed toast.
- [`04-planner/07-blueprint-manager.md`](../app-reference/04-planner/07-blueprint-manager.md) — create/edit form validation, harvest window contract, filter cascade, sort modes.

## What we already have

- `planner.spec.ts` (24) — list render, status tabs, new-plan wizard happy paths, archive, delete, AI-mocked accept flow.
- `shopping.spec.ts` (27) — render, blank-create, rename, expand, item add (plant + product), tick, add-checked-to-shed, mark-complete, delete-with-confirm.
- `schedule.spec.ts` (26) — list render, create (happy path + required fields), edit, delete (blueprint-only + with tasks), basic type filter, ghost emission.

The 12 new tests target ONLY the gaps; no duplication.

## Scope — 12 tests across 3 new spec files

### `schedule-validation.spec.ts` (NEW — 5 tests)

| ID | Test | What it asserts |
|---|---|---|
| SCH-V-001 | Frequency = 0 blocks submit | New blueprint form → set frequency to 0 → click Save → field-level error visible, no DB write |
| SCH-V-002 | Start date after end date blocks submit | Set start = today + 7, end = today + 3 → Save blocked, error visible |
| SCH-V-003 | Harvest type with end_date materialises as window-model | Create Harvest blueprint with end_date set → the resulting blueprint row has `end_date` populated, and the next ghost includes `window_end_date` |
| SCH-V-004 | Filter by location → area cascade | Set location filter → area dropdown is enabled only after location → narrowing reduces the visible blueprint count |
| SCH-V-005 | Sort by frequency surfaces most-frequent first | Switch sort to "frequency" → first card's `frequency_days` <= last card's |

### `shopping-edge-cases.spec.ts` (NEW — 4 tests)

| ID | Test | What it asserts |
|---|---|---|
| SHOP-E-001 | Empty item name blocks submit | Open Add Item → leave name blank → click Add → field-level error visible, no row added |
| SHOP-E-002 | Untick a completed item restores progress | Tick an item → progress N/M → untick → progress (N-1)/M, strikethrough removed |
| SHOP-E-003 | Reopen a completed list moves it back to Active section | List → mark complete → opens in Completed → click "Reopen" → list back in Active |
| SHOP-E-004 | "Add checked plants to Shed" success toast confirms count | Check 2 plant items → click Add → toast: "Added 2 plants to your Shed" |

### `planner-restore.spec.ts` (NEW — 3 tests)

| ID | Test | What it asserts |
|---|---|---|
| PLN-R-001 | Restore from Archived brings plan back to In Progress tab | Archived tab → tap plan → "Restore" → plan disappears from Archived, appears in In Progress |
| PLN-R-002 | Empty Archived tab shows "No archived plans" state | Tab switch with zero archived → empty-state copy + icon visible |
| PLN-R-003 | Card options menu lists Archive + Delete | Click options icon → menu items visible: Archive, Delete |

Total: **12 tests** across **3 new spec files**.

## Page object work

- Extend `PlannerPage.ts` with restoreButton + planOptionsMenuFor(name) + emptyStateArchived locator.
- Extend `SchedulePage.ts` with locationFilterSelect + areaFilterSelect + sortSelect + startDateInput + endDateInput + frequencyError, etc.
- Extend `ShoppingPage.ts` with itemNameError + untickButton(name) + reopenListButton + addCheckedToShedSuccessToast.

No new page objects required — the existing ones are extended.

## data-testid deltas required

Will scan during implementation. Expected additions:

- BlueprintManager: `schedule-sort-select`, `schedule-area-filter`, `schedule-form-frequency-error`, `schedule-form-date-error`.
- Shopping list item: `shopping-item-name-error`, `shopping-list-reopen-{listId}`.
- Planner card: `plan-restore-{planId}`, `plan-archived-empty-state`.

I'll add testids only where targeted by tests; existing testids will be reused where present.

## Seed data

Existing seeds cover everything:
- `03_tasks_blueprints.sql` — has 5 blueprints with varied frequencies + types
- `05_planner.sql` — has 3 plans (1 In Progress, 1 Completed, 1 Archived) so PLN-R-001 can restore one
- `12_shopping_lists.sql` — has 2 lists with 6 items including the seeded plant-link rows

No new seed work required.

## Fixture strategy

All tests use the existing `authenticatedPage` fixture. Mutation-heavy tests (PLN-R-001 restores a seeded archived plan; SHOP-E-003 reopens a completed list) include a small reset helper to put the seeded rows back at end-of-test, OR they re-archive at the end of the test so the next run starts in the same state. I'll go with a beforeEach reset for the Planner and Shopping seeds — same pattern as PR 3's `harvestSeedReset.ts`.

## Risks I've thought about

- **Date-relative seeds.** All seeds use `CURRENT_DATE` offsets. The harvest-window assertion (SCH-V-003) depends on the day's local TZ matching the seed date — I'll use relative offsets in the test, not absolute dates.
- **PLN-R-001 mutation.** Restoring a seeded archived plan changes its status. Will reset to archived in a per-test beforeEach.
- **SHOP-E-002 untick + progress.** Progress widget arithmetic might be visual-only — if so, the test will compare the rendered "N of M" text rather than a data attribute.
- **PLN-R-002 empty state.** If the seed has an archived plan, the archived tab won't be empty. The test will need to archive every visible plan first OR navigate from a fresh state — I'll likely keep it simple by checking the empty-state component on its own page (mocking the planner table to be empty).

## What this does NOT do

- Doesn't cover the 5-phase Plan Staging flow (P1 area, P2 shed, P3 staging, P4 execution, P5 maintenance) — own dedicated PR.
- Doesn't cover Garden Overhaul AI flow (Sage+ tier, image upload, 3-concept result) — own PR with AI mocking.
- Doesn't cover Optimise tab fragmentation / frequency / retire scenarios — own focused PR.
- Doesn't cover schedule pause / auto-blueprint / realtime tests — pause requires extra UI work; auto-blueprints depend on plant-completion side effects; realtime needs a multi-tab fixture.
- Doesn't cover create-from-shopping-template flow (Starter Toolkit / Seasonal Veg) — small follow-up PR worth its own scope.

## Doc updates

- `docs/e2e-test-plan.md` — append three subsections under Sections 06 (Schedule), 04 (Shopping in Section 13), and 09 (Planner) with all 12 rows.
- `TESTING.md` — bump inventory (`schedule-validation.spec.ts` (5) + `shopping-edge-cases.spec.ts` (4) + `planner-restore.spec.ts` (3)).
- The app-reference files for the touched surfaces are already accurate; no updates needed.

## Acceptance criteria

- 12 / 12 new tests green under `--workers=1`.
- `tsc --noEmit` clean.
- Existing `planner.spec.ts` / `shopping.spec.ts` / `schedule.spec.ts` — still green.
- Source `data-testid` additions only on elements the tests target.

---

**Plan ready for approval.** Reply "go ahead" / "looks good" / "yes" to approve, or tell me which tests to drop/swap.
