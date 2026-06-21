# Data Model — Plans, Staging State, Phases

> A plan is a multi-step garden project (Spring Veg Bed, Front Border Refresh). Each plan moves through 5 phases tracked in a single `staging_state` jsonb column. AI-generated blueprints provide plant lists + maintenance schedules.

---

## Quick Summary

```
plans
├── name, description
├── status: "Draft" | "In Progress" | "Completed" | "Archived"
├── ai_blueprint: jsonb (Gemini-generated plant list + schedule)
├── cover_image_url
├── staging_state: jsonb {
│     has_started, linked_area_id, plants_linked, plants_assigned,
│     maintenance_active, plant_mapping, ...
│   }
└── (cross-references)
    ├── tasks.plan_id
    ├── task_blueprints.plan_id
    ├── garden_shapes.plan_id
    └── plan_photos.plan_id
```

---

## Role 1 — Technical Reference

### `plans` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | FK |
| `name` | text | |
| `description` | text | |
| `status` | text | Draft / In Progress / Completed / Archived |
| `kind` | text | `'designed'` (NewPlanForm) / `'overhaul'` (photo redesign) / `'plant-first'` (pick plants → AI arranges). `plans_kind_check` constraint. |
| `ai_blueprint` | jsonb | Shape depends on `kind` — see below |
| `cover_image_url` | text | AI-generated hero |
| `staging_state` | jsonb | Phase progress — **only used by `kind='designed'`/`'overhaul'` plans**. Plant-first plans have their own read-only view + one-shot setup and do not use `staging_state`. |
| `created_at`, `updated_at` | timestamptz | |

### `kind` discriminator

| `kind` | Created by | Rendered by | `ai_blueprint` shape |
|--------|-----------|-------------|----------------------|
| `'designed'` | New Plan Form → `generate-landscape-plan` | Plan Staging (5-phase) | `{ project_overview, plants[], maintenance_blueprints[], hero_prompt }` (single plant list) |
| `'overhaul'` | Garden Overhaul → `generate-garden-overhaul` | Plan Staging (5-phase) | landscape-style blueprint + `plan_overhaul_*` side tables |
| `'plant-first'` | Plant-First Planner → `generate-plant-first-plan` | `PlantFirstPlanView` (read-only + "Set up my garden") | **multi-area** `{ project_overview, areas[] }` (distinct from the landscape `plant_manifest` / single `plants[]`) |

### `staging_state` shape

```ts
{
  has_started: boolean,          // Phase 0
  linked_area_id: uuid,          // Phase 1
  plant_mapping: Record<int, uuid>,  // Phase 2 (blueprintPlantIdx → inventoryItemId)
  plants_linked: true,           // Phase 2 done
  plants_assigned: true,         // Phase 3 done
  maintenance_active: true,      // Phase 5 done
}
```

`plan.status` itself encodes Phase 4 done (In Progress / Completed).

### `ai_blueprint` shape — `kind='designed'` (from `generate-landscape-plan`)

```ts
{
  project_overview: { title, summary, vibe, ... },
  plants: [{ name, scientific_name, count, role, notes, ... }],
  maintenance_blueprints: [{ title, task_type, frequency_days, scope, ... }],
  hero_prompt: string,           // image gen prompt
}
```

### `ai_blueprint` shape — `kind='plant-first'` (from `generate-plant-first-plan`)

Multi-area: instead of one flat `plants[]`, the AI splits the chosen plants across area groups. Hardened by `_shared/plantFirstBlueprint.ts` (`normalisePlantFirstBlueprint` — caps 6 areas, drops empty areas, clamps quantities/frequencies).

```ts
{
  project_overview: { title, summary, estimated_difficulty },
  areas: [{
    area_name,
    existing_area_id: uuid | null,   // set when assigned to an existing area
    is_new: boolean,                 // derived from existing_area_id == null
    suggested_sunlight: string | null,
    suggested_medium: string | null,
    pairing_summary: string,         // why these plants are grouped
    plants: [{ common_name, scientific_name|null, quantity, role, companion_note }],
    preparation_tasks: [{ task_index, title, description, depends_on_index|null }],
    maintenance_tasks: [{ title, description, frequency_days, seasonality }],
  }]
}
```

Materialised by `src/services/plantFirstExecution.ts` (`executePlantFirstPlan`): new `areas` rows, `inventory_items` (Unplanted), prep `tasks`, recurring `task_blueprints` — all `plan_id`-linked — then `plans.status = 'In Progress'`.

### `plan_photos` columns

| Column | Type | Notes |
|--------|------|-------|
| `id`, `plan_id`, `home_id` | uuid | |
| `photo_url` | text | |
| `caption` | text? | |
| `created_by` | uuid | FK to user |
| `created_at` | timestamptz | |

### Edge functions

| Function | Purpose |
|----------|---------|
| `generate-landscape-plan` | Gemini call → blueprint + cover image |
| `planStagingService.injectBlueprintTasks` (client) | Phase 4 |
| `planStagingService.activateMaintenanceBlueprints` (client) | Phase 5 |

### Memory integration

`saveMemoryEvent(homeId, planId, event_type, payload)` writes to `planner_memory` (or similar) so future AI suggestions adapt to past plan history.

---

## Role 2 — Expert Gardener's Guide

### Why plans are different from tasks

Tasks are individual chores. Plans are *projects* that group plants + tasks + photos + a vision. Use plans for anything that spans more than a week.

### Phase model

Phase progression is one-way during normal use (you can reset back to Draft). Each phase has a discrete action: pick area → buy plants → place plants → mark in-progress → activate maintenance.

---

## Related reference files

- [Planner Dashboard](../04-planner/01-planner-dashboard.md)
- [Plan Staging](../04-planner/02-plan-staging.md)
- [New Plan Form](../04-planner/04-new-plan-form.md)
- [Garden Overhaul](../04-planner/09-garden-overhaul.md)
- [Plant-First Planner](../04-planner/10-plant-first-planner.md)

## Code references for ongoing maintenance

- `supabase/migrations/*_plans.sql`
- `supabase/migrations/20260818000000_plans_kind_plant_first.sql` — `plans.kind += 'plant-first'`
- `supabase/functions/generate-landscape-plan/index.ts`
- `supabase/functions/generate-plant-first-plan/index.ts`
- `supabase/functions/_shared/plantFirstBlueprint.ts` — plant-first blueprint normaliser
- `src/services/planStagingService.ts`
- `src/services/plantFirstExecution.ts` — plant-first materialisation
- `src/lib/plannerMemory.ts`
