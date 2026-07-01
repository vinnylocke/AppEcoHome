# RHO-7 — Garden Walk: completing the walk goes to /quick (mobile shortcut), not the origin

**Jira:** RHO-7 · Bug · Medium · Sprout, Pixel Tablet landscape. **Shares a root cause with RHO-8.**

## Problem
After completing the walk it navigates to the mobile Quick Access screen (`/quick`), which isn't
a normal destination on a large landscape screen. It should return to where the walk was started
(the dashboard).

## Root cause
`GardenWalk` hardcodes `navigate("/quick")` on every exit —
[GardenWalk.tsx:281](../../src/components/walk/GardenWalk.tsx#L281) (Done), plus :205 (Stop), :239
(error), :265 (empty). The origin is never captured: both launch sites call bare `navigate("/walk")`
with no state — [HomeDashboard.tsx:545](../../src/components/HomeDashboard.tsx#L545) and
[WalkStartTile.tsx:48](../../src/components/walk/WalkStartTile.tsx#L48). So the walk has nothing to
return to and falls back to a fixed `/quick`.

## App-reference consulted
- [docs/app-reference/02-dashboard/13-garden-walk.md](../app-reference/02-dashboard/13-garden-walk.md)
- [docs/app-reference/99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md)

## Recommended fix
Preserve origin. At both launch sites pass `navigate("/walk", { state: { from: <current path> } })`
(dashboard → `/dashboard`, tile → `/quick`). In `GardenWalk`, read `useLocation().state?.from` and
use it as the return target, defaulting to `/quick` only when absent (keeps current mobile
behaviour). Apply to Done (:281), Stop (:205), error (:239), empty (:265). Fixes RHO-8 too.

## Tests
- E2E: start a walk from the dashboard, finish it, assert URL returns to `/dashboard`.

## Risks
- `location.state` lost on hard refresh mid-walk → default to `/quick`/`/dashboard`.
- "Walk again" re-bootstraps in place — must keep the same origin.

## Related
- [RHO-8](RHO-8-garden-walk-back-label.md) — same fix + a button relabel.
