# Stale test cleanup — 2026-06-15

Five pre-existing test failures (3 Vitest, 2 E2E) flagged at the end of PR 8 + PR 9. None caused by recent product code; all stale tests where the component / behaviour moved on and the assertion didn't.

Plus one PR-8 artefact: the leftover AI-source duplicate plants in the shed-crud worker DB (already cleaned by direct delete in PR 8; documented here so the next person doesn't chase the ghost).

## App-reference files consulted

- [`docs/app-reference/02-dashboard/01-dashboard-tab.md`](../app-reference/02-dashboard/01-dashboard-tab.md) — confirms TodayFocusCard now routes to `/dashboard?view=calendar` for overdue (the test still expects the old `/schedule?filter=overdue`).
- [`docs/app-reference/09-persistent-ui/`] — QuickAccessHome / mobile shell context.
- [`docs/app-reference/03-garden-hub/02-shed-plants.md`](../app-reference/03-garden-hub/02-shed-plants.md) — confirms the bulk-delete dialog shape (3 buttons: Keep history / Delete everything / Cancel) when a plant has ≥1 instance.

## What I'm fixing

| # | Failure | Root cause | Fix |
|---|---|---|---|
| 1 | `tests/unit/lib/taskEngine.test.ts > snoozed physical task ... STILL suppresses the matching ghost` | Test asserts `result.tasks.filter(t => t.id === snoozed.id).toHaveLength(0)`. Wave 20.3 deliberately stopped hiding snoozed tasks from `rawTasks` (engine comment at `taskEngine.ts:316-324` calls this out). The "ghost suppressed" half of the test is still correct. | Update the second assertion to expect the snoozed task IS present (the engine returns it; consumers like the new `taskFilters.ts` helper hide it from list rendering). Rename test for clarity. |
| 2 | `tests/unit/components/TodayFocusCard.test.ts > urgent wins when there are overdue tasks AND it's after 8am` | Test expects route `"/schedule?filter=overdue"`. Component changed to `/dashboard?view=calendar&date=YYYY-MM-DD` (see `TodayFocusCard.tsx:49-65` — the comment explicitly explains the switch). | Update assertion to expect the new route. Stick to the `startsWith("/dashboard?view=calendar")` shape so we don't break next time the dateStr format wobbles. |
| 3 | `tests/unit/components/QuickAccessHome.test.ts > escape-hatch link navigates to /dashboard` | Test looks for `getByTestId("quick-access-open-dashboard")`. The escape-hatch button inside the desktop-only banner at `QuickAccessHome.tsx:125-131` exists but has no testid. | Add `data-testid="quick-access-open-dashboard"` to the button. Small testability tweak that matches the existing testid naming convention. |
| 4 | `tests/e2e/specs/shed-crud.spec.ts > SHED-028: Cancel on delete dialog leaves plant in list` | Test was written for the simple ConfirmModal (Cancel + Delete buttons). The seeded Rose has 1 inventory item, so clicking Delete now opens the **bulk-delete choice dialog** (Keep history / Delete everything / Cancel). The `/^Delete$/` button name doesn't match "Delete everything". | Update assertion to expect the `<dialog>` shape: assert `Delete everything` button is visible, click Cancel, verify the plant card is still there. |
| 5 | `tests/e2e/specs/shed-crud.spec.ts > SHED-029: Delete plant with inventory items — confirm dialog warns about inventory` | Same dialog type, but the description text now reads "Boston Fern has 1 plant in your garden" — the old assertion was for `/inventory item/i`. | Loosen the text matcher to `/plant in your garden|inventory item/i` so it tolerates both the old and new copy. |
| 6 | PR-8 callout: leftover AI-source `Lavender` (id 200013) + `Cherry Tomato` (id 200011) plants in worker 0's DB | Created by previous `plant-doctor.spec.ts` / Create-with-AI runs that don't clean up plant rows. They duplicate seeded plant names → `getByLabel("Archive Lavender")` resolves to 2 elements → SHED-025 strict-mode failure (already cleaned via direct delete in PR 8). | No code change here. Add a one-liner cleanup helper to `tests/e2e/specs/shed-crud.spec.ts` `beforeAll` that deletes any sub-1M-id AI-source plants in the worker's home before the spec runs, so it self-heals next time. |

## Files I'll change

| File | Change |
|---|---|
| `tests/unit/lib/taskEngine.test.ts` | Update the snoozed-task assertion (2 lines) |
| `tests/unit/components/TodayFocusCard.test.ts` | Update the route assertion (1 line) |
| `tests/unit/components/QuickAccessHome.test.ts` | No change — fix lands on the component side |
| `src/components/QuickAccessHome.tsx` | Add `data-testid="quick-access-open-dashboard"` to the escape-hatch button |
| `tests/e2e/specs/shed-crud.spec.ts` | SHED-028 (rewrite to expect bulk-delete dialog), SHED-029 (loosen text matcher), `beforeAll` cleanup of leftover AI plants |

## Risks

Very low — these are test-side fixes plus a single testid addition. No production behaviour changes.

## Acceptance

- `npx vitest run` clean (currently 868/871 → target 871/871)
- `npx playwright test tests/e2e/specs/shed-crud.spec.ts --workers=1` clean for SHED-025/028/029 (was 33 passed + 3 failed + 1 skipped)
- `npx tsc --noEmit` + `npm run build` clean
- One commit: `chore(tests): close stale Vitest + SHED E2E gaps left from PR 7/8`
