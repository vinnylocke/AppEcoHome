# Onboarding State — `user_profiles.onboarding_state` jsonb

> A jsonb column on `user_profiles` that tracks which onboarding surfaces the user has seen / dismissed / completed. Lets Rhozly avoid re-showing the welcome modal, getting-started checklist, notification opt-in, etc. once they're done.

---

## Quick Summary

```ts
user_profiles.onboarding_state: {
  welcome_modal: "completed" | "dismissed",
  getting_started: {
    quiz_done: boolean,
    location_added: boolean,
    plant_added: boolean,
    plant_assigned: boolean,
    schedule_added: boolean,
  },
  notification_opt_in: "granted" | "denied" | "dismissed",
  pwa_install: "installed" | "dismissed",

  // Wave 23.0001 — Shepherd.js flow registry state.
  // Per-flow status, plus throttle + signal book-keeping.
  [flowId: string]: "completed" | "dismissed",            // e.g. global_welcome: "completed"
  last_auto_trigger_at: string,                            // ISO timestamp — used by useAutoTrigger throttle
  trigger_signals: Record<string, true>,                   // first_chat_opened, first_notes_visit, etc.

  // ... per-surface state
}
```

---

## Role 1 — Technical Reference

### Migration

`supabase/migrations/20260516000000_add_onboarding_state.sql` adds the column with `default '{}'::jsonb`.

### Read pattern

```ts
const state = profile.onboarding_state ?? {};
if (!state.welcome_modal) {
  // show welcome
}
```

### Write pattern

```ts
supabase.from("user_profiles")
  .update({ onboarding_state: { ...prev, welcome_modal: "completed" } })
  .eq("uid", userId);
```

### Surfaces

| Surface | Key |
|---------|-----|
| [Welcome Modal](../01-onboarding/02-welcome-modal.md) | `welcome_modal` |
| [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md) | `getting_started.*` |
| [Notification Opt-In](../01-onboarding/07-notification-opt-in.md) | `notification_opt_in` |
| [PWA Install](../01-onboarding/08-pwa-install.md) | `pwa_install` (paired with localStorage) |
| Shepherd flow registry (`src/onboarding/flowRegistry.ts`) | `<flowId>: "completed" \| "dismissed"` per tour |
| Pacing throttle (`src/onboarding/useAutoTrigger.ts`) | `last_auto_trigger_at` ISO timestamp |
| Action-based triggers (`src/onboarding/signals.ts`) | `trigger_signals: { [signal]: true }` |

### Wave 23.0001 — pacing engine

To stop new users being bombarded by auto-firing tours, three jsonb additions:

1. **`last_auto_trigger_at`** — ISO timestamp set every time `useAutoTrigger` opens a non-`important` flow. The hook short-circuits if the stored timestamp is on the same local calendar day as `Date.now()`. Flows marked `important: true` in [`flowRegistry`](../../../src/onboarding/flowRegistry.ts) (e.g. `global_welcome`, `home_setup_tips`) bypass the throttle.
2. **`trigger_signals`** — accrues `true` flags as the user touches each surface (`first_chat_opened`, `first_notes_visit`, `first_weekly_visit`, `first_plant_created`, `first_walk_started`, `first_nursery_open`). Flows with a matching `triggerSignal` field only fire after the signal is recorded.
3. **Flow status keys** — each entry in the flow registry persists its outcome as `"completed"` or `"dismissed"`. Both states satisfy `isFlowDone()` so a dismissed tour does not re-fire.

Recording a signal is fire-and-forget:

```ts
import { recordSignal } from "../onboarding/signals";
useEffect(() => { void recordSignal("first_notes_visit"); }, []);
```

`recordSignal` is idempotent — it short-circuits via an in-memory `recordedThisSession` cache, then a DB read of the existing `trigger_signals` map. Safe to call on every mount.

### Why jsonb

Avoids a wide column proliferation. Each onboarding surface gets a sub-key without a schema migration.

### Trade-off

No easy SQL filtering by state (would need `WHERE onboarding_state ->> 'welcome_modal' IS NULL`). Acceptable since reads are per-user.

### Reset

Users can re-trigger onboarding via Account Settings (planned). Today, manual SQL.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

You don't see the welcome modal twice. The getting-started checklist disappears once you've completed each step. The notification opt-in only asks once. All driven by this column.

### Implications

- If you reinstall Rhozly natively, the column persists across devices (DB-backed, not localStorage).
- Some surfaces use both jsonb + localStorage (PWA) for belt-and-braces.

---

## Related reference files

- [Welcome Modal](../01-onboarding/02-welcome-modal.md)
- [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md)
- [Notification Opt-In](../01-onboarding/07-notification-opt-in.md)
- [PWA Install Prompt](../01-onboarding/08-pwa-install.md)

## Code references for ongoing maintenance

- `supabase/migrations/20260516000000_add_onboarding_state.sql`
- `src/App.tsx` — onboarding state reads + writes
- `src/onboarding/types.ts` — `OnboardingState`, `FlowDef`, `FlowStatus` typings
- `src/onboarding/signals.ts` — `recordSignal`, `recordOnboardingSignal`, `isFlowDone`, `isSameLocalDay`
- `src/onboarding/useAutoTrigger.ts` — throttle + prerequisite + triggerSignal eligibility check
- `src/onboarding/flowRegistry.ts` — flow definitions (`important`, `prerequisite`, `triggerSignal` fields)
- `src/onboarding/HelpCenter.tsx` — wires the hook to the live `OnboardingState`
