# RHO-2 — Dashboard: locked feature panels dominate the screen

**Jira:** RHO-2 (epic RHO-1, Rhozly Sprout Tier Regression) · Bug · Medium
**Status when planned:** To Do → In Planning

## Problem
On the dashboard, a Sprout (free) user sees full-size "Upgrade to Evergreen" panels for
Head Gardener and AI Insights stacked **above** their actual data, forcing an immediate
scroll past them to reach tasks / week ahead / garden walk. The reporter wants the locked
state shown **compactly** ("neat sections"), not removed — while keeping the dashboard
usable above the fold.

## Reproduction (confirmed on prod, 2026-06-25)
- Account `test.rhozly+sprout@rhozly.com`, app 31.0021, PWA, Pixel Tablet landscape (1280×800).
- Login → `/dashboard`. Order rendered: heat alert → tabs → notifications CTA → "Good
  afternoon" card → **🔒 Head Gardener** upsell → **🔒 AI Insights** upsell → tasks/week
  ahead/garden walk → This Week at a Glance → **🔒 AI Insights upsell AGAIN** → tasks list.
- So it's slightly worse than reported: **three** full-height upsell panels, incl. a
  duplicate AI Insights, two of them above the task list.
- Evidence: `docs/jira-evidence/RHO-2/sprout-dashboard-landscape-viewport.png` (+ `-fullpage`).

## Root cause (the real one — confirmed against the live DOM)
A **bug in `FeatureGate`**. Line 28 was:
```tsx
return <>{fallback ?? <UpgradeNudge feature={feature} />}</>;
```
`null ?? X === X`, so an explicit **`fallback={null}` does not render nothing — it renders the
full default `UpgradeNudge`**. Every gate that passed `fallback={null}` to mean "hide when
locked" was instead showing the big "… is a Evergreen feature" panel. On the dashboard for a
Sprout user that produced **three** full panels: Head Gardener + AI Insight cards (both
`fallback={null}`) **and** `SeasonalPicksCard` ("Sow & grow this week", also `fallback={null}`).

(The earlier "embedded pages" and "stale bundle" theories during triage were both wrong — the
live bundle was current; the `??` bug was the cause all along. Verified by walking the live DOM:
the third panel is `SeasonalPicksCard`'s gate output.)

Six gates across the app were affected (all intended to hide, all showing the full panel):
`SeasonalPicksCard`, `AssistantCard`, `AreaAiAnalysisPanel`, `MoistureBehaviourCard`,
`AutomationSuggestions` (ai_insights), `HomeManagement` (multiple_homes), `TaskCalendar` (ics_export).

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md)

## Approach (implemented)
1. **Fix `FeatureGate`** — `fallback !== undefined ? fallback : <UpgradeNudge/>`. Now explicit
   `fallback={null}` renders nothing (intended); omitting `fallback` still shows the default
   upsell. This alone removes the SeasonalPicksCard panel and the giant upsells on the area /
   automation / multi-home / ICS surfaces.
2. **Dashboard teasers (the approved UX)** — Head Gardener + AI Insights should still be
   *discoverable* on the dashboard, so give them an explicit **compact** `UpgradeNudge`:
   - `HeadGardenerCard` (dashboard-only): `fallback={<UpgradeNudge feature="head_gardener" compact />}`.
   - `AssistantCard` (also Planner/Shed): opt-in `showUpgradeWhenLocked` prop — only the
     dashboard passes it; elsewhere it stays `fallback={null}` → now correctly hidden.

Net for Sprout dashboard: two slim one-line teasers (Head Gardener, AI Insights); the
SeasonalPicksCard panel is gone; tasks/week-ahead are no longer pushed down.

### Alternatives considered
- **Only fix the two cards** (no FeatureGate change) — would leave the third SeasonalPicksCard panel and the same bug on five other surfaces. Rejected.

## Files changed
- `src/components/shared/FeatureGate.tsx` — the `??` → `!== undefined` fix (root cause).
- `src/components/manager/HeadGardenerCard.tsx` — import `UpgradeNudge`; compact fallback.
- `src/components/AssistantCard.tsx` — `showUpgradeWhenLocked` prop; compact fallback when set.
- `src/App.tsx:1558` — pass `showUpgradeWhenLocked` to the dashboard `AssistantCard`.
- `tests/e2e/specs/dashboard.spec.ts` — DASH-040/041 (compact teaser present, no full panel) + DASH-042 (no full-size upsell anywhere on the Sprout dashboard).

## Docs updated
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) — tier-by-tier: Sprout sees compact teasers.
- [docs/e2e-test-plan/](../e2e-test-plan/) — dashboard rows DASH-040/041/042.

## Risks
- The FeatureGate fix changes behaviour on all six `fallback={null}` surfaces — but every one
  intended "hide", so this restores intended behaviour (no surface relied on the buggy panel).
- `AssistantCard` is shared; the teaser is opt-in so Planner/Shed stay hidden.
- Compact teaser links to `/gardener` (UpgradeNudge default) — the plan picker tab.
