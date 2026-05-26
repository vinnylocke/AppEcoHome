# Overhaul regenerate — live progress in PlanStaging

## Problem

When the user regenerates an overhaul from inside PlanStaging:

1. The blocking loader shows for a few seconds while the edge fn is invoked (returns 202 fast).
2. Loader hides → Pre-Start Review still shows → `OverhaulConceptPicker` still has the **old concepts in its local state** so nothing visually changes.
3. User has no idea anything is happening. They back out to the planner tiles, see the "Pick a concept" placeholder, re-click → PlanStaging re-mounts fresh and *now* shows "Drafting your overhaul…".

Two issues:

- **A.** After regen, the picker doesn't refetch / show the "generating" state.
- **B.** Even when the new blueprint lands, `OverhaulGeneratingState`'s poll only calls `onPlanReady` (which is `fetchPlans` from the parent) — that refreshes the planner's *list* but doesn't update `selectedPlan` in PlannerDashboard, so PlanStaging's view of the plan never updates without a back-out.

## Fix

Both issues collapse into the same fix:

1. **In `handleRegeneratePlan` (overhaul branch)** — also `setLocalBlueprint(null)` and clear `ai_blueprint` in the client-side DB update. This drops PlanStaging into the `OverhaulGeneratingState` branch immediately after regen, giving the user the "Drafting your overhaul…" loader they already see for fresh generations.

2. **In `OverhaulGeneratingState`** — change `onPlanReady` to receive the full plan row. PlanStaging implements it to re-hydrate `localBlueprint`, `localCoverImage`, `localStagingState`, `localPlanStatus` from the fresh row, so the staging view transitions back to the populated picker with the new concepts the moment they're ready — no back-out needed.

3. Race-safety: the client-side update now clears `ai_blueprint` *before* the poll starts, so the next non-null read is guaranteed to be the freshly-regenerated blueprint, not the stale one being overwritten by the edge fn.

## Files

- `src/components/PlanStaging.tsx` — modify `handleRegeneratePlan` (overhaul branch) and the `OverhaulGeneratingState` component + its caller.

## Steps

1. Add `ai_blueprint: null` + `setLocalBlueprint(null)` to the regen reset.
2. Change `OverhaulGeneratingState` to fetch `*` (full row) and call `onPlanReady(planRow)`.
3. Implement `onPlanReady` in the caller to rehydrate local state.
4. Typecheck. Bump release notes. Deploy.
