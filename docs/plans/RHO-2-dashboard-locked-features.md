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

## Root cause (corrected after implementation — see note below)
The locked panels are rendered by the two dashboard cards themselves, **not** by embedded
pages (the original triage read was based on a **stale prod bundle** — see "Deployment note"):
- `HeadGardenerCard` ([src/components/manager/HeadGardenerCard.tsx](../../src/components/manager/HeadGardenerCard.tsx)) — dashboard only ([App.tsx:1555](../../src/App.tsx#L1555)).
- `AssistantCard` ([src/components/AssistantCard.tsx](../../src/components/AssistantCard.tsx)) — dashboard ([App.tsx:1558](../../src/App.tsx#L1558)) **and** Planner + Shed.

Both wrap their content in `FeatureGate feature="…"`. On the **live (stale) bundle** they used
the *default* fallback → the full-size `UpgradeNudge` (the big "… is a Evergreen feature" panel
that dominated the screen). On current `main` they already used `fallback={null}` (render
nothing) — but that's neither the reported bug nor the desired "neat section". The approved
decision is a **compact teaser**.

### Deployment note
Live `rhozly.com` (bundle `index-C1kPtjIM.js`) was running a build **older than `main`** —
`main` already had `fallback={null}` on both cards, but it had never shipped. So the reported
"huge panels" was the *old deployed* behaviour. Shipping this fix also brings prod current.

## App-reference consulted
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md)

## Approach (implemented)
`UpgradeNudge` already has a `compact` variant (slim, one-line, routes to `/gardener`). So:

1. **HeadGardenerCard** (dashboard-only) — `fallback={null}` → `fallback={<UpgradeNudge feature="head_gardener" compact />}`.
2. **AssistantCard** (also on Planner/Shed) — add an opt-in `showUpgradeWhenLocked` prop;
   only the dashboard passes it, so Planner/Shed keep `fallback={null}` (no teaser noise).
   Dashboard: `fallback={<UpgradeNudge feature="ai_insights" compact />}`.
3. **No de-dupe needed** — the duplicate AI Insights only existed on the stale bundle; on
   `main`, `SeasonalPicksCard` already uses `fallback={null}`, so the dashboard surfaces AI
   Insights once (via `AssistantCard`).

Net for Sprout: two slim one-line teasers in place of the full panels — discoverable, not
dominating. (Order left as-is; the strips are short enough not to push content below the fold.)

### Alternatives considered
- **Render nothing** (current `main`) — loses the discoverability the reporter wants.
- **Move strips below the task list** — not needed once they're one line each; revisit if asked.

## Files changed
- `src/components/manager/HeadGardenerCard.tsx` — import `UpgradeNudge`; compact fallback.
- `src/components/AssistantCard.tsx` — `showUpgradeWhenLocked` prop; compact fallback when set.
- `src/App.tsx:1558` — pass `showUpgradeWhenLocked` to the dashboard `AssistantCard`.
- `tests/e2e/specs/dashboard.spec.ts` — DASH-040 / DASH-041 (Sprout sees compact teaser, not the full panel; tier forced via the narrow `subscription_tier` read).

## Docs updated
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md) — tier-by-tier: Sprout sees compact teasers.
- [docs/e2e-test-plan/](../e2e-test-plan/) — dashboard rows DASH-040/041.

## Risks
- `AssistantCard` is shared; the teaser is opt-in so Planner/Shed are unaffected (verified by the prop default `false`).
- Compact teaser links to `/gardener` (UpgradeNudge default) — the plan picker tab.
