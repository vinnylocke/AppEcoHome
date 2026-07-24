# Garden Profile (Habit Quiz & Preferences)

> The user's gardening profile editor — re-take the Garden Quiz, swipe through plants to capture more preferences, and review the full list of `planner_preferences` (the personalisation signals fed to AI throughout the app).

**Route:** `/profile`
**Source files:**
- `src/components/GardenProfile.tsx` — parent container
- `src/components/HabitQuiz.tsx` — quiz (also documented at [01-onboarding/05](../01-onboarding/05-garden-quiz.md))
- `src/components/PlantSwipeDeck.tsx` — swipe-to-prefer mini-game

> **Filing note:** this file lives under `05-tools/` for historical reasons, but Garden Profile has **no tile in the Tools Hub** (`/tools`) — it isn't one of the `GROUPS` in `src/components/ToolsHub.tsx`. It's **account-scoped**, reached only from the [User Profile Dropdown](../06-account/09-user-profile-dropdown.md)'s "Garden Preferences" item (Account section) and from onboarding (the Garden Quiz step). If you're hunting for it in the Tools Hub, it isn't there by design — this doc's location doesn't imply a Tools tile. A cleaner home would be `06-account/`, but the file wasn't moved to keep this sync minimal; flagged in [00-INDEX.md](../00-INDEX.md).

---

## Quick Summary

A tab between "Quiz" and "Swipe":

- **Quiz** — run / re-run the Habit Quiz. Saved answers feed personalisation.
- **Swipe** — a Tinder-style deck of plants. Right swipe = "I like this plant"; left = "Not for me". Each swipe writes a `planner_preferences` row.
- **Detail level** (`PersonaSetting`) — a two-option card ("More guidance" / "Less clutter") writing `user_profiles.persona` (`"new"` | `"experienced"`). **Presentation only** — it biases inline-tip / tooltip density (`InfoTooltip` dims for experienced), AI copy tone, `isNewGardener` framing, and the default home posture (porch vs workbench). It does **not** gate, filter, or unlock any feature. (Renamed 2026-07 from "Gardening experience" — the old name implied it did more than it does; the underlying `persona` values are unchanged.)

Below the tabs, a collapsible "Your Preferences" list shows every captured preference (from quiz, swipe, AI chat) with source chip, sentiment, timestamp, and a per-row delete button. A "Reset all preferences" action wipes everything (with confirm).

---

## Role 1 — Technical Reference

### Component graph

```
GardenProfile
├── Tab bar (Quiz / Swipe)
├── Quiz tab → HabitQuiz
├── Swipe tab → PlantSwipeDeck
├── Preferences section (collapsible)
│   ├── List of Pref rows
│   │   ├── Entity (plant name)
│   │   ├── Source chip (chat / quiz / swipe)
│   │   ├── Sentiment (positive / negative)
│   │   ├── Timestamp
│   │   └── Delete button
│   └── Reset all button (with confirm)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |
| `userId` | `string` | App.tsx | Per-user prefs |
| `aiEnabled` | `boolean` | App.tsx | Some swipe AI features |
| `perenualEnabled` | `boolean` | App.tsx | Plant lookup in swipe deck |

### Local state

| State | Purpose |
|-------|---------|
| `tab` | "quiz" / "swipe" |
| `quizDone`, `quizError`, `quizRetryTick` | Quiz completion status |
| `prefs`, `prefsLoading`, `prefsError`, `prefsRetryTick` | Preferences fetch state |
| `showPrefs` | Collapsible toggle |
| `resetting`, `confirmingReset` | Reset flow |
| `deletingPrefId` | Per-row delete in flight |
| `retakingQuiz` | Re-run quiz UI state |

### `Pref` shape

```ts
{
  id, entity_type, entity_name,
  sentiment: "positive" | "negative",
  source: "chat" | "quiz" | "swipe" | ...,
  recorded_at,
}
```

### Source labels & colours

| Source | Label | Colour |
|--------|-------|--------|
| `chat` | Chat | rhozly-primary |
| `quiz` | Quiz | rhozly-tertiary |
| `swipe` | Swipe | outline |

### Data flow — read paths

```ts
// Quiz completion
supabase.from("home_quiz_completions")
  .select("id").eq("home_id", homeId).eq("user_id", userId).maybeSingle();

// All preferences
supabase.from("planner_preferences")
  .select("id, entity_type, entity_name, sentiment, source, recorded_at")
  .eq("home_id", homeId).eq("user_id", userId)
  .order("recorded_at", { ascending: false });
```

### Data flow — write paths

#### Delete pref
```ts
supabase.from("planner_preferences").delete().eq("id", id);
```

#### Reset all
- Deletes all `planner_preferences` for `(home_id, user_id)`.
- Deletes the `home_quiz_completions` row.

#### Re-take quiz
- Sets local `quizDone = false`, re-mounts `HabitQuiz`. On finish, inserts a new `home_quiz_completions` row.

### Edge functions invoked

None directly. Swipe deck may call `gemini-plant-suggest` for recommendations.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `refresh-behaviour-summary` | Weekly cron merges preferences with behaviour into `user_behaviour_summary` for AI context |

### Realtime channels

None.

### Tier gating

- Quiz: every tier.
- Swipe: every tier (uses plant database — Botanist+ for richer data).
- Preferences feeding AI prompts: Sage / Evergreen.

### Beta gating

None.

### Permissions

- Per-user — no shared access.

### Error states

| State | Result |
|-------|--------|
| Quiz fetch fails | Banner + retry |
| Prefs fetch fails | Banner + retry |
| Delete fails | Toast; row stays |
| Reset fails partially | Toast; partial-clean state |

### Performance

- Single fetch per section.
- Swipe deck preloads next 5 cards.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

Rhozly's AI personalisation lives or dies by the signals you give it. The quiz is the headline survey; the swipe deck is the ongoing fine-tuning. The Preferences list is the audit trail — see exactly what the app knows, and remove anything that doesn't fit.

### Every flow on this screen

#### 1. Quiz tab

- If you haven't done it: take it. ~2 min, ~6 questions.
- If you have: "Re-take quiz" button to update your answers.
- See [Garden Quiz](../01-onboarding/05-garden-quiz.md) for the full quiz reference.

#### 2. Swipe tab

- Tinder-style deck of plants.
- Right swipe = "yes please"; left = "not for me".
- Each swipe writes a preference; over time the app gets sharper at suggesting plants.

#### 3. Preferences section

- Expand → see every captured preference.
- Filter by source mentally (chat / quiz / swipe chips).
- Delete any preference if it doesn't reflect reality.

#### 4. Reset all

- Wipes everything — quiz + preferences.
- Useful if you've moved house / drastically changed your gardening style.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Quiz status | Completed / Not yet |
| Pref row | A captured signal |
| Source chip | Where it came from |
| Sentiment | Positive (you liked it) / Negative (didn't) |
| Recorded at | When the signal was captured |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Every tier | Capture preferences. |
| Sage / Evergreen | Preferences actively shape AI prompts (Plant Doctor, Chat, plan generation, optimise). |

### New user vs returning user

- **New user:** quiz first (highest signal-to-effort ratio).
- **Returning user:** swipe deck on demand — periodically swipe 20 cards to keep prefs fresh.

### Common mistakes / pitfalls

- **Treating prefs as binding.** They're hints, not rules. The AI may still suggest something you "disliked" if it strongly fits other criteria.
- **Reset all by accident.** The confirm exists for a reason. Read it.
- **Skipping swipe because "I don't know these plants".** That's the point — left-swipe what you don't know; right-swipe what you do. Either signal helps.

### Recommended workflows

- **First visit:** quiz → swipe 20 cards → done.
- **Quarterly:** revisit, swipe another 20.
- **After moving / big garden change:** Reset all → quiz → swipe.

### What to do if something looks wrong

- **Recommendations still generic:** check `planner_preferences` count — under 10 entries means signal is too thin. Swipe more.
- **Deleted pref came back:** another source (e.g. chat) re-captured the same signal. Delete from that source too.

---

## Related reference files

- [Garden Quiz (Habit Quiz)](../01-onboarding/05-garden-quiz.md)
- [AI Assistant Card](../02-dashboard/06-assistant-card.md)
- [Plant Doctor](./02-plant-doctor.md)
- [Pattern Engine (cross-cutting)](../99-cross-cutting/26-pattern-engine.md)

## Code references for ongoing maintenance

- `src/components/GardenProfile.tsx` — parent
- `src/components/HabitQuiz.tsx` — quiz
- `src/components/PlantSwipeDeck.tsx` — swipe deck
- `src/hooks/useUserPreferences.ts` — read prefs across the app
- `supabase/functions/refresh-behaviour-summary/index.ts` — weekly summary cron
- `supabase/migrations/*_planner_preferences.sql` — schema
