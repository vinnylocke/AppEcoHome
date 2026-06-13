# Plan — PR 1: E2E tests for Auth + Onboarding + Home Setup (incl. Join Home)

First themed PR cutting from the comprehensive catalog ([`e2e-test-suite-comprehensive.md`](./e2e-test-suite-comprehensive.md)). Highest priority because:

- Closes the **Join Home** gap the user flagged explicitly.
- Foundational layer — every other suite needs auth, session restore, and a home in scope to even run.

## Scope (≈45 tests)

| File | New tests | What it covers |
|---|---:|---|
| `tests/e2e/specs/auth.spec.ts` (extend) | +13 | Sign-up validation, sign-out clears state, magic-link callback (mocked), session restore, deep-link redirect-after-login, lockout banner, password-reset success copy |
| `tests/e2e/specs/home-setup-create.spec.ts` (new) | +9 | Tile routes to create, empty name blocks submit, timezone autodetect, country flips hemisphere, postcode skipped allowed, sync-weather fires on success, cancel-X visibility, RPC failure preserves form state |
| `tests/e2e/specs/home-setup-join.spec.ts` (new — user-flagged gap) | +14 | R2-001 → R2-014: tile routes, empty + whitespace input, invalid UUID format, unknown home id, valid join + profile update, already-member error, no sync-weather call, paste trims whitespace, re-join after removal works |
| `tests/e2e/specs/welcome-modal.spec.ts` (new) | +9 | Slide-by-slide nav, skip from any slide, take-quiz CTA, localStorage flag prevents re-open, ESC closes, swipe on mobile |

That's the catalog rows R1.1, R1.2, R1.3 + R2-001..R2-033 + R3-001..R3-013.

## Out of scope (will land in later PRs)

- Tier Selection + Garden Quiz + Getting Started Checklist + Notification Opt-In + PWA install — these need additional onboarding fixture work (PR 2).
- OAuth callback flows — needs Supabase auth-emulator config (PR 2 or 3).

## Approach

### Test isolation strategy

The existing `authenticatedPage` fixture in `tests/e2e/fixtures/auth.ts` signs the test user in and routes to `/dashboard`. For Home Setup the user has to have **no home** so the app renders the wizard. Three options considered:

1. **Mutate seed data per test** (slow, racy across workers)
2. **Spin up a dedicated worker account with no home** (needs new bootstrap row per worker)
3. **Intercept the `user_profiles` GET** with `page.route()` and inject `home_id: null` (fast, no DB mutation)

Picking option 3 — `page.route()` is already used in the auth fixture for `/auth/v1/user`. Add a `noHomeYetPage` fixture variant that does:

```ts
await page.route('**/rest/v1/user_profiles*', (route) => {
  // Return profile with home_id=null + welcomed_at=null
});
```

For the join/create success paths we intercept the relevant write so the test asserts on UI behaviour, not the DB. Where the test needs a real DB write (e.g. "profile.home_id reflects the join"), we let the call through but assert on the post-success route.

### data-testid additions

Minimal additions to `src/components/HomeSetup.tsx` for stable selectors:

| Element | New testid |
|---|---|
| Selection tile — Create New Home | `home-setup-create-tile` |
| Selection tile — Join Existing Home | `home-setup-join-tile` |
| Selection — back arrow on create | `home-setup-back-from-create` |
| Selection — back arrow on join | `home-setup-back-from-join` |
| Create — submit button | `home-setup-create-submit` |
| Create — cancel-X | `home-setup-cancel-x` |
| Join — submit button | `home-setup-join-submit` |
| Form error alert (both forms) | `home-setup-form-error` |

Country, timezone, and form inputs already have stable selectors (testid or htmlFor).

### New page objects

- `tests/e2e/pages/HomeSetupPage.ts` — tile clicks, form fills, submit, error alert getter.
- `tests/e2e/pages/WelcomeModalPage.ts` — slide nav, skip, take-quiz, modal visibility helpers.

### Extension to existing page object

- `tests/e2e/pages/AuthPage.ts` — add `firstNameInput`, `lastNameInput`, `forgotPasswordLink`, `resetEmailInput`, `successAlert`.

### Seed data

No seed file changes needed for this PR. All Home Setup tests use route mocking. Auth tests use the existing per-worker `test{N}@rhozly.com` accounts.

## App-reference files consulted

- [`01-onboarding/01-auth-screen.md`](../app-reference/01-onboarding/01-auth-screen.md)
- [`01-onboarding/02-welcome-modal.md`](../app-reference/01-onboarding/02-welcome-modal.md)
- [`01-onboarding/03-home-setup.md`](../app-reference/01-onboarding/03-home-setup.md)

No app-reference updates needed — this is test-only code.

## Acceptance

- `npm run test:e2e -- auth.spec.ts home-setup-create.spec.ts home-setup-join.spec.ts welcome-modal.spec.ts` is green across all 4 workers.
- New tests added to the inventory in [`TESTING.md`](../../TESTING.md).
- Catalog status flipped from 🆕 to ✅ for the rows shipped.
- `docs/e2e-test-plan.md` updated with the new section.

## Out

Frontend-only — no migration, no edge function, no deploy. Just tests + minor testid additions.
