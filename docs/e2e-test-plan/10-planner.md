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

## Plant-first planner

**Surface:** "My Plants" button on the Planner Dashboard → `PlantFirstPlanForm` wizard → saved `kind='plant-first'` plan renders in `PlantFirstPlanView` (not Plan Staging).
**App-reference:** [04-planner/10-plant-first-planner.md](../app-reference/04-planner/10-plant-first-planner.md)
**Tier:** Sage+ (`generate-plant-first-plan` re-verifies via `guardAiByUser` + rate limit).
**Unit / Deno coverage (already passing):**
- `tests/unit/lib/plantFirstPlan.test.ts` — `countBlueprintPlants` (sums across area groups; null/empty → 0).
- `supabase/tests/plantFirstBlueprint.test.ts` (6 tests) — `normalisePlantFirstBlueprint`: area cap, drop empty areas, clamp quantity/frequency, coerce missing fields, derive `is_new`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PFP-001 | ✅ | "My Plants" button opens the wizard (`plant-first-form`) | — | 🔲 Planned |
| PFP-002 | ✅ | Step 1 — pick a Shed plant + a searched plant; chips show; Continue enables | — | 🔲 Planned |
| PFP-003 | ✅ | Step 2 — name + notes + pick an area mode; Generate fires edge fn | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-004 | ✅ | Step 3 — review renders per-area cards (existing/new badge, pairing, plants, maintenance) | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-005 | ✅ | Regenerate-with-feedback re-invokes edge fn with `isRegeneration`/`feedback` | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-006 | ✅ | Create writes a `kind='plant-first'` plan; opens `PlantFirstPlanView` | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-007 | ✅ | "Set up my garden" materialises (new areas + Shed plants + tasks); button flips to done | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-008 | ❌ | Edge fn error → error toast; stays on step | `generate-plant-first-plan` 500 | 🔲 Planned |
