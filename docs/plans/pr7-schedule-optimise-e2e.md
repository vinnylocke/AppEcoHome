# PR 7 — Schedule Optimise tab E2E + test-plan reconciliation

## Goal

Close the genuine gap in the E2E suite — the Schedule Optimise tab (SCH-029 → SCH-039, 11 tests) is the only block of "Planned" items in [`docs/e2e-test-plan.md`](../e2e-test-plan.md) that isn't actually implemented. Add deterministic spec coverage for the Analyse → propose → apply → undo loop plus AI Analyse and reconcile the test-plan doc against reality (Shopping + Realtime sections were implemented in earlier PRs but never flipped from 🔲 → ✅).

## State of the world before PR 7

| Group | Doc | Reality |
|---|---|---|
| Realtime RT-001 → RT-004 | 🔲 Planned ×4 | ✅ Live in `realtime.spec.ts` |
| Shopping SHP-001 → SHP-028 | 🔲 Planned ×28 | ✅ Live in `shopping.spec.ts` |
| **Schedule Optimise SCH-029 → SCH-039** | 🔲 Planned ×11 | ❌ Missing — no spec, no Page Object selectors |

Existing `data-testid` count on the Optimise surface: 11 in `OptimiseTab.tsx`, 5 in `OptimisationProposalCard.tsx`, 3 in `OptimisationHistory.tsx`.

## Files I'll change

| File | Change |
|---|---|
| `tests/e2e/specs/schedule-optimise.spec.ts` (new) | The 11 SCH-029 → SCH-039 tests |
| `tests/e2e/pages/SchedulePage.ts` | Add Optimise tab selectors / helpers |
| `src/components/OptimiseTab.tsx` | Add any missing `data-testid`s (Analyse, AI Analyse, Apply, Undo, Regenerate, area select) |
| `src/components/OptimisationProposalCard.tsx` | Add `data-testid`s for proposal cards, include/exclude checkbox, thumbs feedback |
| `src/components/OptimisationHistory.tsx` | Add `data-testid` for history rows + Undo button (if missing) |
| `supabase/seeds/03_tasks_blueprints.sql` | Add a 9th blueprint (`BP_WATER_DUPLICATE_ID`) — a near-duplicate weekly watering in the same area as `BP_WATER_WEEKLY_ID` so the fragmentation rule has reliable input |
| `docs/e2e-test-plan.md` | Flip stale 🔲 → ✅ on Shopping + Realtime sections; mark Optimise tests ✅ once they pass |

## Approach — per test

| ID | What it asserts | How |
|---|---|---|
| SCH-029 | Tab bar shows Blueprints + Optimise tabs | Render `/schedule`, assert both tab buttons visible |
| SCH-030 | Switch to Optimise tab | Click tab, assert area selector + "Find Improvements" / "Analyse" button visible |
| SCH-031 | Analyse with no issues → "All good!" | Pick an area with one blueprint, click Analyse, assert empty-result message |
| SCH-032 | Analyse produces proposals | Pick the area containing the new duplicate pair, click Analyse, assert at least one proposal card |
| SCH-033 | Toggle proposal include/exclude | Uncheck a proposal's include checkbox, assert apply-count badge decrements |
| SCH-034 | Apply optimisation | Click Apply → confirm → toast "Applied X optimisation(s)" + history row appears |
| SCH-035 | Undo session | Click Undo on the history row → toast, blueprints tab shows the originals back |
| SCH-036 | AI Analyse hidden without ai_enabled | Seed default profile has no `ai_enabled`; assert button not visible |
| SCH-037 | AI Analyse returns proposals (mock) | Mock the `optimise-ai` edge function response; assert AI-badged cards |
| SCH-038 | AI proposal thumbs feedback | Click thumbs-up; assert buttons disable and feedback row inserted |
| SCH-039 | Regenerate modal opens | Click "Regenerate AI results"; assert modal textarea visible |

## Determinism strategy

- The Analyse engine is async + chunked. Lean on the **presence** of the proposals grid (`data-testid="optimise-proposals-grid"`) before assertion, not row counts where avoidable.
- SCH-032 relies on the new seed pair — keep their `frequency_days` values close enough (e.g. 7 and 5) that the fragmentation rule fires deterministically.
- AI tests (SCH-037 / 038 / 039) **mock the edge function response** so they don't depend on Gemini availability or quotas. Pattern is already used by `plant-doctor-chat.spec.ts` etc.
- SCH-036 — to assert hidden-without-`ai_enabled`, we don't change the seed; the default profile has no AI tier. SCH-037 → 039 use a small mock-shim that pretends the profile has `ai_enabled = true` for those tests only (route-level shim, not a DB write).

## Seed change details

Add to `03_tasks_blueprints.sql`:

```sql
INSERT INTO public.task_blueprints (
  id, home_id, area_id, title, task_type,
  frequency_days, schedule_kind, is_paused,
  start_date, end_date
) VALUES (
  '{prefix}-0000-0000-0004-000000000009',
  '{home_id}',
  '{prefix}-0000-0000-0002-000000000001', -- AREA_RAISED_BED_ID (same as BP_WATER_WEEKLY_ID)
  'Bed A Extra Water',
  'watering',
  5,                          -- BP_WATER_WEEKLY_ID is 7 days; 5 days here = fragmentation
  'recurring', false,
  CURRENT_DATE, NULL
)
ON CONFLICT (id) DO UPDATE SET
  frequency_days = EXCLUDED.frequency_days,
  title = EXCLUDED.title;
```

The `unique_blueprint_date` constraint doesn't apply (no task row, only a blueprint). Idempotent via `ON CONFLICT DO UPDATE`.

## Risks

1. **Optimise engine response shape may shift** between code reads — I'll read the current OptimiseTab.tsx end-to-end before writing assertions so they target the actual rendered DOM, not assumptions.
2. **Mock-shim for AI tier** could leak state into other tests in the same worker — I'll scope it via Playwright's `page.route()` so it's torn down at end of test.
3. **Seed change might affect Calendar / Schedule list tests** that count blueprints in `AREA_RAISED_BED_ID`. I'll grep for any test that does `expect(...).toHaveCount(N)` on blueprints in that area and update if needed.

## Acceptance

- `npm run test:e2e -- --grep "SCH-03"` passes all 11 new tests on worker 0 locally.
- No regression on existing `schedule.spec.ts` / `schedule-validation.spec.ts` tests.
- `docs/e2e-test-plan.md`: SHP-* + RT-* + SCH-029 → SCH-039 flipped to ✅.
- One commit: `test(e2e): PR 7 — Schedule Optimise tab + test-plan reconciliation`.

## App-reference files consulted

The task is test-coverage-only and doesn't change product behaviour, so the only relevant app-reference files are read-only context:

- (No app-reference file yet exists for `OptimiseTab`. Not creating one in this PR — tests are not a UI surface; if the architect mandate requires it for product code, that's a separate task.)

## App-reference files to update

None — no user-facing surface changes; this is pure test-coverage + seed + doc reconciliation.
