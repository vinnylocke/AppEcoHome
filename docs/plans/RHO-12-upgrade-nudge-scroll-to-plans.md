# RHO-12 — Tier-locked banner doesn't scroll to the plans/available tier

**Jira:** RHO-12 · Bug · Medium.

## Problem
Clicking a tier-locked banner takes you to `/gardener` but lands at the top of a long Account tab —
it doesn't scroll down to the plan cards, so it's confusing why you were sent there.

## Root cause
Every locked banner is an `UpgradeNudge` doing `navigate("/gardener")` with no query/hash
([UpgradeNudge.tsx:24](../../src/components/shared/UpgradeNudge.tsx#L24) compact,
[:47](../../src/components/shared/UpgradeNudge.tsx#L47) CTA). `/gardener` → `GardenerProfile` defaults
to the Account tab; the plan cards live far down inside the "Your Plan" section
([GardenerProfile.tsx:1018-1022](../../src/components/GardenerProfile.tsx#L1018-L1022)), which has **no
`id`/anchor** and nothing scrolls to it.

## App-reference consulted
- [docs/app-reference/99-cross-cutting/17-tier-gating.md](../app-reference/99-cross-cutting/17-tier-gating.md)
- [docs/app-reference/02-dashboard/01-dashboard-tab.md](../app-reference/02-dashboard/01-dashboard-tab.md)

## Recommended fix
Mirror the existing `?section=quick-launcher` deep-link pattern
([GardenerProfile.tsx:1432-1443](../../src/components/GardenerProfile.tsx#L1432-L1443) + the
`<div id="quick-launcher-section" />` at :1583):
1. Add `id="plan-section"` to the "Your Plan" `<section>` ([:1019](../../src/components/GardenerProfile.tsx#L1019)).
2. Add a `useEffect`: when `params.get("section") === "plans"`, force the Account tab +
   `document.getElementById("plan-section")?.scrollIntoView({ behavior:"smooth", block:"start" })`, then strip the param.
3. Change `UpgradeNudge`'s two `navigate("/gardener")` calls to `navigate("/gardener?section=plans")`.

Optional (ticket's "ideally"): pass `feature` through and highlight the entitled tier cards
(`tiersWithFeature(feature)` + existing `plan-card-${tier.id}` testids).

## Tests
- E2E: click a locked nudge, assert URL `?section=plans` and the plan section is scrolled into view.

## Risks
- Timeout-based scroll is layout-dependent (copy the existing 350ms pattern); ensure the effect fires even when already on `/gardener`.
