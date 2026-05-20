# Getting Started Checklist

> A dashboard card showing first-run users a 5-step checklist that takes them from empty account to a functioning garden tracker. Auto-ticks steps as they're completed elsewhere in the app.

**Rendered on:** `/dashboard?view=dashboard`, top of the body.
**Source file:** `src/components/GettingStartedChecklist.tsx`

---

## Quick Summary

Reads `user_profiles.onboarding_state` jsonb plus a few derived facts (does the user have locations? do they have plants? have they taken the quiz?) to produce a 5-row checklist. Each row links to its respective action. The card hides itself completely once all 5 are done OR the user dismisses it.

---

## Role 1 — Technical Reference

### Component graph

```
GettingStartedChecklist
├── Header
│   ├── "Getting Started" title
│   ├── Progress bar (X of 5 done)
│   └── Dismiss X (requires confirm)
└── Step rows (5)
    ├── Step 1: Take the Garden Quiz → /profile
    ├── Step 2: Add your first Location → /management
    ├── Step 3: Add a plant to The Shed → /shed
    ├── Step 4: Assign that plant to an area → /shed
    └── Step 5: Set a Watering Reminder → /schedule
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope checks |
| `userId` | `string` | App.tsx | For onboarding_state writes |
| `quizCompleted` | `boolean` | App.tsx | Pre-computed for step 1 |
| `hasLocations` | `boolean` | App.tsx (locations.length > 0) | Pre-computed for step 2 |
| `onboardingState` | `OnboardingState` | App.tsx | Read additional flags |
| `onStateChange` | `(state) => void` | App.tsx | Lift state up |

### Step detection logic

| Step | Condition |
|------|-----------|
| 1. Take the Garden Quiz | `quizCompleted === true` |
| 2. Add your first Location | `hasLocations === true` |
| 3. Add a plant | Server query: `inventory_items` row exists for this home |
| 4. Assign plant to area | Server query: `inventory_items` row with non-null `area_id` |
| 5. Set a Watering Reminder | Server query: `task_blueprints` row with `task_type = 'Watering'` |

Steps 3-5 fetched once on mount via a single `Promise.all([...])`.

### Data flow — write paths

#### Dismiss

```ts
supabase.from("user_profiles")
  .update({ onboarding_state: { ...prev, checklist_dismissed: true } })
  .eq("uid", userId);
```

Marks dismissal. Card never reappears unless `onboarding_state.checklist_dismissed` is unset manually.

### Edge functions invoked

None.

### Cron / scheduled jobs that affect this surface

None — the checklist is driven by real-time data.

### Realtime channels

Listens to App.tsx's home realtime subscription — when a new location or plant is added, the checklist refreshes via parent re-render.

### Tier gating

None — checklist is universal.

### Beta gating

None.

### Permissions / role-based UI

None — onboarding is user-personal.

### Error states

| State | Result |
|-------|--------|
| Server query for steps 3-5 fails | Steps default to unchecked; card still renders |
| Dismiss write fails | Card may reappear next session |

### Performance notes

- Single batched query at mount.
- Auto-hides after all 5 done or dismissed — zero runtime cost for most sessions.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this card

The Getting Started Checklist exists because Rhozly only feels valuable once you've added some context. A user who signs up but never adds a location won't get weather alerts; a user who adds plants but never assigns them to areas won't get microclimate insights. The checklist front-loads the 5 highest-impact 5-minute actions.

### Every flow on this card

#### 1. Glance the progress bar

- "2 of 5 done" — visual feedback that the app is filling out.

#### 2. Tap a step

- Each row is a launcher. Tapping "Add your first Location" navigates to `/management`. Tapping "Add a plant" navigates to `/shed`. Etc.
- Steps already done show a checkmark and grey out.

#### 3. Dismiss the whole card

- Tap the X → confirm step → card hides forever (per the `checklist_dismissed` flag).
- Useful for power users who imported their data via API or seeds.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Progress bar | Count of completed steps / 5 |
| Step row | Single action with a launcher |
| Checkmark | This step is done |
| Forward arrow | Tappable launcher |

### Tier-by-tier experience

Same for every tier.

### New user vs returning user

- **Brand new user**: card is the most prominent thing on the dashboard.
- **Partway through**: card shrinks visually as steps tick.
- **All done OR dismissed**: card never appears again.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Skipping the quiz to get the badge.** The quiz is the most impactful step. Skipping it just to clear the checklist defeats the point.
- **Dismissing too early.** If you're new and not sure what to do, leaving the checklist visible is the simplest guidance.
- **Treating the steps as a strict order.** They don't have to be done in sequence. Step 5 (watering reminder) can be done before step 4 (assign plant) if you prefer.

### Recommended workflows

- **First evening with the app:** complete steps 1-3 immediately. Steps 4-5 can wait until you've physically planted something.

### What to do if something looks wrong

- **A step says undone but you did it:** server query for that step may have stale data. Pull-to-refresh on the dashboard.
- **Card reappears after dismissing:** the `onboarding_state.checklist_dismissed` write failed. Try dismissing again.

---

## Related reference files

- [Dashboard Tab](../02-dashboard/01-dashboard-tab.md)
- [Welcome Modal](./02-welcome-modal.md)
- [Garden Quiz](./05-garden-quiz.md)
- [Onboarding State (cross-cutting)](../99-cross-cutting/30-onboarding-state.md)

## Code references for ongoing maintenance

- `src/components/GettingStartedChecklist.tsx` — component
- `src/onboarding/types.ts` — `OnboardingState` type
- `supabase/migrations/20260516000000_add_onboarding_state.sql` — schema
