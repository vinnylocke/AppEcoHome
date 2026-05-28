# Plan — `add_plant_to_plan` agent tool (the deferred A2)

## What I found (and why it was deferred)

A "plan" in Rhozly is not a free-form bag of plants. It's a 5-phase execution engine driven by `plans.ai_blueprint` (jsonb). The plants live in **`ai_blueprint.plant_manifest[]`** — each entry is `{ common_name, scientific_name, quantity, role, aesthetic_reason, horticultural_reason, procurement_advice }`. Phase 2 ("The Shed") maps each manifest entry to an inventory item via `staging_state.plant_mapping` (a `Record<manifestIndex, inventoryItemId | "create">`).

**Crucial discovery:** `PlanStaging.tsx` already has a manual "add a custom plant" flow — `handleSaveNewPlant` ([src/components/PlanStaging.tsx:503](../../src/components/PlanStaging.tsx)). The agent tool just needs to replicate that exact write path server-side, which removes the risk that originally caused the deferral.

The proven manual write does:
1. Build `newPlant = { common_name, scientific_name: "Custom Addition", quantity, role: "Custom Addition", aesthetic_reason: "Manually requested by user.", horticultural_reason: "Manually assigned.", procurement_advice: "Procure locally or search Shed." }`
2. `plant_manifest = [...plant_manifest, newPlant]`
3. `plant_mapping[newIndex] = "create"` (tells Phase 2 to create a fresh inventory item for it)
4. Persist `ai_blueprint` + `staging_state` on the `plans` row.

## App-reference files consulted
- `docs/app-reference/04-planner/02-plan-staging.md` (staging_state + phases)
- `docs/app-reference/99-cross-cutting/05-data-model-plans.md`
- `docs/app-reference/99-cross-cutting/35-agent-tools.md`
- Source: `src/components/PlanStaging.tsx`, `src/lib/overhaulBlueprintAdapter.ts`, `supabase/functions/generate-landscape-plan/index.ts`

## Design decision (resolved)

"Add a plant to a plan" = **append to `ai_blueprint.plant_manifest`** (the plan's plant list), mirroring the manual UI. NOT a planting-task hack, NOT raw staging_state surgery. This is the semantic users expect ("add tomatoes to my spring bed plan") and it's the exact path the manual button already uses.

## The tool

`add_plant_to_plan` — `risk: "confirm"`, `minTier: "botanist"`, lives in `executors/structural.ts`.

**Args:** `plan_id` (required), `common_name` (required), `quantity?` (default 1), `scientific_name?`

**preview:** `Add {quantity}× {common_name} to plan "{plan name}"`

**execute:**
1. Fetch the plan (`ai_blueprint`, `staging_state`, `name`, `status`) scoped to `home_id`.
2. Guard: plan exists; `status !== 'Completed'`; `ai_blueprint.plant_manifest` is an array. If the blueprint isn't a designed/normalised plan (no `plant_manifest`), return a clear message: "This plan doesn't have a plant list to add to — open it in the Planner first." (Avoids the overhaul-blueprint normalisation minefield — the app normalises on load and writes the normalised shape back, so any plan that's been opened has `plant_manifest`.)
3. Build `newPlant` matching the manual shape exactly (scientific_name from arg or "Custom Addition"; role "Custom Addition"; reasons reference the assistant; procurement_advice generic).
4. `updatedManifest = [...plant_manifest, newPlant]`; `newIndex = updatedManifest.length - 1`.
5. `updatedStaging = { ...staging_state, plant_mapping: { ...(staging_state.plant_mapping ?? {}), [newIndex]: "create" } }`.
6. `UPDATE plans SET ai_blueprint = updatedBlueprint, staging_state = updatedStaging WHERE id = plan_id AND home_id = homeId`.
7. Result message adapts: if `staging_state.plants_linked` was already true, append "— open the plan's Shed phase in the Planner to procure it."

**undo:** restore the previous `ai_blueprint` + `staging_state` (snapshot both in `affected_row_refs.previous_state`). Mirrors the existing update-undo pattern.

## Files
- `supabase/functions/agent-chat/tools.ts` — add declaration to `STRUCTURAL_TOOLS`
- `supabase/functions/agent-chat/executors/structural.ts` — add `add_plant_to_plan` executor
- `docs/app-reference/99-cross-cutting/35-agent-tools.md` — document the tool
- `docs/app-reference/04-planner/02-plan-staging.md` — note the agent can append to the manifest

## Risks & mitigations
- **Overhaul-shape blueprints** (`plant_list` instead of `plant_manifest`): guarded — tool requires `plant_manifest` array, returns a helpful message otherwise. Any plan opened in the Planner has already been normalised to `plant_manifest`.
- **Adding post-Phase-2**: matches the manual UI behaviour (mapping="create" reconciles on next Phase 2 run). Result message tells the user to revisit the Shed phase. Not destructive.
- **Concurrent edit**: last-write-wins on the `plans` row, same as the manual flow. Undo restores the pre-tool snapshot.

## Tests
- `npx tsc --noEmit` + `npm run test:unit` (no new unit test needed — executor is Deno-side; covered by typecheck).

## Deploy
- `npm run deploy -- --bump 1` (no migration — reuses `plans` table + agent infra).
