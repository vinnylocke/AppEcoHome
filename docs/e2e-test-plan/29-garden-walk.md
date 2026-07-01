# 29. Garden Walk

**Spec file:** `tests/e2e/specs/garden-walk.spec.ts`
**Page Object:** `tests/e2e/pages/GardenWalkPage.ts`
**Seed dependencies:** `02_plants_shed.sql` (the dashboard walk launcher needs ≥ 5 plants; the walk list itself needs non-archived plants assigned to outdoor areas)
**App-reference:** [02-dashboard/13-garden-walk.md](../app-reference/02-dashboard/13-garden-walk.md)

Covers the Garden Walk (`/walk`) focus-mode flow — launched from the Dashboard launcher (`dash-garden-walk`) or the Quick Access tile (`quick-tile-walk`). Regression coverage for the RHO-6/7/8 batch.

Because the walk list depends on seed state (plants assigned to outdoor areas), the navigation tests handle **both** the "walking" (`walk-card`) and "empty" (`garden-walk-empty`) branches, and the Snap-scroll test self-skips when no walkable plant is present.

Key selectors: `dash-garden-walk`, `quick-tile-walk`, `walk-card`, `walk-card-stop`, `walk-action-snap`, `walk-snap-sheet`, `walk-snap-sheet-body`, `walk-note-sheet-body`, `garden-walk-empty-back`, `garden-walk-error-back`.

## Return navigation (RHO-7 / RHO-8)

The walk returns to the surface it was launched from (`navigate("/walk", { state: { from } })`), defaulting to `/quick` when origin is absent. The empty/error exit button was relabelled from "Back to Quick Menu" to **"Back"**.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WALK-001 | ✅ | Launched from the dashboard, the walk returns to `/dashboard` on exit (Stop→Done, or empty→Back) — not `/quick` | — | ✅ Passing |
| WALK-002 | ✅ | The empty-state exit button reads "Back", not "Back to Quick Menu" | — | ✅ Passing (asserts only on the empty branch) |

## Snap sheet scroll & focus (RHO-6)

Opening the Snap sheet scrolls its own `overflow-y-auto` body (`walk-snap-sheet-body`) into view and moves focus inside the newly-mounted section (respects `prefers-reduced-motion`).

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| WALK-010 | ✅ | Opening the Snap sheet brings its scroll body into view (top within viewport) | — | ✅ Passing (self-skips if no walkable plant in the seed state) |
