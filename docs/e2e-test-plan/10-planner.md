# 10. Planner

**Spec files:** `tests/e2e/specs/planner.spec.ts` · `tests/e2e/specs/planner-restore.spec.ts`
**Page Object:** `tests/e2e/pages/PlannerPage.ts`
**Per-test reset:** inline `resetWinterPrepArchived()` — sets the seeded "Winter Prep" plan back to `status='Archived'` so PLN-R-003's restore mutation doesn't break sibling tests.
**Seed dependencies:** `05_planner.sql`
**App-reference:** [04-planner/01-planner-dashboard.md](../app-reference/04-planner/01-planner-dashboard.md)

## Main planner

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PLAN-001 | ✅ | Planner heading renders | — | ✅ Passing |
| PLAN-002 | ✅ | "New Plan" button visible | — | ✅ Passing |
| PLAN-003 | ✅ | Three status tabs (Pending, Completed, Archived) | — | ✅ Passing |
| PLAN-004 | ✅ | Nav link → `/planner` | — | ✅ Passing |
| PLAN-005 | ✅ | "Summer Veg Plan" (In Progress) in Pending tab | — | ✅ Passing |
| PLAN-006 | ✅ | Empty state — "No Pending Plans" for clean account | — | ✅ Passing |
| PLAN-007 | ✅ | Completed tab shows "Spring Cleanup" | — | ✅ Passing |
| PLAN-008 | ✅ | Archived tab shows "Winter Prep" | — | ✅ Passing |
| PLAN-009 | ✅ | New Plan opens modal | — | ✅ Passing |
| PLAN-010 | ✅ | New Plan close | — | ✅ Passing |
| PLAN-011 | ❌ | New Plan blank name validation | — | ✅ Passing |
| PLAN-012 | ✅ | New Plan AI generation — "Project Generated Successfully!" toast | `generate-landscape-plan` mock | ✅ Passing |
| PLAN-013 | ❌ | New Plan AI error → error toast | `generate-landscape-plan` 500 | ✅ Passing |
| PLAN-014 | ✅ | Plan card three-dot menu (Archive/Delete) | — | ✅ Passing |
| PLAN-015 | ✅ | Archive plan moves to Archived tab | — | ✅ Passing |
| PLAN-016 | ✅ | Archive cancel | — | ✅ Passing |
| PLAN-017 | ✅ | Delete plan confirm | — | ✅ Passing |
| PLAN-018 | ✅ | Delete plan cancel | — | ✅ Passing |
| PLAN-019 | ✅ | Unarchive Winter Prep → returns to Pending | — | ✅ Passing |
| PLAN-020 | ✅ | Click plan card → PlanStaging | — | ✅ Passing |
| PLAN-021 | ✅ | Back from staging → plan list | — | ✅ Passing |

## Archive + restore regression net

**Spec file:** `tests/e2e/specs/planner-restore.spec.ts`
**Page Object update:** `pendingTab` regex `/Pending/i` → `/Active/i` to match the actual UI label "Active (N)".

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PLN-R-001 | ✅ | Seeded archived plan visible on Archived tab | — | ✅ Passing |
| PLN-R-002 | ✅ | Archived plan options menu shows Restore Plan + Delete Plan | — | ✅ Passing |
| PLN-R-003 | ✅ | Restore Plan → confirm → moves from Archived to Active | — | ✅ Passing |
