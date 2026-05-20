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
| `ai_blueprint` | jsonb | { project_overview, plants, maintenance_blueprints, ... } |
| `cover_image_url` | text | AI-generated hero |
| `staging_state` | jsonb | Phase progress |
| `created_at`, `updated_at` | timestamptz | |

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

### `ai_blueprint` shape (from `generate-landscape-plan`)

```ts
{
  project_overview: { title, summary, vibe, ... },
  plants: [{ name, scientific_name, count, role, notes, ... }],
  maintenance_blueprints: [{ title, task_type, frequency_days, scope, ... }],
  hero_prompt: string,           // image gen prompt
}
```

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

## Code references for ongoing maintenance

- `supabase/migrations/*_plans.sql`
- `supabase/functions/generate-landscape-plan/index.ts`
- `src/services/planStagingService.ts`
- `src/lib/plannerMemory.ts`
