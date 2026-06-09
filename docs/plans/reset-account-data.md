# Plan — "Reset Account" button (admin-only testing tool)

## User ask

> "Is it possible to have a button next to delete account called reset account or something? I mainly want it for testing but I'd like to click this button to delete all data related to the user, so the home, the instances, the notes, etc. Keep the user just delete it's data this way I can easily get back to a fresh state when testing."

A button that wipes garden data, onboarding state, and preferences for the current user — but preserves the auth user and the user_profiles identity fields (email, display name, subscription tier). Same login, fresh-account experience.

## Scope

**Wiped:**
- Every home the user is a member of — via the existing `leave_home(home_id)` helper. If user is sole/last member, the home is deleted and cascade-clears every home-scoped table (locations, areas, plants, inventory_items, tasks, blueprints, plans, notes, weather_snapshots, ailments, weekly_overviews, home_seasonal_picks, etc.).
- `planner_preferences` (the swipe-deck answers and learned preferences).
- `notifications` (history of pushes).
- `user_insights` + `user_behaviour_summary` (pattern engine outputs).
- `user_profiles` fields: `onboarding_state`, `onboarding_steps`, `welcomed_at`, `quick_launcher_pins`, `voice_settings`, `persona`, `home_id` — reset to defaults so the welcome modal and walkthroughs fire again.

**Preserved (so the user can keep using their account):**
- `auth.users` row.
- `user_profiles` row — kept, but specific fields reset above. Identity (uid, email, display_name, first_name, last_name, subscription_tier, avatar_url, is_admin, can_view_audit, is_beta, fcm_token, ai_enabled, enable_perenual) all intact.
- `user_devices` — so push notifications keep working after reset.
- Community guides — anonymised the same way `delete_own_account` does (`author_id = NULL`).

## Gating

**Admin-only.** Two layers:
1. UI button only visible when `profile.is_admin = true`.
2. RPC raises if caller is not admin (caller_id → user_profiles.is_admin check).

## Implementation

### 1. Migration — `public.reset_own_account_data()`

`SECURITY DEFINER` plpgsql function. Mirrors `delete_own_account`'s structure but:
- Adds an admin check at the top.
- Doesn't anonymise guides yet — actually does, for symmetry (a reset-then-resume should look identical to "leave home as someone else").
- Returns a small jsonb summary of counts so the UI can show feedback.

### 2. UI — Reset button in Danger Zone

In `src/components/GardenerProfile.tsx`:
- Show a yellow/amber "Reset Account Data" button next to (or above) the red Delete Account button, **only when `isAdmin` is true**.
- Confirmation modal mirrors Delete Account: type `RESET` to confirm.
- Calls `supabase.rpc("reset_own_account_data")` directly (no edge function needed — RPC handles auth via auth.uid()).
- On success: toast → navigate to `/` so Home Setup picks up the empty profile.

## Files

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_reset_account_data.sql` | New `reset_own_account_data()` RPC + GRANT |
| `src/components/GardenerProfile.tsx` | New button + modal + handler, gated on `isAdmin` |
| `src/types.ts` (or wherever UserProfile is typed) | No change — `is_admin` already exists |

## Tests

No E2E touch — it's an admin-only destructive tool that we don't want a test to fire by accident. Manual smoke test post-deploy:
- Confirm button hidden for non-admin users.
- As admin: tap → type RESET → confirm → home + plants gone, welcome modal fires on next load.

## Deploy

Frontend + one migration. Minor bump → 22.0017.

## Risks

- A misclick by an admin wipes their own garden. Mitigated by the type-RESET-to-confirm modal and the explicit "Danger Zone" location.
- If new user-scoped tables get added later, they won't be cleared by this RPC. Acceptable — it's a testing tool, will be updated alongside any new feature that introduces such a table.
