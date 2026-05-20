# Garden Quiz (Habit Quiz)

> A short multi-step quiz that captures the user's gardening preferences (time available, watering style, edible-vs-ornamental focus, etc.). Drives plant recommendations, watering defaults, and AI personalisation across the app.

**Route:** Rendered inside `/profile` (GardenProfile component).
**Source files:**
- `src/components/HabitQuiz.tsx` — the quiz UI
- `src/components/GardenProfile.tsx` — parent container

---

## Quick Summary

A multi-question survey shown to first-run users as part of GardenProfile. Each answer is saved to `user_profiles.preferences` (jsonb) and `user_profiles.quiz_completed = true`. A completion screen shows the answers as editable rows so the user can refine them later. After completing, optionally followed by a Plant Swipe Deck for further refinement.

---

## Role 1 — Technical Reference

### Component graph

```
GardenProfile (parent)
└── HabitQuiz
    ├── Progress bar (steps done / total)
    ├── Question step view
    │   ├── Question text
    │   ├── Answer chips (single-select or multi-select per question)
    │   └── Next / Back buttons
    └── Completion screen
        ├── "Your garden profile is set ✓" headline
        ├── Editable summary rows (each answer)
        └── Save + Done button
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | GardenProfile | For scoping any home-level prefs |
| `userId` | `string` | GardenProfile | For the profile write |
| `onComplete` | `() => void` | GardenProfile | Lift state, hide quiz |

### Local state

| State | Purpose |
|-------|---------|
| `stepIdx` | Current question (0-indexed) |
| `answers` | Map of questionId → answer value(s) |
| `saving` | Submit in flight |

### Questions (typical set)

The exact question list lives in HabitQuiz.tsx as a constant. Representative:

| Question | Answer type | Stored as |
|----------|-------------|-----------|
| How much time do you have for gardening each week? | single-select | `time_budget` |
| What are you growing for? | multi-select | `goals[]` (edible / ornamental / wildlife) |
| How experienced are you? | single-select | `experience` |
| What's your watering style? | single-select | `watering_style` |
| Indoor or outdoor focus? | single-select | `environment_focus` |
| Pets in the home? | boolean | `has_pets` |

### Data flow — write paths

#### `saveQuiz()`

```ts
supabase.from("user_profiles")
  .update({
    quiz_completed: true,
    preferences: answers,
  })
  .eq("uid", userId);
```

Optionally writes individual `planner_preferences` rows for the broader recommendation engine (see `usePreferences` hook).

### Edge functions invoked

None directly. Downstream AI calls (Plant Doctor, AssistantCard) read `user_profiles.preferences` to personalise prompts.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `refresh-behaviour-summary` | Weekly — merges preferences with behaviour data into `user_behaviour_summary` for Gemini context |

### Realtime channels

None.

### Tier gating

None — every user can take the quiz regardless of tier. The personalisation it enables IS more impactful for AI-tier users, but the data is captured for all.

### Beta gating

None.

### Permissions / role-based UI

None — quiz is personal.

### Error states

| State | Result |
|-------|--------|
| Save fails | Toast error; user can retry |
| User skips required answer | Next button disabled |

### Performance notes

- Pure render. No fetches during the quiz.
- One DB write at the end.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why take the Quiz

The quiz is the cheat code that makes Rhozly's recommendations actually relevant to you. Without it, plant recommendations are generic (based on hardiness zone + sun) — useful but bland. With it, the app knows you have 2 hours a week, you're growing for edibles, you have a cat, and you prefer hand-watering. That changes every default downstream: which plants get suggested, which watering frequencies are proposed, whether toxic-to-pets plants get flagged in the Shed, whether the AI Plant Doctor frames advice for beginners or experts.

For beginners: take this. It's two minutes and the whole app gets smarter. For experts: take it once and refine the answers on the completion screen — it's the lever to set tone.

### Every flow on this screen

#### 1. Progress through questions

- Tap an answer chip → tap Next. Back button works at any step.
- Required questions disable Next until answered.

#### 2. Completion screen — Editable answers

- After the last question, the answers display as editable rows. Tap any to adjust.
- Useful for re-running the quiz periodically as your gardening style evolves.

#### 3. Save & Done

- Writes everything to `user_profiles`. Hides the quiz.

### Information on display — what every field means

Per question. Examples:

| Field | Meaning |
|-------|---------|
| Time budget | Determines if the app suggests low-maintenance vs high-touch plants |
| Goals | Filters plant recommendations to edible / ornamental / wildlife |
| Experience | Drives the framing of AI advice (technical depth) |
| Watering style | Affects watering frequency defaults |
| Has pets | Triggers toxic-plant warnings in the Shed |

### Tier-by-tier experience

Same quiz for every tier. The personalisation benefits scale with tier — AI tiers see the biggest difference.

### New user vs returning user

- **Brand new user**: prompted from the Welcome Modal slide 4 and from the dashboard prompt card until completed.
- **Returning user**: can edit the answers from `/profile` at any time.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Skipping it because "I'll do it later."** The cost is that for the first weeks, recommendations are generic. Most users who skip don't come back to it.
- **Over-thinking the answers.** They're hints, not contracts. You can always tweak later.
- **Treating boolean fields as binding.** "Has pets" doesn't block toxic plants — it just flags them.

### Recommended workflows

- **First visit:** take it immediately. Re-take annually as your garden evolves.
- **Re-tuning:** when you move house or expand your garden, revisit and update.

### What to do if something looks wrong

- **Recommendations still feel generic after the quiz:** check `user_profiles.preferences` is set in Supabase. If it's empty, the save failed — re-take.
- **Quiz prompt keeps appearing after completion:** `quiz_completed` flag isn't true. Re-take and ensure the Save & Done button is tapped.

---

## Related reference files

- [Welcome Modal](./02-welcome-modal.md)
- [Garden Profile](../05-tools/10-garden-profile.md)
- [Dashboard Tab](../02-dashboard/01-dashboard-tab.md) — quiz prompt card
- [AI Assistant Card](../02-dashboard/06-assistant-card.md)
- [Pattern Engine (cross-cutting)](../99-cross-cutting/26-pattern-engine.md)

## Code references for ongoing maintenance

- `src/components/HabitQuiz.tsx` — quiz component
- `src/components/GardenProfile.tsx` — parent
- `src/hooks/useUserPreferences.ts` — reads preferences across the app
- `supabase/functions/refresh-behaviour-summary/index.ts` — weekly cron that uses preferences
