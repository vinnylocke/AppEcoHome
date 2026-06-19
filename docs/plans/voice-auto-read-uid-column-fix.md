# Fix: "Read AI replies aloud" setting never persists (wrong identifier column)

## Problem

In Account → Profile there is a Voice setting, **"Read AI replies aloud"**. When the user
turns it on and navigates away, returning to the settings always shows it **off**. The feature
never works — the AI never auto-speaks replies in chat either.

## Root cause

`public.user_profiles` is keyed by the column **`uid`** (it is the primary key, and the RLS
policies are `auth.uid() = uid`). There is **no `id` column and no `user_id` column** on this
table. Verified against:

- `supabase/migrations/20260401072454_remote_schema.sql` (table def L562, PK `uid` L673, RLS
  `Users can update own profile` / `Users can view own profile` both on `uid`).
- No later migration adds `id`/`user_id` or renames `uid`.
- RLS test `RLS-016` (`supabase/tests/rls_isolation.test.ts`) filters `user_profiles` on `.eq("uid", …)`.
- 5 working call sites in `GardenerProfile.tsx` itself use `.eq("uid", …)` (notification prefs,
  tier switch, avatar).

The Voice feature reads/writes `user_profiles` filtering on a **non-existent `id` column**.
PostgREST returns a `42703 column does not exist` error for these requests:

- **Read** → error returned, `data` is `null`, so `auto_read_assistant_replies` resolves to
  `false`. The toggle therefore always loads **off**.
- **Write** → error returned in `{ error }`. The code wraps the call in `try/catch` but never
  inspects `{ error }`, and `supabase-js` does **not** throw on DB errors — so the existing
  "revert on failure" branch is dead code and the write **silently fails**. The toggle looks
  like it flipped on for that session, but nothing is persisted.

The feature is broken at **three** call sites (one write + two reads), so even fixing
persistence alone would not make auto-read fire in chat:

| # | File / line | Call | Current (wrong) | Effect |
|---|-------------|------|-----------------|--------|
| 1 | `src/components/GardenerProfile.tsx:360` | VoiceSection load | `.eq("id", uid)` | Toggle always shows OFF |
| 2 | `src/components/GardenerProfile.tsx:380` | VoiceSection save | `.eq("id", userId)` | Never persists (error swallowed) |
| 3 | `src/components/PlantDoctorChat.tsx:380` | Chat auto-read load | `.eq("id", userId)` | Auto-read never fires even if persisted |

### Same-class bug found nearby (recommended to fix in the same task)

| # | File / line | Call | Current (wrong) | Effect |
|---|-------------|------|-----------------|--------|
| 4 | `src/components/GardenerProfile.tsx:668` | `saveName()` display-name save | `.eq("user_id", userId)` | Renaming should fail with a "Failed to update name" toast and never persist |

(Line 538 `.eq("user_id", userId)` is on `beta_feedback`, where `user_id` **is** the correct
column — not a bug. Left untouched.)

## App-reference files consulted

- `docs/app-reference/06-account/01-account-tab.md` — documents the Account tab write paths.
  **Drift found:** L72 documents the display-name write as `.eq("user_id", userId)`, which is
  wrong for the same reason (should be `uid`). The doc is wrong, the table is right.
- `docs/app-reference/06-account/02-notifications-tab.md` — does **not** cover the Voice toggle.
- `docs/app-reference/05-tools/03-plant-doctor-chat.md` — does **not** document the auto-read
  read path / `voice_settings`.

**Pre-existing gap:** the Voice toggle (GardenerProfile `VoiceSection`) and the chat auto-read
effect have no dedicated app-reference coverage. This bug fix does not change their behaviour
contract — it makes the already-documented-intended behaviour actually work — so authoring two
new dual-voice reference files is out of scope for the fix itself. Flagged for a follow-up
(see "Open question" below).

## Files that will change

| File | Change |
|------|--------|
| `src/components/GardenerProfile.tsx` | L360, L380 `.eq("id", …)` → `.eq("uid", …)`. In `update()`, inspect `{ error }` from the call and revert the optimistic toggle when `error` is set (makes the existing dead revert-branch live). L668 `saveName()` `.eq("user_id", …)` → `.eq("uid", …)` (item #4). |
| `src/components/PlantDoctorChat.tsx` | L380 `.eq("id", userId)` → `.eq("uid", userId)`. |
| `docs/app-reference/06-account/01-account-tab.md` | L72 display-name write path `.eq("user_id", userId)` → `.eq("uid", userId)` (fix documented drift). |
| `tests/e2e/specs/garden-profile.spec.ts` | Add a persistence regression test for the Voice toggle. |
| `tests/e2e/pages/GardenProfilePage.ts` | Add Voice-toggle locators/helpers if not already present (`voice-section`, `voice-auto-read-toggle`). |
| `docs/e2e-test-plan/12-profile.md` | Add the new test row(s); set status. |

No migration is needed — the `voice_settings` column already exists; only the client query
filter was wrong.

## Exact approach

1. **GardenerProfile.tsx `VoiceSection`** — change both `.eq("id", …)` to `.eq("uid", …)`
   (load L360, save L380). In `update()`, capture `{ error }` from the `await supabase…update()`
   and, if `error` is truthy, revert `setAutoRead(!next)` and surface a failure (toast), so a
   future silent failure can't recur unnoticed.
2. **GardenerProfile.tsx `saveName()`** — change `.eq("user_id", userId)` → `.eq("uid", userId)`
   (L668).
3. **PlantDoctorChat.tsx** — change `.eq("id", userId)` → `.eq("uid", userId)` (L380) so the
   auto-read effect reads the real value.
4. **account-tab.md** — correct the documented display-name write column to `uid`.
5. **E2E test** — in `garden-profile.spec.ts`: navigate to Profile, open the Voice section,
   check `voice-auto-read-toggle`, reload the page (and/or navigate away and back), assert the
   toggle is still checked. Add matching locators to `GardenProfilePage.ts`. Update
   `docs/e2e-test-plan/12-profile.md`.

## Risks / edge cases

- **`preferred_voice` loss:** the save writes `{ auto_read_assistant_replies: next }`, replacing
  the whole `voice_settings` jsonb. The voice picker isn't shipped yet (no `preferred_voice` is
  ever written today), so this is not a live regression — but I'll note it inline so the future
  voice-picker work merges rather than overwrites. No change to that behaviour in this task
  (no speculative change).
- **RLS:** `uid` is exactly what the update/select RLS policies key on, so the corrected filter
  satisfies `auth.uid() = uid` and affects the user's own row only.
- **Optimistic revert:** adding the `{ error }` check changes `update()` to revert on real
  failures; with the column fixed there should be no failures in the happy path, so the toggle
  behaves as before for the user.

## App-reference files to update

- `docs/app-reference/06-account/01-account-tab.md` — fix L72 column drift (`user_id` → `uid`).

## Open question for you

- **Scope of item #4 (display-name save):** it's the same proven bug on the same table and the
  user would expect renaming to work — recommend fixing it now alongside the Voice fix. Say if
  you'd rather I keep this change strictly to the Voice toggle.
- **App-reference coverage:** want me to author dedicated reference files for the Voice toggle +
  chat auto-read in this task, or track that as a separate follow-up (it's a pre-existing gap,
  not introduced by this change)?

## Implementation notes (resolved)

User approved full scope ("fix it all now"). What actually shipped:

- **Code:** all four call sites fixed (`GardenerProfile.tsx` L360/L380/L668, `PlantDoctorChat.tsx`
  L380) → `.eq("uid", …)`. The Voice `update()` now inspects the returned `{ error }` and reverts
  the optimistic toggle with a toast (the old `try/catch` revert branch was dead code because
  `supabase-js` resolves rather than throws).
- **Route correction:** the Voice toggle lives in `GardenerProfile` at **`/gardener?tab=notifications`**
  (the "Alerts" tab), not `/profile` (`GardenProfile` = quiz/preferences). The plan's test-file
  row was adjusted accordingly.
- **Tests:** new spec `tests/e2e/specs/gardener-profile.spec.ts` (GP-011) deep-links to
  `/gardener?tab=notifications`, normalises OFF, toggles ON (awaiting the `voice_settings` PATCH),
  reloads, and asserts it's still checked; restores OFF for idempotency. Voice locators +
  `gotoNotifications()` added to `GardenProfilePage.ts`. `docs/e2e-test-plan/12-profile.md`
  updated (GP section header + GP-011 row). **Typechecked clean (`tsc --noEmit`); E2E not yet
  executed** (needs the local Supabase stack + seeds).
- **App-reference (doc-home decision):** the Voice toggle is a *section on the Alerts tab*, not a
  standalone surface, so it's documented in `06-account/02-notifications-tab.md` (Quick Summary,
  component graph, data-flow `uid` note, Role 2 flow, related/code refs) rather than a new file.
  The chat-side read path + read-aloud are documented in `05-tools/03-plant-doctor-chat.md`.
  `06-account/01-account-tab.md` display-name drift fixed (`user_id` → `uid`).
