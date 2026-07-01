# RHO-8 — Garden Walk: "already completed" empty state → "Back to Quick Menu" goes to /quick

**Jira:** RHO-8 · Bug · Medium · Sprout, Pixel Tablet landscape. **Shares a root cause with [RHO-7](RHO-7-garden-walk-return-nav.md).**

## Problem
Re-opening the walk after everything's actioned today shows "Nothing to walk today" with a button
labelled **"Back to Quick Menu"** that navigates to `/quick` (the mobile shortcut, unavailable on
large screens). It should be a plain **"Back"** that returns to where you came from.

## Root cause
Same hardcode family as RHO-7: the empty branch renders "Back to Quick Menu" with
`onClick={() => navigate("/quick")}` at [GardenWalk.tsx:265](../../src/components/walk/GardenWalk.tsx#L265)
(label at :268), and the error branch the same at :239 (label :243). No origin awareness.

## App-reference consulted
- [docs/app-reference/02-dashboard/13-garden-walk.md](../app-reference/02-dashboard/13-garden-walk.md) (Error states table lists "Back to Quick Menu")
- [docs/app-reference/99-cross-cutting/21-routing.md](../app-reference/99-cross-cutting/21-routing.md)

## Recommended fix
Fixed by the RHO-7 origin-preservation change (read `location.state?.from`, default `/quick`).
**Additionally** relabel the empty/error button from "Back to Quick Menu" to **"Back"**
([:243](../../src/components/walk/GardenWalk.tsx#L243), [:268](../../src/components/walk/GardenWalk.tsx#L268))
since the destination is now context-dependent. Implement together with RHO-7 as one change.

## Tests
- E2E: with the walk already complete, open it, assert the button reads "Back" and returns to origin.
- Update the Garden Walk Page Object + `docs/e2e-test-plan/` row (the button label/selector changes).

## Risks
- Label change breaks any existing selector/text assertion for the empty-state button — update in the same task.
