# Plan — Beta flag + In-app feedback system

## Goals

1. Tag beta users automatically when invited via the invite script.
2. Show context-aware feedback prompts to beta users after key actions — non-intrusive, session-rate-limited, saved to the database with full context.

---

## Part 1 — Beta flag

### How it works

`inviteUserByEmail` creates the `auth.users` row immediately (with `invited_at` set). The existing `handle_new_user` trigger fires synchronously and inserts a `user_profiles` row. So the profile exists by the time the API call returns.

**Changes:**

### 1A. Migration — add `is_beta` to `user_profiles`

```sql
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_beta boolean NOT NULL DEFAULT false;
```

No backfill needed — existing users are not beta testers.

### 1B. Invite script — set flag after invite

Change `scripts/invite-beta-users.mjs`:

```js
// Before:
const { error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
// After:
const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { redirectTo });
if (!error && data?.user) {
  await supabase.from("user_profiles").update({ is_beta: true }).eq("uid", data.user.id);
}
```

### 1C. TypeScript type

Add `is_beta: boolean` to `UserProfile` in `src/types.ts`.

---

## Part 2 — In-app feedback system

### Schema

**`beta_feedback` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | gen_random_uuid() |
| `user_id` | uuid | FK → auth.users, CASCADE DELETE |
| `action_context` | text | e.g. `'complete_task'`, `'doctor_diagnosis'` |
| `ratings` | jsonb | `{ "relevance": 4, "ease": 5 }` — keys vary per context |
| `description` | text nullable | free-text comment |
| `metadata` | jsonb | extra context e.g. `{ "task_type": "watering" }` |
| `created_at` | timestamptz | DEFAULT now() |

**RLS:**
- INSERT: `auth.uid() = user_id`
- SELECT: service_role only (admins view in Supabase dashboard)

### Context definitions

New file `src/constants/betaFeedbackContexts.ts` — maps an action context key to its display label and rating criteria:

```ts
export const BETA_FEEDBACK_CONTEXTS = {
  complete_task:        { label: "How was completing that task?",    criteria: ["Was this task relevant?", "Is the timing right?"] },
  add_plant:            { label: "How was adding that plant?",        criteria: ["How easy was it?", "Did you find what you needed?"] },
  doctor_diagnosis:     { label: "How was the plant diagnosis?",      criteria: ["How accurate was it?", "Was the advice useful?"] },
  blueprint_create:     { label: "How was creating that schedule?",   criteria: ["Was it easy to set up?", "Is the frequency right for you?"] },
  ailment_add:          { label: "How was logging that ailment?",     criteria: ["Was it easy to log?", "Were the suggestions useful?"] },
  optimise_apply:       { label: "How were those optimisations?",     criteria: ["Were the suggestions useful?", "Easy to understand?"] },
  guide_read:           { label: "How was that guide?",               criteria: ["Was it helpful?", "Was it relevant to you?"] },
  shopping_item_check:  { label: "How's the shopping list?",          criteria: ["Is it easy to manage?", "Useful for your gardening?"] },
  location_create:      { label: "How was adding that location?",     criteria: ["Was it easy to set up?", "Are the options clear?"] },
  area_create:          { label: "How was adding that area?",         criteria: ["Was it easy to set up?", "Are the options clear?"] },
  plant_assign_area:    { label: "How was assigning that plant?",     criteria: ["Was the process clear?", "Did you find the right area?"] },
} as const;

export type FeedbackContext = keyof typeof BETA_FEEDBACK_CONTEXTS;
```

### Rate limiting (client-side)

- `sessionStorage` key `rhozly_beta_feedback_shown` — JSON array of context keys shown this session
- Max 3 prompts per session total (avoid fatigue)
- Same context shown at most once per session
- 60-second cooldown after any prompt is dismissed or submitted before the next one appears

### Hook — `src/hooks/useBetaFeedback.ts`

Exposes:
- `requestFeedback(context: FeedbackContext, metadata?: Record<string, unknown>)` — enqueues a request; silently no-ops for non-beta users
- `pendingFeedback` — the current queued item (null if nothing to show)
- `submitFeedback(ratings, description)` — writes to `beta_feedback`, clears pending
- `dismissFeedback()` — clears pending without saving

Receives `isBeta: boolean` from App context so it can gate early.

### Component — `src/components/BetaFeedbackSheet.tsx`

A slide-up bottom sheet (not a full-screen modal). Design:
- Appears 1.5 seconds after the action (so it doesn't interrupt the success state)
- Header: "Beta Feedback" badge + context label (e.g. "How was completing that task?")
- Rating rows: one row per criterion, 5-star selector (tap stars)
- Free text textarea: placeholder "Anything else to add? (optional)"
- Two buttons: "Skip" (ghost) and "Submit" (primary green)
- Dismissable by swiping down or tapping outside

### Integration in App.tsx

Wrap the entire app in a `BetaFeedbackProvider` context. Render `<BetaFeedbackSheet />` at the root level (like how `<Toaster />` works) so it can appear from any page. Pass `profile.is_beta` into the provider.

### Action site integrations (MVP — 11 sites)

Each integration is a single `requestFeedback(context, metadata)` call after the success path:

| Site | File | Trigger point |
|------|------|--------------|
| Task completed | `src/components/TaskList.tsx` | After `complete` API call succeeds |
| Plant added to Shed | `src/components/TheShed.tsx` | After plant is saved/assigned |
| Plant assigned to area | `src/components/TheShed.tsx` | After area assignment saved (separate context from add_plant) |
| Plant Doctor diagnosis | `src/components/PlantDoctor.tsx` | After diagnosis result renders |
| Blueprint created | `src/components/BlueprintManager.tsx` | After new blueprint saved |
| Ailment added | `src/components/AilmentWatchlist.tsx` | After ailment saved to watchlist |
| Optimiser applied | `src/components/OptimiseTab.tsx` | After proposal changes confirmed |
| Guide finished | `src/components/GuideList.tsx` | After guide is read (scroll-to-end or explicit close) |
| Shopping item checked | `src/components/ShoppingLists.tsx` | After item marked complete |
| Location created | `src/components/LocationManager.tsx` | After new location saved |
| Area created | `src/components/LocationManager.tsx` | After new area saved within a location |

---

## Files summary

### New files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260517100000_beta_flag_and_feedback.sql` | `is_beta` column + `beta_feedback` table |
| `src/constants/betaFeedbackContexts.ts` | Context → label + criteria map |
| `src/hooks/useBetaFeedback.ts` | Queue, rate limiting, Supabase write |
| `src/components/BetaFeedbackSheet.tsx` | Slide-up feedback UI |
| `src/context/BetaFeedbackContext.tsx` | Provider wrapping the app |

### Modified files
| File | Change |
|------|--------|
| `scripts/invite-beta-users.mjs` | Set `is_beta = true` after successful invite |
| `src/types.ts` | Add `is_beta: boolean` to `UserProfile` |
| `src/App.tsx` | Wrap with `BetaFeedbackProvider`, render `<BetaFeedbackSheet />` |
| `src/components/TaskList.tsx` | Call `requestFeedback('complete_task', { task_type })` |
| `src/components/TheShed.tsx` | Call `requestFeedback('add_plant')` |
| `src/components/PlantDoctor.tsx` | Call `requestFeedback('doctor_diagnosis')` |
| `src/components/BlueprintManager.tsx` | Call `requestFeedback('blueprint_create')` |
| `src/components/AilmentWatchlist.tsx` | Call `requestFeedback('ailment_add')` |
| `src/components/OptimiseTab.tsx` | Call `requestFeedback('optimise_apply')` |
| `src/components/GuideList.tsx` | Call `requestFeedback('guide_read')` |
| `src/components/ShoppingLists.tsx` | Call `requestFeedback('shopping_item_check')` |
| `src/components/LocationManager.tsx` | Call `requestFeedback('location_create')` and `requestFeedback('area_create')` after respective saves |

---

## Migration needed

Apply locally first (`supabase migration up`), then push to remote on user confirmation.

---

## Process

1. Migration → type update → invite script (Part 1)
2. Context constants → hook → component → provider (Part 2 infrastructure)
3. App.tsx integration
4. Action site integrations (all 8)
5. `npx tsc --noEmit` clean → deploy
