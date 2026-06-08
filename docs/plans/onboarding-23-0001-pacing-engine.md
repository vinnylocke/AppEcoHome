# Plan — 23.0001: Pacing engine + throttle the bombardment

Wave A of the onboarding overhaul ([master plan](./onboarding-docs-master-audit.md)). Ships first because it stops the bombardment immediately and gives later waves room to add more tours without making the experience worse.

## Goals

1. **One auto-tour per calendar day, max.** (Locked by user.) Except for the welcome / home-setup pair, which are first-session essentials.
2. **Prerequisites between tours** — a tour can require another to be completed first, so we never fire `dashboard_tour` before `global_welcome`.
3. **Action-based triggers** — new tours opt into "fire when the user first does X" instead of route-based, so a tour fires only after the user has actually touched the feature.
4. **Help Center stays manual** — pull-anytime model. The throttle only affects automatic firing.

## App-reference files consulted

- [Onboarding State](../app-reference/99-cross-cutting/30-onboarding-state.md) — confirms `user_profiles.onboarding_state` jsonb is the persistence layer; per-key, additive, no migration needed
- [Welcome Modal](../app-reference/01-onboarding/02-welcome-modal.md), [Getting Started Checklist](../app-reference/01-onboarding/06-getting-started-checklist.md) — flag the "essentials" that bypass throttle

## Schema additions (zero DB cost — jsonb keys)

```ts
user_profiles.onboarding_state: {
  // ... existing keys (welcome_modal, getting_started, ...)
  last_auto_trigger_at?: string;          // ISO date — YYYY-MM-DD
  trigger_signals?: Record<string, true>; // e.g. { "first_chat_opened": true }
}
```

No migration. The jsonb column already exists; we just write additional keys.

## Code changes

### 1. `FlowDef` interface gets three new optional fields

```ts
// src/onboarding/types.ts
export interface FlowDef {
  // ... existing fields
  /** Wave 23.0001 — only fire when this flow has been completed. */
  prerequisite?: string;
  /** Wave 23.0001 — replaces `trigger: "automatic"` with action-based.
   *  When set, the flow fires only after the named signal is recorded. */
  triggerSignal?: string;
  /** Wave 23.0001 — bypass the once-per-day throttle for first-session
   *  essentials (Welcome, Home Setup). */
  important?: boolean;
}
```

### 2. New helper `recordSignal()` for the rest of the app to call

```ts
// src/onboarding/signals.ts
export async function recordOnboardingSignal(
  userId: string,
  signal: string,
  current: OnboardingState,
  setState: (s: OnboardingState) => void,
) {
  if (current.trigger_signals?.[signal]) return;
  const next: OnboardingState = {
    ...current,
    trigger_signals: { ...(current.trigger_signals ?? {}), [signal]: true },
  };
  setState(next);
  await supabase
    .from("user_profiles")
    .update({ onboarding_state: next })
    .eq("uid", userId);
}
```

Surfaces that need to call this in 23.0001 (just the plumbing — the **flows** that consume the signals come in 23.0003):

| Surface | Signal name |
|---------|-------------|
| `PlantDoctorChat` first open | `first_chat_opened` |
| `NotesPage` first visit | `first_notes_visit` |
| `WeeklyOverviewPage` first visit | `first_weekly_visit` |
| Plant created (any source) | `first_plant_created` |
| Garden Walk first start | `first_walk_started` |
| Nursery tab first open | `first_nursery_open` |

23.0001 wires the helper + signals into these surfaces. 23.0003 adds the matching tours.

### 3. `useAutoTrigger` — the throttle

Rewrite the hook to:

```ts
function isToday(iso?: string): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

export function useAutoTrigger(state, triggerFlow, enabled) {
  // ...
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      const s = stateRef.current;
      const candidates = flowRegistry
        .filter((f) => isEligible(f, s, pathname))
        .sort((a, b) => a.order - b.order);

      // Always allow `important` flows (Welcome, Home Setup), regardless
      // of the per-day throttle. Their `important: true` flag bypasses
      // the timer below.
      const importantOnly = candidates.find((c) => c.important);
      if (importantOnly) {
        markTriggered(importantOnly.id);
        triggerFlow(importantOnly.id);
        return;
      }

      // Throttle: one non-important auto-tour per calendar day, persisted
      // via onboarding_state.last_auto_trigger_at (per-device localStorage
      // would lose this across browsers).
      if (isToday(s.last_auto_trigger_at)) return;

      const flow = candidates[0];
      if (!flow) return;

      markTriggered(flow.id);
      triggerFlow(flow.id);
      // Persist the throttle stamp.
      const next = { ...s, last_auto_trigger_at: new Date().toISOString() };
      void supabase.from("user_profiles").update({ onboarding_state: next }).eq("uid", userId);
    }, 800);
    return () => clearTimeout(timer);
  }, [pathname, enabled, triggerFlow]);
}

function isEligible(f: FlowDef, s: OnboardingState, pathname: string): boolean {
  if (s[f.id]) return false;                          // already done
  if (f.prerequisite && !s[f.prerequisite]) return false;
  if (f.triggerSignal) {
    return !!s.trigger_signals?.[f.triggerSignal];
  }
  // Legacy route-based trigger
  return f.trigger === "automatic" && (f.route === pathname || f.route === "global");
}
```

### 4. Mark existing essentials

`global_welcome` and `home_setup_tips` get `important: true` so they bypass the throttle. They're the only two that should ever fire on day 1; everything else waits at most one per day.

## Files modified

| File | Change |
|------|--------|
| [`src/onboarding/types.ts`](../../src/onboarding/types.ts) | `prerequisite`, `triggerSignal`, `important` fields on `FlowDef`; `last_auto_trigger_at` and `trigger_signals` on `OnboardingState` |
| [`src/onboarding/useAutoTrigger.ts`](../../src/onboarding/useAutoTrigger.ts) | New throttle + prerequisite + signal eligibility logic |
| [`src/onboarding/flowRegistry.ts`](../../src/onboarding/flowRegistry.ts) | Mark `global_welcome` + `home_setup_tips` with `important: true` |
| **NEW** `src/onboarding/signals.ts` | `recordOnboardingSignal()` helper |
| [`src/components/PlantDoctorChat.tsx`](../../src/components/PlantDoctorChat.tsx) | Call `recordOnboardingSignal("first_chat_opened")` on first open |
| [`src/components/notes/NotesPage.tsx`](../../src/components/notes/NotesPage.tsx) | Record `first_notes_visit` on mount |
| [`src/components/WeeklyOverviewPage.tsx`](../../src/components/WeeklyOverviewPage.tsx) | Record `first_weekly_visit` on mount |
| [`src/components/BulkSearchModal.tsx`](../../src/components/BulkSearchModal.tsx) (or wherever plant creation lands) | Record `first_plant_created` after successful save |
| [`src/components/GardenWalk.tsx`](../../src/components/GardenWalk.tsx) | Record `first_walk_started` on start |
| [`src/components/nursery/NurseryTab.tsx`](../../src/components/nursery/NurseryTab.tsx) | Record `first_nursery_open` on mount |
| [`docs/app-reference/99-cross-cutting/30-onboarding-state.md`](../app-reference/99-cross-cutting/30-onboarding-state.md) | Document the new jsonb keys |

## Tests

- **Vitest unit** — `tests/unit/onboarding/throttle.test.ts`:
  - First call of the day → fires
  - Second call same day → no fire (returns early)
  - `important: true` flow → fires regardless of throttle
  - `prerequisite` not satisfied → skipped
  - `triggerSignal` not recorded → skipped

## Tier gating

None.

## Deploy

Frontend-only. Minor bump → **23.0001**.

## Risks

- **Same-day rollout**: existing users may already have a `last_auto_trigger_at` of "never". On the first time they sign in after deploy, an auto-tour could still fire — that's fine, it's just their one for the day.
- **Signal hooks are no-ops without the matching tours**: in 23.0001 the signals just get recorded but no tour fires on them. That's intentional — 23.0003 adds the tours and only then do they become user-visible.
- **No content regressions**: this wave doesn't touch a single doc, screenshot, or tour body. Pure plumbing.
