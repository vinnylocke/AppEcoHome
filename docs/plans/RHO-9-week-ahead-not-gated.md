# RHO-9 — "Your Week Ahead" card isn't tier-locked for Sprout (leads to a locked page)

**Jira:** RHO-9 · Bug · Medium · Sprout dashboard.

## Problem
The dashboard "Your Week Ahead / Plan your Sunday" card is shown and clickable for a Sprout user,
but it navigates to `/weekly`, which is Evergreen-gated — so the user taps an available-looking
card and lands on a full-size "AI Insights is an Evergreen feature" upsell.

## Reproduction (confirmed 2026-07-01)
Sprout dashboard: the Week Ahead card shows no lock. Tapping it → `/weekly` → the AI Insights
UpgradeNudge panel (screenshot attached).

## Root cause
The gate is on the destination page but **missing on the entry card**. `WeekAheadPreview` (rendered
from `HomeDashboard`) does `navigate("/weekly")` at
[WeekAheadPreview.tsx:97](../../src/components/shared/WeekAheadPreview.tsx#L97) with no tier check.
`/weekly` = `WeeklyOverviewPage`, wrapped in `<FeatureGate feature="ai_insights">` with no fallback
([WeeklyOverviewPage.tsx:127-133](../../src/components/WeeklyOverviewPage.tsx#L127-L133)); `ai_insights`
is Evergreen-only ([tierFeatures.ts:54](../../src/constants/tierFeatures.ts#L54)).

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md)

## Recommended fix
Gate the card itself on `ai_insights`. Wrap `WeekAheadPreview` where `HomeDashboard` renders it in
`<FeatureGate feature="ai_insights" tier={tier} fallback={null}>…</FeatureGate>` (pass the live tier
to avoid a flash; `fallback={null}` → render nothing for Sprout, per the RHO-2 FeatureGate
semantics). **Gate on the `ai_insights` feature, not the `aiEnabled` prop** — Sage has `ai_enabled`
but is NOT entitled to the weekly overview (Evergreen-only).

## Tests
- E2E (Sprout): assert the Week Ahead card is absent on the dashboard.

## Risks
- Must pass the resolved tier down (module-cache defaults to Sprout before the profile loads → a
  flash if `tier` isn't passed).
