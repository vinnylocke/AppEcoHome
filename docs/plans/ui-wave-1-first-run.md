# UI Wave 1 — First-Run Experience + Persona Detection

## Goal

Lift the First-Run / Auth / Welcome surface from **72/100 → 95+** by giving brand-new users an oriented introduction to Rhozly, capturing whether they're a new gardener or experienced, and seeding a Getting Started checklist on the dashboard.

Touches sections **1 (First-Run)**, **12 (Garden Profile / Quiz)** and partially **3 (Desktop Dashboard)** + **2 (Quick Access)** via the checklist surface.

---

## Sensible-default decisions (per user direction)

| Decision | Choice |
|---|---|
| Show welcome carousel to existing users? | **No** — backfill `welcomed_at = now()` for everyone in the migration. Welcome shows only for accounts created after this ships. |
| Where to render the carousel? | After `profile` loads in App.tsx, before any other modal (release notes / quiz nudge). Z-stack: welcome > everything. |
| Persona values? | `"new" \| "experienced" \| null` — null means we never asked (existing users). |
| Persona prompt timing? | Final slide of the welcome carousel. Optional skip. |
| Suppress release notes for newcomers? | Yes — if `welcomed_at IS NULL`, skip the release-notes modal entirely (they haven't seen v1 yet). |
| Checklist tracking? | Server-side via `user_profiles.onboarding_steps jsonb` so it persists across devices. |
| Checklist visibility? | Visible on the dashboard until all 5 steps complete. Collapsible. Dismissable per-step but not per-checklist. |
| Persona-aware copy in Wave 1? | Not yet — Wave 1 just *captures* the persona. Future waves act on it (e.g. tooltip frequency). |

---

## App-reference files consulted

- [`docs/app-reference/02-dashboard/`](docs/app-reference/02-dashboard/) — confirms dashboard composition (weather, tasks, assistant card, stats grid).
- [`docs/app-reference/99-cross-cutting/30-onboarding-state.md`](docs/app-reference/99-cross-cutting/30-onboarding-state.md) — existing onboarding state model.
- [`docs/app-reference/99-cross-cutting/19-rls-patterns.md`](docs/app-reference/99-cross-cutting/19-rls-patterns.md) — for the user_profiles update policy.

---

## Schema migration

New migration: `20260528000000_first_run_state.sql`

```sql
ALTER TABLE user_profiles
  ADD COLUMN welcomed_at       timestamptz,
  ADD COLUMN persona           text CHECK (persona IN ('new', 'experienced')),
  ADD COLUMN onboarding_steps  jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Backfill so existing users don't see the welcome carousel on next login.
UPDATE user_profiles SET welcomed_at = now() WHERE welcomed_at IS NULL;

COMMENT ON COLUMN user_profiles.welcomed_at IS
  'Timestamp the user first completed (or skipped) the welcome carousel. NULL = brand-new account that has not yet seen the welcome flow.';
COMMENT ON COLUMN user_profiles.persona IS
  'Self-declared gardening experience captured in the welcome flow. Used to bias copy (more tooltips for new, terser for experienced).';
COMMENT ON COLUMN user_profiles.onboarding_steps IS
  'Tracks per-user completion of the Getting Started checklist. Shape: { "quiz_completed": bool, "first_location": bool, "first_plant": bool, "first_assignment": bool, "first_schedule": bool, "dismissed_at": timestamptz | null }.';
```

RLS is fine — the existing `user_profiles` policies already allow each user to read+update their own row.

---

## New components

### `src/components/WelcomeModal.tsx`

4-slide carousel rendered via `createPortal`. Trapped focus. Dots + Back/Next at the bottom. Last slide has the persona prompt + final CTA.

| # | Title | Body | Visual |
|---|---|---|---|
| 1 | "Welcome to Rhozly 🌿" | "Your garden, organised. Track every plant, every task, every season — without the spreadsheet." | Hero illustration (small) |
| 2 | "How Rhozly thinks" | "Your garden is made of **Locations** (Back Garden, Allotment) → **Areas** (Veg Bed, Raised Planter) → **Plants** (the actual living things). Everything else builds on this." | Simple diagram |
| 3 | "Tasks that run themselves" | "Set a watering reminder once and Rhozly handles the rest. Weather-aware. Skips when it's rained. Doubles when it's hot." | Schedule chip mockup |
| 4 | "Quick question first" | "Are you new to gardening or experienced?" — two big tappable cards: "New to gardening" / "Experienced" + skip option. After choice, two CTAs: "Take the Garden Quiz (2 min)" (primary) + "Take me to the app" (text-link). | Persona cards |

On finish:
- Set `welcomed_at = now()` on profile.
- Set `persona` to the chosen value (or null if skipped).
- If they chose "Take the Garden Quiz" → navigate to `/profile`.
- Otherwise → close modal, surface the Getting Started checklist on the dashboard.

### `src/components/GettingStartedChecklist.tsx`

Slot on the dashboard. Persists progress on `user_profiles.onboarding_steps`.

5 steps with auto-detection (no manual ticking required):

| Step | Auto-detected by |
|---|---|
| Take the Garden Quiz | profile preference completed |
| Add your first Location | `select count(*) from locations where home_id = …` ≥ 1 |
| Add your first Plant | `select count(*) from plants where home_id = …` ≥ 1 |
| Assign a Plant to an Area | `select count(*) from inventory_items where home_id = …` ≥ 1 |
| Create a Task Schedule | `select count(*) from task_blueprints where home_id = …` ≥ 1 |

Layout:
- Title row: "Getting Started — X of 5 steps done" + small progress bar.
- Step list with checkmark icons (✓ when done, circle when not).
- Tapping a not-done step navigates to the relevant screen.
- "Dismiss for now" link in the corner — hides for the session via `dismissed_at` (re-appears after a day if still incomplete).
- Fully completed (5/5) → swap to a one-line congratulations chip that auto-fades after 7 days.

### Hooks

- `src/hooks/useFirstRunState.ts` — returns `{ needsWelcome, persona, onboardingSteps, markWelcomed, setPersona }` from the user profile. Centralises the conditional rendering of WelcomeModal.

---

## Modifications

### `src/App.tsx`
- Read `profile.welcomed_at` after profile load.
- If null → render `<WelcomeModal>` (suppress release-notes modal in this case).
- Otherwise → existing behaviour (release notes etc.).
- Mount `<GettingStartedChecklist>` on the dashboard (`/dashboard` route + the Quick Access `/quick` landing) when `profile.onboarding_steps` is incomplete AND `welcomed_at IS NOT NULL`.

### `src/components/GardenProfile.tsx` (Section 12 polish)
- Add subtitle under the "Garden Quiz" header: "Your answers personalise plant recommendations and watering schedules — about 2 minutes".
- Post-completion confirmation card replaces the form: "Your garden profile is set ✓ — we'll use this to suggest suitable plants and remind you at the right times" with a "Back to dashboard" CTA.
- Confirmation prompt before dismissing the quiz card on the dashboard: single confirm "Hide this for now? You can take the quiz from your profile menu later."
- Update the onboarding step `quiz_completed = true` on successful save.

### Release-notes guard
- Wherever the release-notes modal is rendered, gate on `profile.welcomed_at IS NOT NULL`. Brand-new users (welcomed_at NULL) skip it.

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/20260528000000_first_run_state.sql` | NEW — 3 columns + backfill. |
| `src/components/WelcomeModal.tsx` | NEW — 4-slide carousel with persona prompt. |
| `src/components/GettingStartedChecklist.tsx` | NEW — dashboard onboarding checklist. |
| `src/hooks/useFirstRunState.ts` | NEW — centralised first-run state hook. |
| `src/App.tsx` | Mount WelcomeModal conditionally, mount checklist on dashboard. |
| `src/components/GardenProfile.tsx` | Subtitle, post-completion card, dismiss confirm, mark `quiz_completed`. |
| `tests/unit/hooks/useFirstRunState.test.ts` | NEW — unit test for the state hook (computed flags + state transitions). |

---

## Risks & edge cases

- **Existing users on a multi-device login** — they get backfilled `welcomed_at` on the migration. New devices won't show the welcome. No data migration headache.
- **The onboarding step queries hit the DB on every dashboard render** — cache in the existing `useHomeDashboardStats` hook for 60s.
- **Quiz completion detection** — quiz already writes to `garden_profiles` table. We'll watch for a row with `home_id = current home` + at least one field populated.
- **Persona is stored but not yet acted on** — future-waves will read it. v1 just captures.
- **Welcome modal must NOT show if user closes mid-flow then reopens app** — once they've seen slide 1, set `welcomed_at` so they can't get stuck on it forever. Better UX than re-presenting.

---

## Steps

1. Migration + apply locally.
2. `useFirstRunState` hook + unit test.
3. WelcomeModal component.
4. GettingStartedChecklist component.
5. App.tsx integration — welcome render, checklist mount, release-notes guard.
6. GardenProfile polish.
7. Typecheck + unit tests.
8. Push migration to remote (with confirmation).
9. Deploy via `npm run deploy --bump 1`.

---

## Definition of done

- Brand-new account login → welcome carousel appears → completes → lands on dashboard with checklist visible.
- Existing account login → no welcome carousel, no checklist (unless they're on `onboarding_steps = '{}'` and recent).
- Quiz completion → `quiz_completed` flag flips, checklist step ticks.
- Persona value persists on user_profiles for later waves to use.
- All 624+ existing unit tests still pass; new hook test passes; typecheck clean.
