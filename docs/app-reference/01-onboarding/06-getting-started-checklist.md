# Getting Started Checklist

> A dashboard card showing first-run users a 5-step checklist that takes them from empty account to a functioning garden tracker. Auto-ticks steps as they're completed elsewhere in the app.

**Rendered on:** the merged home tab of `/dashboard` (the Dashboard sub-tab), **just below the home hero** in **both** Simple and Detailed densities (home redesign Stage 1, 2026-07-20 — App.tsx passes the cascade into `HomeMain` as its `promoSlot` prop; previously the card sat above the whole page). It is **priority 1 of the single-slot onboarding system**: at most one promo card renders on the home, and the checklist owns the slot whenever it is visible.
**Source file:** `src/components/GettingStartedChecklist.tsx`

---

## Quick Summary

Reads `user_profiles.onboarding_state` jsonb plus a few derived facts (does the user have locations? do they have plants? have they taken the quiz?) to produce a 5-row checklist. Each row links to its respective action. The card hides itself completely once all 5 are done OR the user dismisses it, and reports that visibility to App.tsx via `onVisibilityChange` so lower-priority promo cards (quiz prompt → notification opt-in → PWA install) can claim the slot.

---

## Role 1 — Technical Reference

### Component graph

```
GettingStartedChecklist
├── Header
│   ├── "Getting Started" title (Sprout icon)
│   ├── "X of 5 steps done" count + progress bar
│   ├── Collapse toggle (local state, testid checklist-collapse-toggle)
│   └── Dismiss X (single tap, NO confirm step; testid checklist-dismiss, aria-label "Skip for now")
└── Step rows (5, testid checklist-step-{i})
    ├── Step 1: Complete the Garden Quiz → /profile
    ├── Step 2: Add your first Location → /management
    ├── Step 3: Add a plant to your Shed → /shed
    ├── Step 4: Assign a plant to an area → /shed
    └── Step 5: Create a Task Schedule → /schedule
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope checks |
| `userId` | `string` | App.tsx | For onboarding_state writes |
| `quizCompleted` | `boolean` | App.tsx | Pre-computed for step 1 |
| `hasLocations` | `boolean` | App.tsx (locations.length > 0) | Pre-computed for step 2 |
| `onboardingState` | `OnboardingState` | App.tsx | Read the dismissal key |
| `onStateChange` | `(state) => void` | App.tsx | Lift state up |
| `onVisibilityChange` | `(visible: boolean) => void` (optional) | App.tsx | **Single-slot onboarding (Phase 4.2).** Fires whenever the computed `visible` value changes, telling App.tsx whether the checklist actually rendered. App.tsx stores it as `checklistSlotVisible` (default `true`, so lower cards never flash before the checklist's queries resolve); the quiz prompt / notification opt-in / PWA install cards only render when it is `false`. |

### Step detection logic

| Step | Condition |
|------|-----------|
| 1. Complete the Garden Quiz | `quizCompleted === true` |
| 2. Add your first Location | `hasLocations === true` |
| 3. Add a plant | Server query: `inventory_items` row exists for this home |
| 4. Assign plant to area | Server query: `inventory_items` row with non-null `area_id` |
| 5. Create a Task Schedule | Server query: **any** `task_blueprints` row for this home (not Watering-specific) |

Steps 3-5 are fetched **once on mount** via a single `Promise.all([...])` (two queries: `inventory_items` `id, area_id` limit 50; `task_blueprints` `id` limit 1). There is **no realtime refresh** — ticks for steps 3-5 update on the next dashboard mount, not live. There are no per-step `onboarding_state` keys; every step is derived from live data + props.

### Visibility

```ts
const visible =
  onboardingState["getting_started_checklist"] !== "dismissed" &&
  !(loaded && completedCount === steps.length);
```

Visible unless dismissed, or all 5 steps done once the mount queries have resolved. `onVisibilityChange` is invoked in an effect whenever `visible` changes; when `!visible` the component returns `null`.

### Data flow — write paths

#### Dismiss

```ts
const next = { ...onboardingState, getting_started_checklist: "dismissed" };
onStateChange(next); // optimistic lift to App.tsx
await supabase.from("user_profiles")
  .update({ onboarding_state: next })
  .eq("uid", userId);
```

Dismissal is a **single tap of the X — there is no confirmation step**. The key is `onboarding_state.getting_started_checklist = "dismissed"` (same `"dismissed"` string convention as the Shepherd flow registry). Card never reappears unless the key is unset manually.

### Edge functions invoked

None.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None — steps 3-5 are a one-shot mount fetch (see above). Steps 1-2 update via props when App.tsx re-renders (e.g. `locations` state changes).

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
| Dismiss write fails | Optimistic state hides it this session; card may reappear next session |

### Performance notes

- Single batched query at mount (two selects in one `Promise.all`).
- Auto-hides after all 5 done or dismissed — zero runtime cost for most sessions.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this card

The Getting Started Checklist exists because Rhozly only feels valuable once you've added some context. A user who signs up but never adds a location won't get weather alerts; a user who adds plants but never assigns them to areas won't get microclimate insights. The checklist front-loads the 5 highest-impact 5-minute actions. While it's on screen it's the only promo card you'll see — the quiz reminder, notification prompt, and install prompt all politely wait their turn until the checklist is done or dismissed.

### Every flow on this card

#### 1. Glance the progress bar

- "2 of 5 steps done" — visual feedback that the app is filling out.

#### 2. Tap a step

- Each row is a launcher. Tapping "Add your first Location" navigates to `/management`. Tapping "Add a plant" navigates to `/shed`. Etc.
- Steps already done show a checkmark, strike through, and grey out (no longer tappable).

#### 3. Collapse the card

- The chevron toggle folds the step rows away, leaving just the header + progress bar. Collapse is session-only (not persisted).

#### 4. Dismiss the whole card

- Tap the X → card hides immediately and forever (per the `getting_started_checklist` dismissal). **One tap — there is no "are you sure?" step**, so tap deliberately.
- Useful for power users who imported their data via API or seeds.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Progress bar | Count of completed steps / 5 |
| Step row | Single action with a launcher + one-line description |
| Checkmark | This step is done |
| Forward arrow | Tappable launcher |

### Tier-by-tier experience

Same for every tier.

### New user vs returning user

- **Brand new user**: card is the most prominent thing on the dashboard.
- **Partway through**: the progress bar fills as steps tick.
- **All done OR dismissed**: card never appears again — and the onboarding slot passes to the next eligible card (quiz prompt, then notification opt-in, then PWA install).

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Skipping the quiz to get the badge.** The quiz is the most impactful step. Skipping it just to clear the checklist defeats the point.
- **Dismissing too early — and by accident.** Dismissal is a single tap with no confirm, and it's permanent. If you're new and not sure what to do, leaving the checklist visible is the simplest guidance.
- **Treating the steps as a strict order.** They don't have to be done in sequence. Step 5 (task schedule) can be done before step 4 (assign plant) if you prefer.
- **Expecting instant ticks for steps 3-5.** Plant / area / schedule steps are checked once when the dashboard loads — add a plant on another tab and the tick appears next time you land on the dashboard.

### Recommended workflows

- **First evening with the app:** complete steps 1-3 immediately. Steps 4-5 can wait until you've physically planted something.

### What to do if something looks wrong

- **A step says undone but you did it:** steps 3-5 are checked once at dashboard load. Navigate away and back (or reload) to re-check.
- **Card reappears after dismissing:** the `onboarding_state.getting_started_checklist` write failed. Try dismissing again.
- **You dismissed the checklist and a different card appeared:** that's the single-slot cascade working as intended — the quiz prompt (or notification / install card) takes the freed slot.

---

## Related reference files

- [Home (Main Dashboard)](../02-dashboard/17-home-main.md) — the host surface
- [Welcome Modal](./02-welcome-modal.md)
- [Garden Quiz](./05-garden-quiz.md) — the priority-2 slot card when the checklist is gone
- [Notification Opt-In](./07-notification-opt-in.md) — priority-3 slot card
- [PWA Install Prompt](./08-pwa-install.md) — priority-4 slot card
- [Onboarding State (cross-cutting)](../99-cross-cutting/30-onboarding-state.md) — includes the single-slot promo card cascade

## Code references for ongoing maintenance

- `src/components/GettingStartedChecklist.tsx` — component
- `src/App.tsx` — single-slot host (`checklistSlotVisible` + eligibility flags)
- `src/onboarding/types.ts` — `OnboardingState` type
- `supabase/migrations/20260516000000_add_onboarding_state.sql` — schema
