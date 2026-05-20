# Plan Staging

> The 5-phase plan execution engine. Opens when a user taps a plan card on Planner Dashboard. Walks the user from "I picked an area" through "Plant your blueprint" to "Maintenance is now running on autopilot."

**Trigger:** Tap a plan card in `PlannerDashboard`.
**Source files:**
- `src/components/PlanStaging.tsx` — the orchestrator (~1,600 lines)
- `src/services/planStagingService.ts` — `injectBlueprintTasks`, `activateMaintenanceBlueprints`
- `supabase/functions/generate-landscape-plan/index.ts` — initial blueprint AI

---

## Quick Summary

A plan moves through 5 sequential phases. State is persisted in `plans.staging_state` (jsonb). Each phase unlocks the next; once Phase 5 is reached, the plan is in "Maintenance" and feeds the daily task system on autopilot.

| Phase | Goal | Persists |
|-------|------|----------|
| 1. Infrastructure | Link plan to an area (new or existing) | `linked_area_id` |
| 2. The Shed | Add the blueprint's recommended plants to inventory | `plants_linked` |
| 3. Staging | Assign inventory items to specific spots / sub-areas | `plants_assigned` |
| 4. Execution | Mark plan In Progress → schedules go live | `plan.status = "In Progress"` |
| 5. Maintenance | Activate `maintenance_blueprints` (watering, pruning, etc.) | `maintenance_active` |

A blueprint (AI-generated landscape plan) drives Phase 2-5 — it tells the system what plants, where to put them, and what maintenance schedules to spawn.

---

## Role 1 — Technical Reference

### Component graph

```
PlanStaging
├── Header (back, plan name, cover image)
├── PresenceAvatars — multi-user presence
├── Project Overview (from ai_blueprint.project_overview)
├── Hero photo + Regenerate AI button (locked once Phase 1 done)
├── Reference Photos (PlanReferencePhotos sub-component)
├── Phase 1: Infrastructure
│   ├── New area vs existing area picker
│   ├── Location dropdown
│   └── Confirm → writes linked_area_id
├── Phase 2: The Shed
│   ├── List of blueprint.plants
│   ├── Auto-link existing matches via plantMapping
│   └── "Add to Shed" → batch insert / update inventory_items
├── Phase 3: Staging
│   ├── Place each plant on the canvas (display_x_m / display_y_m)
│   └── Confirm → writes plants_assigned
├── Phase 4: Execution
│   ├── Inject blueprint tasks (initial planting tasks)
│   └── Mark plan In Progress
├── Phase 5: Maintenance
│   ├── Activate maintenance_blueprints
│   └── Mark maintenance_active = true
├── Regenerate AI modal (calls generate-landscape-plan again)
├── Trash plan inline option
└── Confirm modals (reset, regen, complete)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `plan` | `Plan` | PlannerDashboard | The row |
| `homeId` | `string` | PlannerDashboard | Scope |
| `onBack` | `() => void` | PlannerDashboard | Close the modal |
| `onPlanUpdated` | `() => void` | PlannerDashboard | Refetch list |

### Local state (key items)

| State | Purpose |
|-------|---------|
| `localBlueprint`, `localCoverImage` | Mirror of `plan.ai_blueprint` / `plan.cover_image_url`, optimistically updated on regen |
| `localStagingState` | Mirror of `plan.staging_state`, optimistically updated on each phase complete |
| `localPlanStatus` | Mirror of `plan.status` |
| `isStarted` | `!!localStagingState.has_started` — gates Phase 1 onwards |
| `locations`, `areas`, `shedPlants` | Lookups for the phase pickers |
| `plantMapping` | `Record<blueprintPlantIndex, inventoryItemId>` — what already-owned plants satisfy the blueprint |
| `selectedForProcurement` | Indexes of plants the user wants to procure |
| `isRegenerating`, `isProcessing` | Action-in-flight flags |
| `showRegenModal`, `regenFeedback` | Regenerate AI flow |

### Persistence model — `plans.staging_state` jsonb

Field by field, populated as phases complete:

```ts
{
  has_started: boolean,           // Phase 0 — user clicked Start
  linked_area_id: uuid,           // Phase 1
  plant_mapping: Record<...>,     // Phase 2 — inventory matches
  plants_linked: true,            // Phase 2 done
  plants_assigned: true,          // Phase 3 done
  maintenance_active: true,       // Phase 5 done
}
```

### Edge functions invoked

| Function | When | Purpose |
|----------|------|---------|
| `generate-landscape-plan` | "Regenerate AI" button | Re-runs Gemini blueprint with optional feedback |

### Data flow — write paths

#### Start
- `setLocalStagingState({ has_started: true })` + persist via plans.update.

#### Phase 1 — Infrastructure
- Insert or pick an `areas` row.
- Optionally insert an initial `area_lux_readings` row if user provides a reading.
- `staging_state.linked_area_id = areaId`.

#### Phase 2 — The Shed
- Match each `blueprint.plants[i]` against existing inventory by name.
- Insert new `inventory_items` for missing plants.
- `staging_state.plant_mapping = {...}`, `plants_linked = true`.

#### Phase 3 — Staging
- For each mapped inventory item, write `display_x_m / display_y_m`.
- `plants_assigned = true`.

#### Phase 4 — Execution
- Call `injectBlueprintTasks({ plan, homeId, areaId, inventoryMapping })` — creates the initial planting/prep tasks.
- Update `plans.status = "In Progress"`.
- `logEvent(PLAN_STARTED)`.

#### Phase 5 — Maintenance
- Call `activateMaintenanceBlueprints({ plan, homeId, ... })` — creates `task_blueprints` rows for ongoing care.
- `staging_state.maintenance_active = true`.

#### Regenerate AI
- `supabase.functions.invoke("generate-landscape-plan", { body: { ... feedback, previousBlueprint }})`.
- On success: update `ai_blueprint`, `cover_image_url`, reset `staging_state = {}`, set `status = "Draft"`.
- Saves a `plannerMemory` event for the regen feedback.

#### Reset to Draft
- Deletes all tasks + task_blueprints with this `plan_id`.
- Updates `plans.status = "Draft"`, clears `staging_state`.

### Memory events (`plannerMemory.saveMemoryEvent`)

Captured for AI personalisation:
- `"accepted_blueprint"` — user moved past Phase 1
- `"regen_feedback"` — user requested a regen with notes
- `"completed_plan"` — Phase 4+ done

### Realtime channels

`PresenceAvatars` opens a presence channel keyed on `plan.id` so other users editing the same plan show up live.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `generate-tasks` | Once maintenance_blueprints are active, daily tasks materialise |

### Tier gating

| Feature | Tier |
|---------|------|
| Plan creation + staging | Every tier |
| AI blueprint generation | Sage / Evergreen (`generate-landscape-plan` is gated server-side) |
| Regenerate AI | Sage / Evergreen |

### Beta gating

None.

### Permissions

- `planner.write` — gates all action buttons.
- `inventory.write` — Phase 2 inventory inserts.
- `tasks.write` — Phase 4 + 5 task / blueprint inserts.

### Error states

| State | Result |
|-------|--------|
| Regen fails | Toast; blueprint unchanged |
| Phase confirm fails | Inline error chip; state not advanced |
| Maintenance activation partial fail | Logs error; user can retry from Phase 5 |

### Performance

- Single fetch of locations/areas/shedPlants on mount.
- Optimistic local state mirrors DB — UI feels instant.
- AI calls happen via edge function with toast loading state.

### Linked storage buckets

| Bucket | Use |
|--------|-----|
| `plan-covers` | `ai_blueprint` hero images |
| `plan-references` | User-uploaded reference photos (sub-component) |

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

When you tapped a plan in the Planner, you opened the *engine* that turns a vague idea ("I want a vegetable bed") into actionable steps. Plan Staging holds your hand through 5 phases: pick a spot, get the right plants, place them, start doing the work, and finally hand the long-term care over to the recurring task system.

This is where the AI blueprint (the project overview, plant list, maintenance schedule that the AI generated when you created the plan) gets turned into reality.

### Every flow on this screen

#### Phase 0 — Start

- The "Start Project" button. Locks in the blueprint and unlocks Phase 1. Until you start, you can still regenerate the AI plan.

#### Phase 1 — Infrastructure

- Pick an area:
  - **New area** → choose a location, name the area, optionally add an initial lux reading.
  - **Existing area** → filter by location, pick from the dropdown.
- Confirm → Phase 1 ticks green; Phase 2 unlocks.

#### Phase 2 — The Shed

- The blueprint listed N plants.
- The app auto-matches plants you already own (by name) and proposes new ones for the rest.
- You can override: "Use this existing seedling instead of buying" or "Add to procurement list".
- Confirm → batch-creates `inventory_items`, marks `plants_linked = true`.

#### Phase 3 — Staging

- Place each plant on the area's canvas. A simple top-down view; drag plant tokens to where they'll live.
- Useful for visualising spacing. Doesn't have to be precise — you can adjust later in the Garden Layout Editor.
- Confirm → `plants_assigned = true`.

#### Phase 4 — Execution

- "Mark In Progress" injects the initial planting tasks (dig hole, water in, mulch, etc.) into your task list.
- Plan status becomes "In Progress" → it shows in the Pending tab with this badge.

#### Phase 5 — Maintenance

- Activate maintenance schedules — these are the *recurring* tasks (water every 3 days, prune every 2 weeks, feed monthly).
- Once activated, you don't need to come back to this plan unless you want to revisit. It runs itself.

#### Regenerate AI (Sage/Evergreen)

- If the blueprint doesn't match what you want, hit Regenerate AI.
- Provide feedback ("Make it lower maintenance" / "Add herbs" / "Less sun-needy plants") and the AI generates a fresh blueprint.
- Only available before Phase 1 is confirmed — otherwise you'd undo work.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Project overview | AI-generated description of what this plan does |
| Plant list | What you'll grow |
| Maintenance schedule | What you'll do recurring |
| Phase pill | Done / In Progress / Locked |
| Cover image | AI-generated render of the finished garden |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | Plans without AI blueprint — manual planning only. Phases still work but no plant list / maintenance schedule pre-populated. |
| Sage / Evergreen | Full AI blueprint + regenerate option. |

### Common mistakes / pitfalls

- **Starting before reading the blueprint.** Once Phase 1 is locked, regenerate is hidden. Read first.
- **Picking an existing area that's already crowded.** Phase 3 lets you place plants, but if there's no space, you'll squeeze them and they won't thrive. Better to make a new area.
- **Skipping Phase 5.** Without maintenance activation, your plan runs out of momentum two weeks after planting. Activate it.
- **Resetting to Draft loses tasks.** The reset purges all tasks + blueprints attached. Make peace with that before tapping.

### Recommended workflows

- **New project:** Start → walk through phases in order → activate maintenance.
- **Re-planning mid-way:** Reset to Draft → Regenerate AI with feedback → re-execute.
- **Returning a season later:** open the plan, check Phase 5 is still active, adjust maintenance frequency if needed.

### What to do if something looks wrong

- **Phase didn't tick off:** check the toast; staging_state write may have failed. Try again.
- **AI button greyed out:** you're not on a Sage/Evergreen tier.
- **Tasks didn't appear after Phase 4:** check `task_blueprints` table — `injectBlueprintTasks` may have partial-failed. Reset Phase 4 and retry.

---

## Related reference files

- [Planner Dashboard](./01-planner-dashboard.md)
- [Plan Reference Photos](./03-plan-reference-photos.md)
- [New Plan Form](./04-new-plan-form.md)
- [Blueprint Manager](./07-blueprint-manager.md)
- [Plans Data Model (cross-cutting)](../99-cross-cutting/05-data-model-plans.md)
- [Plant Providers (cross-cutting)](../99-cross-cutting/25-plant-providers.md)

## Code references for ongoing maintenance

- `src/components/PlanStaging.tsx` — the orchestrator
- `src/services/planStagingService.ts` — phase 4 + 5 task/blueprint injection
- `supabase/functions/generate-landscape-plan/index.ts` — blueprint AI
- `src/lib/plannerMemory.ts` — AI memory event logger
- `src/components/PresenceAvatars.tsx` — multi-user
- `src/components/PlanReferencePhotos.tsx` — reference photo sub-component
- `src/components/WikiPlantCard.tsx` — used inside Phase 2
- `src/events/registry.ts` — `PLAN_STARTED / PLAN_COMPLETED`
