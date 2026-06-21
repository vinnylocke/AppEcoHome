# Plant-first planner — "bring the plants, AI arranges them"

## Goal

A new planner flow where the user **picks the plants first** (from their Shed and/or by
searching library / API / AI), then AI produces a plan: **how many areas** to split them
across, **which plants pair well together** (companions), and the **maintenance tasks** for
each group. This is the inverse of today's planner, which starts from an aesthetic/area and
*generates* the plants.

## App-reference consulted

- `docs/app-reference/04-planner/01-planner-dashboard.md`, `02-plan-staging.md`, `04-new-plan-form.md`
- `docs/app-reference/99-cross-cutting/05-data-model-plans.md` (plans, `ai_blueprint`, `staging_state`, `kind`)
- `docs/app-reference/99-cross-cutting/01-data-model-home.md` (areas + conditions)
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` (blueprints → tasks)
- `docs/app-reference/99-cross-cutting/25-plant-providers.md`, `08-modals-and-overlays/11-companion-plants-tab.md`
- `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md`, `13-ai-gemini.md`, `17-tier-gating.md`

## What we REUSE (don't rebuild)

- **Multi-select plant picker** — `<PlantSearch multiSelect isSelected=…>` already spans
  library + API (Perenual/Verdantly) + AI create; `BulkSearchModal` is the working cart
  pattern. We add a **"From your Shed"** source (query `inventory_items`) alongside it.
- **Companion data** — `companion-planting` edge fn (Verdantly→Gemini, cached in
  `companion_cache`) for the pairing reasoning.
- **Plan model** — `plans` row with `kind='plant-first'`, blueprint in `ai_blueprint`,
  progress in `staging_state`. `plan_id` on tasks/blueprints.
- **Task pipeline** — `planStagingService.injectBlueprintTasks()` (prep + planting tasks) and
  `activateMaintenanceBlueprints()` (recurring `task_blueprints`) work once a blueprint exists.
- **AI plumbing + gating** — `callGeminiCascade`, `logAiUsage`, `guardAiByHome`,
  `enforceRateLimit` (Sage+ pattern, mirroring `generate-landscape-plan`).

## What's NEW

### 1. Plant-first wizard — `src/components/planner/PlantFirstPlanForm.tsx`

Launched from a new **"Plan around my plants"** entry on `PlannerDashboard` (beside Design a
Plan / Overhaul). Steps:
1. **Pick plants** — multi-select from Shed + search (library/API/AI), building a chosen list.
2. **Goal + constraints** (light) — plan name, optional notes ("sunny patio + shady corner",
   appetite for maintenance), and an **Areas mode** selector (the user's choice):
   - **Use my existing areas only** — distribute across areas they already have.
   - **Use existing + suggest new** — fit existing where they work, propose new for the rest.
   - **Design all-new areas** — ignore current areas, lay out from scratch.
3. **Generate → Review** — shows the AI plan: the area groups, each group's plants with a
   one-line *why they pair*, and the maintenance tasks. **Create Plan** saves it as a Draft.

### 2. New edge function — `supabase/functions/generate-plant-first-plan`

Input `{ homeId, plants: [{ name, scientific_name?, source, inventory_item_id? }], notes?,
areaMode: 'existing' | 'existing_plus_new' | 'new' }`.
Gathers the home's **existing areas + conditions** (sun, medium, pH, indoor/outdoor) — passed
to the model only for `existing` / `existing_plus_new` — and an optional companion lookup,
then asks Gemini (persona-aware) for a **multi-area** blueprint. Per `areaMode`: `existing`
forces every group onto an `existing_area_id`; `new` omits them all; `existing_plus_new`
mixes. If `existing` is chosen but there are no areas, fall back to `new` with a notice.

```ts
{
  project_overview: { title, summary },
  areas: [{
    area_name,                       // maps to an existing area OR a proposed new one
    existing_area_id?: string,       // set when it fits an area they already have
    conditions: { sunlight, medium },
    plants: [{ name, scientific_name, count, role, companion_note }],
    pairing_summary,                 // why these plants group well
    maintenance_tasks: [{ title, task_type, frequency_days, seasonality }]
  }]
}
```

Server validates/normalises (cap areas, dedupe plants, clamp frequencies). Sage+ gated,
rate-limited, `logAiUsage` with the full context/prompt/result.

### 3. Multi-area blueprint + staging

The existing `staging_state.linked_area_id` is single-area. The plant-first blueprint is
multi-area, so per-area progress is tracked as `staging_state.area_progress: Record<areaIdx,
{ linked_area_id, plants_linked, maintenance_active }>`. Execution reuses the existing helpers
**per area group** (link/create area → add its plants to Shed → activate its maintenance
blueprints). No new task logic — just looped over groups.

### 4. Regenerate-with-feedback (reused planner pattern)

Like the landscape planner, the review step can **regenerate** a rejected plan: the user
gives a reason, and the function re-runs with `{ isRegeneration: true, feedback,
previousBlueprint }` — injecting a strict "apply this feedback, don't repeat the rejected
plan" block. The feedback is ALSO mined for structured preferences (shared
`extractPreferencesFromFeedback` in `_shared/preferences.ts`, lifted out of landscape-plan)
and saved to `planner_preferences`, so it grounds **future** plans + other AI too.

## Tier gating

Sage+ (consistent with `generate-landscape-plan`): `guardAiByUser` (`ai_enabled`) + a
`generate-plant-first-plan` entry in `_shared/rateLimit.ts` (`{ sprout:0, botanist:0, sage:8,
evergreen:15 }`). Easily amendable.

## Status (backend landed)

Done + tested: migration (`plans.kind` += `'plant-first'`), rate-limit entry, the
`generate-plant-first-plan` edge fn (full `buildUserContext` grounding + AI-feedback signals +
persona + areaMode + regenerate + preference persistence + `logAiUsage` with context/prompt/
result + **cost**), the shared `plantFirstBlueprint` normaliser, and 6 Deno tests. Remaining:
the wizard, the multi-area execution, the plant-first plan view, and docs/e2e.

## Tests

- Unit (Vitest): a pure normaliser for the blueprint (cap/dedupe/clamp) in `src/lib/`.
- Deno: prompt builder + response parser for `generate-plant-first-plan` (schema, area cap,
  bad-shape salvage) — mirrors `landscapePlan`/`areaAnalysisPrompt` tests.
- E2E: new spec — open wizard, select 2 plants, mock the edge fn, assert the review renders
  area groups + a Create Plan writes a `kind='plant-first'` plan.

## Docs

- New `docs/app-reference/04-planner/` reference file for the plant-first form + a note on
  `02-plan-staging.md` (multi-area progress). Catalogue + cron/gating refs for the new fn.
- `TESTING.md` + `docs/e2e-test-plan/` planner surface.

## Decisions (confirmed)

1. **Areas** — a **user choice** in the wizard (`areaMode`): existing-only / existing+new /
   all-new. The edge fn honours it.
2. **Scope** — **full end-to-end**: generate the plan AND wire execution across every area
   group (create/link areas, add plants to the Shed, generate prep + maintenance tasks),
   reusing `injectBlueprintTasks` / `activateMaintenanceBlueprints` looped per group.
3. **Tier** — **Sage+** (matches `generate-landscape-plan`).

## Build order

1. Migration: `plants.kind` already supports a new value — add `'plant-first'`; extend
   `staging_state` with `area_progress` (no schema change — it's jsonb). Add the new fn to
   `supabase/config.toml`.
2. Edge fn `generate-plant-first-plan` (+ Deno tests for the prompt/parser).
3. Blueprint normaliser in `src/lib/` (+ Vitest).
4. `PlantFirstPlanForm` wizard (reusing `PlantSearch multiSelect` + a Shed source) +
   PlannerDashboard entry.
5. Multi-area execution: loop the existing staging helpers per area group.
6. Docs (app-reference planner + catalogue/gating) + e2e spec + TESTING.md.
