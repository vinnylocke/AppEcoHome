# Remove all user-visible "promise" strings from the app UI

**Date:** 2026-07-07 · **Follows:** the Garden AI "NO ROADMAP TALK" fix (35.0021). The user asked that *the app itself* never promises anything either — no "coming soon", no "auto-add coming soon", no roadmap hints in the UI.

## Findings (full case-insensitive sweep of `src/` for coming soon / next update / stay tuned / on the way / roadmap / lands in a later …)

| Site | What it says | Reality | Fix |
|------|--------------|---------|-----|
| `src/components/ShoppingLists.tsx:268` | "Browse your plans for plants to add to a shopping list. **Auto-add coming soon.**" | Auto-add doesn't exist (manual step — same fact the AI's appFacts now pins) | Drop the promise sentence |
| `src/components/GardenerProfile.tsx:255-259` | Amber "Coming soon" badge on any notification category with `wired: false` | **All 8 categories are `wired: true`** — the badge can never render; dead code that silently resurfaces a promise the moment someone adds an unwired category | Remove the badge + the now-unused `wired` field |
| `src/components/quick/QuickTile.tsx` | `variant?: "live" \| "coming-soon"` → subdued tile + "Soon"/"Coming soon" amber badge (`${testId}-coming-soon`) | **No caller ever passes `variant`** — the Wave-16 launcher renders only live, navigating tiles. Dead promise UI | Remove the variant prop, `isLive` branches, badges, disabled styling, `Clock` import |
| `src/components/nursery/SeedPacketDetailModal.tsx:63-69` | Doc comment: buttons "disabled with a 'Coming next update' tooltip" | Plant Out shipped (Wave 3) — buttons are live with functional tooltips | Fix the stale comment |
| `src/components/nursery/AddSeedPacketModal.tsx:40-41` | Doc comment: "Catalogue-aware search … lands in a later wave" | Roadmap language in a doc comment | Reword to factual present tense |

## Tests

- `tests/unit/components/QuickTile.test.ts` — remove the three coming-soon variant tests; keep the live-tile tests (drop the now-invalid `variant` props).
- `tests/e2e/specs/quick-access.spec.ts` — **pre-existing drift found**: QUICK-002 expects `lens`/`calendar` tiles and QUICK-004/005 expect "Coming soon" toasts. Neither exists since the Wave-16 launcher rebuild (catalogue has no `lens`/`calendar` ids; tiles always navigate). Retire QUICK-004/005 (same style as retired QUICK-003/007/008) and repoint QUICK-002 at the real default pins (`doctor`/`today`/`capture`/`shed`).
- Note: `quick-access.spec.ts` has no rows in `docs/e2e-test-plan/` (pre-existing gap) — retired tests noted in the spec itself.

## App-reference consulted

- `docs/app-reference/02-dashboard/09-quick-access-home.md` (documents the coming-soon badge/toast — now stale)
- `docs/app-reference/06-account/02-notifications-tab.md` (documents coming-soon notification categories — now stale; all wired)
- `docs/app-reference/04-planner/05-shopping-lists.md` + `06-shopping-list-items.md` (no promise strings — plan-suggest banner copy change only)
- `docs/app-reference/03-garden-hub/10-nursery.md` (no promise strings)

## App-reference updates (same task)

- `09-quick-access-home.md` — remove the "Coming soon" badge row, pitfall, and toast troubleshooting entries.
- `02-notifications-tab.md` — remove the three coming-soon mentions; all categories are wired to delivery.

## Risks

- QuickTile simplification touches shared styling branches — covered by the remaining unit tests + `npm run build`.
- Removing dead `wired`/`variant` fields is API-narrowing; typecheck confirms no other consumers.

## Ship

`npm run typecheck` → `npm run test:unit` → `npm run build` → release note → `npm run deploy -- --bump 1` → `git push origin main`.
