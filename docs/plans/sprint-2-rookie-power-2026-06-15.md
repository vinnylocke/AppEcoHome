# Sprint 2 — rookie-power PR

Source: [docs/plans/ux-review-action-analysis-2026-06-15.md](./ux-review-action-analysis-2026-06-15.md), Sprint 2 lane.

## Items

| # | Item | Difficulty | Schema work |
|---|---|---|---|
| 4.2 | **One-click watering reminder** on PlantEditModal care tab | S | None |
| 1.4 | **Quiz re-prompt** — replace boolean dismiss with date-based snooze | S | None (uses `user_profiles.onboarding_state` jsonb) |
| 6.1 | **Bookmark Rhozly guides** — heart icon + saved-filter | S | New `user_guide_saves` table + RLS |
| 6.5 | **Tier Selection + Welcome Modal desktop layouts** — tablet/desktop breakpoints | S | None |
| 6.8 | **`/help` route** — reuse Rhozly Guides with category filter | S | New column `guides.category` (or audit if it already exists) |
| 7.1 | **Mobile thumb-zone user dropdown** — bottom-zone mirror on QuickAccessHome | S | None |

## Code touched (per item)

- **4.2** [src/components/PlantEditModal.tsx](src/components/PlantEditModal.tsx) — care tab gets a new "Quick reminder" button. Pre-fills task_blueprints insert (type=Watering, frequency = plant.watering_min_days || 4, linked to all instances of this plant). Toast on save.
- **1.4** [src/App.tsx](src/App.tsx) (lines 458–1405 area) — replace `quizPromptDismissed` in-memory with a server-persisted `quiz_dismissed_until` ISO date inside `onboarding_state`. Default snooze 14 days. Add "Don't ask again" sub-action that sets a far-future date.
- **6.1** new table `user_guide_saves (uid, guide_id, created_at)` + RLS. [src/components/GuideList.tsx](src/components/GuideList.tsx) + [src/components/GuideViewModal.tsx](src/components/GuideViewModal.tsx) — heart icon + "Saved" filter chip. New helper in [src/services/guidesService.ts](src/services/guidesService.ts) (or inline if no service exists yet).
- **6.5** [src/components/WelcomeModal.tsx](src/components/WelcomeModal.tsx) + [src/components/TierSelection.tsx](src/components/TierSelection.tsx) (or whatever the tier picker is called) — bump max-w + add lg: breakpoint adjustments.
- **6.8** new route `/help` → [src/components/HelpPage.tsx](src/components/HelpPage.tsx). Reuses `GuideList` filtered to `category='help'`. Schema check first: if `guides.category` exists already use it, otherwise add column. Adds nav menu entry.
- **7.1** [src/components/QuickAccessHome.tsx](src/components/QuickAccessHome.tsx) — small floating user-menu button bottom-right that opens the same UserProfileDropdown content.

## App-reference files consulted / to update

Will read before plan finalisation:
- `docs/app-reference/01-onboarding/04-welcome-modal.md` (1.4 reprompt change)
- `docs/app-reference/01-onboarding/05-quiz.md` (1.4)
- `docs/app-reference/07-management/02-plants-modal.md` (4.2)
- `docs/app-reference/05-guides/01-guide-list.md` (6.1, 6.8)
- `docs/app-reference/01-onboarding/02-tier-selection.md` (6.5)
- `docs/app-reference/09-persistent-ui/01-bottom-nav.md` (7.1)
- `docs/app-reference/99-cross-cutting/19-rls-patterns.md` (6.1 RLS)
- `docs/app-reference/99-cross-cutting/03-data-model-plants.md` (4.2)
- `docs/app-reference/99-cross-cutting/30-onboarding-state.md` (1.4)
- `docs/app-reference/99-cross-cutting/21-routing.md` (6.8 new route)
- `docs/app-reference/99-cross-cutting/30-onboarding-state.md` (1.4)

## Suggested PR shape — recommend "one PR, two migrations"

All 6 items in a single PR. Migrations land first (`user_guide_saves` + `guides.category` if needed). The remaining items are all UI. Single deploy.

**Alternative — split into 2a / 2b:**
- 2a (no schema): 4.2, 1.4, 6.5, 7.1
- 2b (schema): 6.1, 6.8

Splitting buys lower per-PR risk but doubles the deploys.

## Risks

- 1.4 changes a behaviour Mia/Sam might have already experienced — if anyone has already dismissed the quiz, the new snooze date won't exist, treat absent as "re-prompt eligible immediately." Behaviour change documented in release notes.
- 6.1 RLS must be tight — saves are per-user (uid = auth.uid()). Use the existing patterns in [docs/app-reference/99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md).
- 6.8 — if `guides.category` doesn't exist, adding it is fine but seeded help content has to land in the same migration (or there's nothing to show at /help on first deploy).

## Tests

- 4.2 — unit test for the blueprint-payload builder.
- 1.4 — unit test for the "is quiz prompt due?" calc.
- 6.1 — E2E test in `tests/e2e/specs/guides.spec.ts` toggling the save state.
- 6.8 — E2E test that `/help` route renders.
- 6.5 — visual only, no test.
- 7.1 — E2E that the mobile bottom user menu opens UserProfileDropdown.
