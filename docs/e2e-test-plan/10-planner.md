# 10. Planner

**Spec files:** `tests/e2e/specs/planner.spec.ts` · `tests/e2e/specs/planner-restore.spec.ts`
**Page Object:** `tests/e2e/pages/PlannerPage.ts`
**Per-test reset:** inline `resetWinterPrepArchived()` — sets the seeded "Winter Prep" plan back to `status='Archived'` so PLN-R-003's restore mutation doesn't break sibling tests.
**Seed dependencies:** `05_planner.sql`
**App-reference:** [04-planner/01-planner-dashboard.md](../app-reference/04-planner/01-planner-dashboard.md)

### Phase 4.6 — Planner Dashboard redesign (2026-07)

The dashboard redesign changed several test-facing surfaces:

- **Split "New Plan" CTA.** The single button is now a split control: a primary **New Plan** (`data-testid="planner-new-plan-btn"`) plus a caret (`data-testid="planner-create-menu-btn"`, `aria-label="More plan types"`) that opens a `role="menu"` (`data-testid="planner-create-menu"`) holding the two AI Sage+ modes — **Reimagine** (`planner-overhaul-btn`) and **My Plants** (`planner-plant-first-btn`). The three original test IDs are preserved on their triggers, so existing selectors keep resolving; new coverage should reach the AI modes **through** the caret (they no longer sit at the top level).
- **Kind-tinted cover fallback.** Photoless plans now render a gradient cover keyed to `kind` (emerald + sprout for `plant-first`, brand-primary + planner icon otherwise) instead of a flat-grey icon.
- **Phase-progress bar** (`data-testid="plan-phase-progress-{id}"`) on Draft / In Progress cards — "Phase N of 5 · X/5 done"; suppressed for Completed, Archived, and `plant-first` plans.
- **Radius** normalised `rounded-[2.5rem]` → `rounded-3xl` (cards + skeletons; cosmetic, no selector impact).

**Pre-existing bug fixed in PLAN-017 (delete-plan flow).** The throwaway plan the delete test created was named with the literal words **"Delete Plan"**. That name flowed into each card's Sun-tracker button `aria-label` (`Open <name> in Sun Tracker`), so a `/Delete Plan/i` locator matched **both** the kebab menu item **and** the Sun-tracker label — and the plain `"Delete"` confirm text matched multiple elements too. Playwright strict-mode threw on the ambiguity, but the throw was swallowed by the old guarded `isVisible().catch()` wrapper, so the confirm click never fired and the plan was never actually deleted (the assertion passed vacuously). Fixed by: renaming the throwaway plan to **"E2E Throwaway Plan"** (no reserved verbs), exact-matching the menu item and the confirm button, and asserting on the card heading disappearing rather than a soft visibility guard.

**Winter Prep archived-state dependency.** PLAN-008 (Archived tab shows "Winter Prep") and PLAN-019 (Unarchive Winter Prep) both assume the seeded "Winter Prep" plan starts `status='Archived'`. Their own cleanups can drift that state locally if a run is interrupted — CI reseeds per run so it's reliable there; locally, re-run `npm run test:seed` if these two start failing spuriously.

## Main planner

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PLAN-001 | ✅ | Planner heading renders | — | ✅ Passing |
| PLAN-002 | ✅ | Split "New Plan" CTA visible — primary `planner-new-plan-btn` + caret `planner-create-menu-btn` | — | ✅ Passing |
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
| PLAN-017 | ✅ | Delete plan confirm — creates "E2E Throwaway Plan", exact-matches kebab Delete + confirm, asserts heading gone (see fix note above) | — | ✅ Passing |
| PLAN-018 | ✅ | Delete plan cancel | — | ✅ Passing |
| PLAN-019 | ✅ | Unarchive Winter Prep → returns to Pending | — | ✅ Passing |
| PLAN-020 | ✅ | Click plan card → PlanStaging | — | ✅ Passing |
| PLAN-021 | ✅ | Back from staging → plan list | — | ✅ Passing |
| PLAN-022 | ✅ | Split-CTA caret (`planner-create-menu-btn`) opens create menu (`planner-create-menu`) with Reimagine + My Plants items | — | 🔲 Planned |
| PLAN-023 | ✅ | Phase-progress bar (`plan-phase-progress-{id}`) shows "Phase N of 5 · X/5 done" on a Draft/In Progress card; absent on Completed/Archived | — | 🔲 Planned |
| PLAN-024 | ✅ | Kind-tinted cover fallback — photoless plan card renders a gradient cover (not flat grey); `plant-first` card shows the sprout variant | — | 🔲 Planned |

## Archive + restore regression net

**Spec file:** `tests/e2e/specs/planner-restore.spec.ts`
**Page Object update:** `pendingTab` regex `/Pending/i` → `/Active/i` to match the actual UI label "Active (N)".

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PLN-R-001 | ✅ | Seeded archived plan visible on Archived tab | — | ✅ Passing |
| PLN-R-002 | ✅ | Archived plan options menu shows Restore Plan + Delete Plan | — | ✅ Passing |
| PLN-R-003 | ✅ | Restore Plan → confirm → moves from Archived to Active | — | ✅ Passing |

## Plant-first planner

**Surface:** "My Plants" item in the Planner Dashboard split-CTA create menu (Phase 4.6 — reach it via the caret `planner-create-menu-btn`, then `planner-plant-first-btn`) → `PlantFirstPlanForm` wizard → saved `kind='plant-first'` plan renders in `PlantFirstPlanView` (not Plan Staging).
**App-reference:** [04-planner/10-plant-first-planner.md](../app-reference/04-planner/10-plant-first-planner.md)
**Tier:** Sage+ (`generate-plant-first-plan` re-verifies via `guardAiByUser` + rate limit).
**Unit / Deno coverage (already passing):**
- `tests/unit/lib/plantFirstPlan.test.ts` — `countBlueprintPlants` (sums across area groups; null/empty → 0).
- `supabase/tests/plantFirstBlueprint.test.ts` (6 tests) — `normalisePlantFirstBlueprint`: area cap, drop empty areas, clamp quantity/frequency, coerce missing fields, derive `is_new`.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PFP-001 | ✅ | Create-menu caret → "My Plants" (`planner-plant-first-btn`) opens the wizard (`plant-first-form`) | — | 🔲 Planned |
| PFP-002 | ✅ | Step 1 — pick a Shed plant + a searched plant; chips show; Continue enables | — | 🔲 Planned |
| PFP-003 | ✅ | Step 2 — name + notes + pick an area mode; Generate fires edge fn | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-004 | ✅ | Step 3 — review renders per-area cards (existing/new badge, pairing, plants, maintenance) | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-005 | ✅ | Regenerate-with-feedback re-invokes edge fn with `isRegeneration`/`feedback` | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-006 | ✅ | Create writes a `kind='plant-first'` plan; opens `PlantFirstPlanView` | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-007 | ✅ | "Set up my garden" materialises (new areas + Shed plants + tasks); button flips to done | `generate-plant-first-plan` mock | 🔲 Planned |
| PFP-008 | ❌ | Edge fn error → error toast; stays on step | `generate-plant-first-plan` 500 | 🔲 Planned |
