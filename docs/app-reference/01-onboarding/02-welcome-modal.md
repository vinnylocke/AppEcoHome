# Welcome Modal

> The first-run 4-slide carousel new users see immediately after Home Setup. Sets expectations about the Location → Area → Plant hierarchy, recurring task schedules, and the Garden Quiz.

**Trigger:** Renders when `profile.onboarding_state.welcome_modal` is absent (i.e. neither completed nor dismissed) AND `showWelcomeModal` becomes true in App.tsx.
**Source file:** `src/components/WelcomeModal.tsx`

---

## Quick Summary

A modal with 5 slides shown once per user. Slide 1 welcomes them; slide 2 explains the data hierarchy (Location → Area → Plant) with a small inline diagram; slide 3 explains recurring task schedules; slide 4 captures the user's persona (`new` / `experienced`) so downstream surfaces can shorten copy + skip coach marks; slide 5 offers two paths — "Take the Garden Quiz" (recommended) or "Skip for now". Completion / dismissal is persisted to `user_profiles.onboarding_state.welcome_modal = "completed" | "dismissed"`.

**Express lane (Sprint 1, 2026-06-15):** slide 1 also shows a small "I'm experienced — skip the tour" link below the Next button. Tapping it sets `persona = "experienced"`, marks the modal as completed, and closes without stepping through the carousel.

**Desktop sizing (Sprint 2, 2026-06-15):** the modal width grows to `max-w-lg` on `md` and `max-w-xl` on `lg` so desktop users don't see a phone-sized card in the middle of a wide screen.

---

## Role 1 — Technical Reference

### Component graph

```
WelcomeModal
├── Close X button (top right, requires confirm)
├── Slide carousel
│   ├── Slide 1: "Welcome to Rhozly 🌿" — IconAI hero
│   ├── Slide 2: "Your garden, organised" — HierarchyDiagram (Location → Area → Plant)
│   ├── Slide 3: "Tasks that run themselves" — TaskFlowDiagram (Repeat icon)
│   └── Slide 4: "Let's get started" — two CTAs
├── Navigation row
│   ├── Back button (slide 2+)
│   ├── Slide indicator dots
│   └── Next button (or Finish on slide 4)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `userId` | `string` | App.tsx | For onboarding_state writes |
| `onboardingState` | `OnboardingState` | App.tsx state.onboardingState | Read previous progress |
| `onStateChange` | `(state: OnboardingState) => void` | App.tsx setOnboardingState | Lift state up |
| `onClose` | `() => void` | App.tsx | Hide modal |

### Local state

| State | Purpose |
|-------|---------|
| `slideIdx` | Current slide (0-3) |

### Data flow — write paths

#### `recordCompletion(status)`

Called from:
- "Take the Garden Quiz" button → status `"completed"` then navigate to `/profile`
- "Skip for now" button → status `"completed"` then close
- Close X button (after confirm) → status `"dismissed"` then close

Writes:
```ts
supabase.from("user_profiles")
  .update({ onboarding_state: { ...prev, welcome_modal: status } })
  .eq("uid", userId);
```

And mirrors the change via `onStateChange` so the parent state stays in sync.

### Edge functions invoked

None.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None — purely local state + a single write.

### Tier gating

None. Welcome Modal shows for every new user regardless of tier.

### Beta gating

None.

### Permissions / role-based UI

None.

### Error states

| State | Result |
|-------|--------|
| Write fails | Silent — local state still progresses. Modal still closes. Next session it may reappear if the write didn't commit. |

### Performance notes

- Lightweight — single component, no fetches.
- Renders once and stays in memory until dismissed.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this modal

The Welcome Modal is the app's onboarding handshake — "here's what we do, here's how we organise your garden, here's the one thing we'd love you to do next." It's deliberately short. Most users skim slide 1, glance the diagram on slide 2, and tap through to slide 4.

### Every flow on this modal

#### 1. Read slides 1-3

- Tap "Next" to advance. The arrows on either side are also tap targets on touch devices.

#### 2. Slide 4: Take the Garden Quiz

- Recommended path. Routes to `/profile` where the quiz lives.
- Why a gardener cares: the quiz personalises plant recommendations and watering defaults. Two minutes well spent.

#### 3. Slide 4: Skip for now

- Closes the modal, marks as `"completed"`. Won't reappear.
- Users can take the quiz later from the dashboard prompt card or `/profile`.

#### 4. Close X button

- Triggers a small "Hide this for now?" confirm overlay to prevent accidental dismissal.
- Marks as `"dismissed"` if confirmed.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Slide 1 hero | Welcome message — branded |
| Slide 2 hierarchy diagram | Visual: Location > Area > Plant. Critical conceptual model. |
| Slide 3 task flow | Visual showing recurring task generation |
| Slide 4 CTAs | Two equal-weight buttons |
| Slide dots | Progress indicator |

### Tier-by-tier experience

Same for every tier.

### New user vs returning user

- **Brand new user**: sees this immediately after Home Setup.
- **Returning user**: never sees it again (gated by `onboarding_state.welcome_modal`).

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Skipping the diagram on slide 2.** Users who don't internalise Location > Area > Plant are confused later when they can't figure out where to assign their tomatoes.
- **Dismissing X-style.** The confirm-step is intentional. Some users still tap through it without reading. They miss the quiz prompt.

### Recommended workflows

- **First run:** click through all 4 slides; tap "Take the Garden Quiz" on slide 4.

### What to do if something looks wrong

- **Modal reappears on next login:** the write to `onboarding_state` didn't commit. Reload and finish the modal again.
- **Quiz never opens after CTA:** route may be broken; check `/profile` directly.

---

## Related reference files

- [Auth Screen](./01-auth-screen.md)
- [Home Setup](./03-home-setup.md)
- [Garden Quiz](./05-garden-quiz.md)
- [Onboarding State (cross-cutting)](../99-cross-cutting/30-onboarding-state.md)

## Code references for ongoing maintenance

- `src/components/WelcomeModal.tsx` — entire component
- `src/App.tsx` — `showWelcomeModal` state + trigger logic
- `supabase/migrations/20260516000000_add_onboarding_state.sql` — onboarding_state schema
