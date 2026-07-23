# Onboarding State — `user_profiles.onboarding_state` jsonb

> A jsonb column on `user_profiles` that tracks which onboarding surfaces the user has seen / dismissed / completed. Lets Rhozly avoid re-showing the welcome modal, getting-started checklist, notification opt-in, etc. once they're done.

---

## Quick Summary

```ts
user_profiles.onboarding_state: {
  welcome_modal: "completed" | "dismissed",
  getting_started_checklist: "dismissed",                  // only ever written on dismiss — no per-step keys exist
  quiz_prompt_snoozed_until: string,                       // ISO YYYY-MM-DD — dashboard quiz prompt snooze

  // Wave 23.0001 — Shepherd.js flow registry state.
  // Per-flow status, plus throttle + signal book-keeping.
  [flowId: string]: "completed" | "dismissed",            // e.g. global_welcome: "completed"
  last_auto_trigger_at: string,                            // ISO timestamp — used by useAutoTrigger throttle
  trigger_signals: Record<string, true>,                   // first_chat_opened, first_notes_visit, etc.
}
```

**Keys that do NOT exist (historical doc drift — never write them):** a `getting_started.{quiz_done, location_added, …}` per-step map (checklist steps are derived live from `quiz_completed`, locations, `inventory_items`, and `task_blueprints` — nothing per-step is persisted); `notification_opt_in`; `pwa_install`. The notification opt-in and PWA install cards persist to **localStorage only** (see the single-slot section below).

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
| Garden Quiz prompt (merged home onboarding slot) | `quiz_prompt_snoozed_until` — ISO `YYYY-MM-DD` date. When set + greater than today the prompt is hidden. "Snooze 2 weeks" writes today + 14d; "Don't ask again" writes today + ~100y. Sprint 2 (2026-06-15) — replaced the in-memory-only `quizPromptDismissed` flag so the dismissal survives page reload. |
| [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md) | `getting_started_checklist: "dismissed"` — written only on the single-tap dismiss. No per-step keys; steps are derived from live data. |
| [Notification Opt-In](../01-onboarding/07-notification-opt-in.md) | **None** — localStorage `rhozly_notif_optin_dismissed = "true"` only |
| [PWA Install](../01-onboarding/08-pwa-install.md) | **None** — localStorage `rhozly_pwa_install_dismissed` / `rhozly_pwa_installed` (`"true"`) only |
| Shepherd flow registry (`src/onboarding/flowRegistry.ts`) | `<flowId>: "completed" \| "dismissed"` per tour. 24 flows as of 2026-07-23 (the `quick_launcher_customise_tour` was deleted with the Quick Launcher customiser removal): `global_welcome`, `home_setup_tips`, `dashboard_tour`, `garden_hub_tour`, `weather_insights_tour`, `planner_tour`, `task_schedule_tour`, `tools_hub_tour`, `plant_doctor_tour`, `visualiser_tour`, `add_manual_plant`, `add_location_and_area`, `guides_tour`, `profile_quiz_tour`, plus 10 Wave-23.0003 additions: `quick_access_tour`, `weekly_overview_tour`, `notes_tour`, `voice_chat_tour`, `image_credits_tour`, `garden_ai_chat_tour`, `plantnet_identification_tour`, `nursery_tour`, `garden_walk_tour`, `seasonal_picks_tour`. |
| Pacing throttle (`src/onboarding/useAutoTrigger.ts`) | `last_auto_trigger_at` ISO timestamp |
| Action-based triggers (`src/onboarding/signals.ts`) | `trigger_signals: { [signal]: true }` |

### Single-slot dashboard promo cards (Phase 4.2; slot moved below the hero 2026-07-20)

The merged home tab of `/dashboard` renders **at most one** onboarding promo card, cascaded by priority in App.tsx. Since Stage 1 of the home redesign the cascade is passed into `HomeMain` as its `promoSlot` prop and renders **below the hero** in both densities (previously above the page — the greeting now always leads). The slot discipline, priority order, card testids, and persistence stores are all unchanged:

| Priority | Card | Eligibility | Persistence store |
|----------|------|-------------|-------------------|
| 1 | [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md) | Not dismissed AND not all 5 steps done; reports its actual visibility to App.tsx via its `onVisibilityChange` prop (`checklistSlotVisible`, defaults `true` so lower cards never flash before its queries resolve) | `onboarding_state.getting_started_checklist = "dismissed"` |
| 2 | Garden Quiz prompt (inline in App.tsx) | `quizCompleted === false` (explicit false only) AND not session-dismissed AND not snoozed | `onboarding_state.quiz_prompt_snoozed_until` (ISO date) |
| 3 | [Notification Opt-In](../01-onboarding/07-notification-opt-in.md) | Notifications supported AND `Notification.permission === "default"` AND not LS-dismissed | localStorage `rhozly_notif_optin_dismissed` |
| 4 | [PWA Install Prompt](../01-onboarding/08-pwa-install.md) | Not native / standalone / LS-flagged AND a `beforeinstallprompt` event was captured (Chrome / Edge / Android only) | localStorage `rhozly_pwa_install_dismissed`, `rhozly_pwa_installed` |

Each lower card renders only when every higher card is ineligible. Note the split of stores: priorities 1-2 are DB-backed (`onboarding_state`, cross-device); priorities 3-4 are localStorage-backed (per-device).

**Related Stage-1 tour touch-up:** `dashboard_tour` step 2 (anchor `home-status-strip`) had its copy rewritten for the new sentence hero — "Your day in one sentence" describes the composed status sentence plus the "Plan my day" / weather chips. The anchor testid is unchanged. See [Home (Main Dashboard)](../02-dashboard/17-home-main.md).

**Related stats+locations Stage-4a tour touch-up (2026-07-20):** `dashboard_tour` step 1 (anchor `dashboard-view-switcher`) was retitled "Four views in one" → **"Three views in one"** and its body dropped the "location overview" mention (now "…home dashboard, a full task calendar, and a 7-day weather forecast. Your locations live right on the dashboard now."), because the Locations tab was retired into the home garden grid — the switcher is three tabs. The anchor testid is unchanged. See [Locations Tab — RETIRED](../02-dashboard/02-locations-tab.md).

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

### E2E baseline (2026-07-13)

`supabase/seeds/00_bootstrap.sql` seeds the worker accounts' `onboarding_state` with **every
registry flow + `welcome_modal` = `"dismissed"`**. Rationale: `global_welcome` is
`route: "global"` + `important: true`, so on an empty state it fires a centred, pointer-intercepting
Shepherd card ~800ms after *every* navigation, in *every* fresh browser context (the per-session
guard is sessionStorage) — silently sabotaging raw-mouse E2E tests. Specs that test un-dismissed
flows mock their own profile fetch instead (`tests/e2e/fixtures/welcome-modal-ready.ts`). Re-running
seeds resets any tour state accumulated by prior runs. Full analysis:
docs/plans/glb-015-offscreen-canvas-and-tour-seeds.md.

### Closed Help drawer is inert (2026-07-13)

The Help Center drawer (the auto-trigger host) stays DOM-mounted for its slide transition; the
closed container now carries `aria-hidden` + `inert` so its content is unreachable by assistive
tech and absent from ARIA snapshots until opened — see
[Help Center](../08-modals-and-overlays/24-help-center.md).

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

You don't see the welcome modal twice. The getting-started checklist disappears once you've completed every step or dismissed it. The quiz reminder honours its snooze. All driven by this column — and the dashboard only ever shows one of these promo cards at a time, tucked just below the home greeting (the single-slot cascade above).

### Implications

- If you reinstall Rhozly natively, this column persists across devices (DB-backed, not localStorage).
- The notification opt-in and PWA install cards are the exception: they persist only to localStorage, so their dismissals are per-device and reset if you clear browser data.

---

## Related reference files

- [Welcome Modal](../01-onboarding/02-welcome-modal.md)
- [Getting Started Checklist](../01-onboarding/06-getting-started-checklist.md)
- [Notification Opt-In](../01-onboarding/07-notification-opt-in.md)
- [PWA Install Prompt](../01-onboarding/08-pwa-install.md)

## Code references for ongoing maintenance

- `supabase/migrations/20260516000000_add_onboarding_state.sql`
- `src/App.tsx` — onboarding state reads + writes; single-slot promo card cascade + quiz prompt snooze
- `src/components/GettingStartedChecklist.tsx` — `getting_started_checklist` dismissal + `onVisibilityChange`
- `src/components/NotificationOptInCard.tsx` / `src/components/InstallPwaPrompt.tsx` — localStorage-only cards
- `src/onboarding/types.ts` — `OnboardingState`, `FlowDef`, `FlowStatus` typings
- `src/onboarding/signals.ts` — `recordSignal`, `recordOnboardingSignal`, `isFlowDone`, `isSameLocalDay`
- `src/onboarding/useAutoTrigger.ts` — throttle + prerequisite + triggerSignal eligibility check
- `src/onboarding/flowRegistry.ts` — flow definitions (`important`, `prerequisite`, `triggerSignal` fields)
- `src/onboarding/HelpCenter.tsx` — wires the hook to the live `OnboardingState`
