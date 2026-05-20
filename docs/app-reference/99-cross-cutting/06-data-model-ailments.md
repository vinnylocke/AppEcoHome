# Data Model — Ailments, Plant Instance Ailments

> Three concepts: **`ailments`** (catalogue of pests / diseases / invasives), **`plant_instance_ailments`** (instances of an ailment linked to a specific plant), and the optional treatment-blueprint auto-generation via `AutomationEngine`.

---

## Quick Summary

```
ailments (catalogue, per home)
├── ailment_type: "pest" | "disease" | "invasive_plant"
├── name, scientific_name?, source
├── symptoms[], steps[]
├── treatments[] (per stage)
└── archived

plant_instance_ailments (link table)
├── ailment_id, plant_instance_id, home_id
├── status: "active" | "resolved" | "deleted"
├── linked_at, resolved_at
├── photo_url, notes
└── treatment_plan_id? (link to a plan)
```

---

## Role 1 — Technical Reference

### `ailments` columns (subset)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | FK |
| `name` | text | |
| `scientific_name` | text | |
| `ailment_type` | text | pest / disease / invasive_plant |
| `source` | text | manual / perenual / ai |
| `symptoms` | jsonb | Per-stage symptom descriptions |
| `steps` | jsonb | Treatment steps |
| `treatments` | jsonb | Recommended products + frequency |
| `is_archived` | bool | |

### `plant_instance_ailments` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `ailment_id`, `plant_instance_id`, `home_id` | uuid | |
| `status` | text | active / resolved / deleted |
| `linked_at`, `resolved_at` | timestamptz | |
| `photo_url` | text? | Optional evidence |
| `notes` | text? | |
| `treatment_plan_id` | uuid? | Link to a plan |

### `AutomationEngine.createTreatmentBlueprints(...)`

When a user links an ailment to an instance, the engine optionally synthesises treatment blueprints (e.g. spray neem oil every 5 days for 3 weeks). Frequency + duration come from the ailment record.

### Indices

`plant_instance_ailments` is heavily indexed on `(plant_instance_id, status)` and `(home_id, status)` for the watchlist queries.

### Ailment severity computation

The Garden Layout's ailment-severity ring is computed by counting active ailments per area:

```ts
areaAilmentSeverity[area_id] = countActiveByArea(plant_instance_ailments JOIN inventory_items)
```

---

## Role 2 — Expert Gardener's Guide

### Why this model

Ailments are reusable (one "Aphids" record per home), but each instance of an outbreak is linked separately so you have a per-plant history of issues + treatments.

### Workflows

- **Spot a pest:** add to Watchlist (creates `ailments` row) → link to plants (`plant_instance_ailments`) → AutomationEngine creates treatment blueprints.
- **Resolve:** mark active → resolved when the issue clears. History persists.

---

## Related reference files

- [Ailment Watchlist](../03-garden-hub/02-watchlist.md)
- [Link Ailment Modal](../08-modals-and-overlays/14-link-ailment-modal.md)
- [Plant Doctor](../05-tools/02-plant-doctor.md)

## Code references for ongoing maintenance

- `supabase/migrations/*_ailments.sql`
- `supabase/migrations/*_plant_instance_ailments.sql`
- `src/lib/automationEngine.ts`
