# Overhaul tile — under-construction placeholder

## Goal

When a Garden Overhaul plan has no `cover_image_url` yet, the plan tile shows the generic Planner icon — visually identical to a brand-new designed plan with no cover. The user wants a distinct "under construction" placeholder for overhaul plans so it's obvious they're mid-generation or awaiting concept selection.

Also: confirm that picking a concept + clicking Accept already promotes the chosen image to the cover (it does — `selectOverhaulConcept` now updates `plans.cover_image_url` directly).

## App-reference files consulted

- None — this is a presentational tweak to `PlannerDashboard.tsx` only, no schema/RLS/edge-fn changes. There's no app-reference file for the planner yet (already flagged as TODO in the previous task).

## Change

In [`src/components/PlannerDashboard.tsx`](src/components/PlannerDashboard.tsx), replace the cover-image fallback block with a kind-aware variant:

- **Designed plan, no cover** → existing planner icon (unchanged).
- **Overhaul plan, status=Draft, no `ai_blueprint`** → spinner + "Generating overhaul…" (clearly mid-generation).
- **Overhaul plan, status=Draft, has `ai_blueprint`, no cover** → `Construction` icon + "Pick a concept" (waiting on user action).
- **Overhaul plan, status=Failed** → `AlertCircle` + "Generation failed" (clear failure cue).

Icons sourced from `lucide-react` (already imported). Background tinted amber-50/yellow-100 for the construction states so they read as "in progress" at a glance.

## Verification

- The picker writes `plans.cover_image_url` via `selectOverhaulConcept` — confirmed in [`src/services/gardenOverhaulService.ts`](src/services/gardenOverhaulService.ts). When the user backs out of PlanStaging, `fetchPlans()` refires and the tile rerenders with the chosen image.
- No DB or behaviour changes — purely a placeholder swap.

## Steps

1. Add `Construction` to the lucide imports in PlannerDashboard.
2. Replace the cover fallback render with the kind-aware branch.
3. Typecheck.
4. Bump release notes + deploy.
