# 12. Profile (Garden Profile + Gardener's Profile)

**Spec files:** `tests/e2e/specs/garden-profile.spec.ts` · `tests/e2e/specs/gardener-profile.spec.ts`
**Page Object:** `tests/e2e/pages/GardenProfilePage.ts`
**Seed dependencies:** `00_bootstrap.sql`, `08_profile_preferences.sql`
**App-reference:** [06-account/](../app-reference/06-account/)

## Garden Profile (`/profile`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| PROF-001 | ✅ | `/profile` heading | — | ✅ Passing |
| PROF-002 | ✅ | Nav link → `/profile` | — | ✅ Passing |
| PROF-003 | ✅ | Quiz shows — no completion → progress bar + Q1 visible | — | ✅ Passing |
| PROF-004 | ✅ | Quiz option click enables Next | — | ✅ Passing |
| PROF-005 | ✅ | Quiz Next advances to Q2 | — | ✅ Passing |
| PROF-006 | ✅ | Quiz Back returns to Q1 | — | ✅ Passing |
| PROF-007 | ✅ | Progress bar increments | — | ✅ Passing |
| PROF-008 | ✅ | Quiz completion — completion heading | — | ✅ Passing |
| PROF-009 | ✅ | Reset quiz button visible | — | ✅ Passing |
| PROF-010 | ✅ | Reset quiz → Q1 progress visible again | — | ✅ Passing |
| PROF-011 | ✅ | Swipe tab visible | — | ✅ Passing |
| PROF-012 | ✅ | Swipe tab click → deck or loading | Perenual mock | ✅ Passing |
| PROF-013 | ✅ | Preferences section | — | ✅ Passing |
| PROF-014 | ✅ | Preferences empty — "No preferences yet" | — | ✅ Passing |
| PROF-015 | ✅ | Delete preference | — | ✅ Passing |

## Gardener's Profile (`/gardener`)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| GP-001 | ✅ | Nav item visible in user avatar dropdown | — | 🔲 Pending |
| GP-002 | ✅ | Click "Gardener's Profile" → URL `/gardener` | — | 🔲 Pending |
| GP-003 | ✅ | Account tab renders — display name input visible | — | 🔲 Pending |
| GP-004 | ✅ | Display name save → toast + nav name updates | — | 🔲 Pending |
| GP-005 | ✅ | Email change → "Check your inbox" hint | — | 🔲 Pending |
| GP-006 | ✅ | Password mismatch validation | — | 🔲 Pending |
| GP-007 | ✅ | Achievements tab renders grid | — | 🔲 Pending |
| GP-008 | ✅ | "Early Adopter" always unlocked | — | 🔲 Pending |
| GP-009 | ✅ | Locked achievement shows "Keep going to unlock" | — | 🔲 Pending |
| GP-010 | ✅ | Stats tab renders metric cards | — | 🔲 Pending |
| GP-011 | ✅ | Voice "Read AI replies aloud" toggle persists across reload (Alerts tab) | — | 🔲 Written (run pending local stack) |
| GP-012 | ✅ | Plan section (admin) — per-tier prices + "Manage billing" visible; selecting a paid tier starts Stripe Checkout (sandbox). Price↔tier mapping unit-covered by `stripeTiers.test.ts`. | Stripe sandbox | 🔲 Pending (live sandbox) |
| GP-020 | ✅ | `/gardener?section=plans` forces the Account tab, reveals the plan cards (`plan-card-*`), and strips the `section` param (RHO-12) | — | ✅ Passing |
| GP-021 | ✅ | A tier-locked `UpgradeNudge` (Head Gardener on `/manager` for a Sprout user) navigates to `/gardener?section=plans` and the plan cards become visible | `user_profiles` tier→sprout | ✅ Passing |

**RHO-12 (GP-020/021):** tier-locked `UpgradeNudge` banners deep-link to the plan picker via `/gardener?section=plans`. `GardenerProfile` forces the Account tab, scrolls `#plan-section` ("Your Plan") into view, then strips the param — mirroring the existing `?section=quick-launcher` pattern.

**Note:** the Voice toggle (`?tab=notifications`) writes `user_profiles.voice_settings` keyed on `uid`. GP-011 guards the regression where it filtered on a non-existent `id` column and silently never saved.

**Stripe billing (GP-012):** the "Your Plan" Stripe Checkout / Billing Portal UI is gated to `isAdmin` during the sandbox phase, so non-admin E2E accounts still see the honour-system tier switch. End-to-end checkout can't be Playwright-tested without the live Stripe sandbox + a test card, so GP-012 is unit-covered (`supabase/tests/stripeTiers.test.ts`) for now; the `stripe-webhook` price→tier mapping is the load-bearing logic.
