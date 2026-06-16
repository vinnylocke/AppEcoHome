# Data Model — Locations, Areas, Layouts, Shapes

> The spatial hierarchy: a home contains locations (e.g. "Back Garden", "Allotment Plot 12"); each location contains areas (raised bed, container, lawn strip); each area can be linked to a shape in a garden layout for visual mapping + microclimate analysis.

---

## Quick Summary

```
homes (1)
└── locations (N)
    └── areas (N)
        ├── linked to → garden_shapes (in a garden_layouts row)
        ├── area_lux_readings (history)
        ├── area_moisture_readings (Phase 2, 2026-06-16)
        ├── area_temp_readings (Phase 2, 2026-06-16)
        ├── area_ec_readings (Phase 2, 2026-06-16)
        ├── latest_soil_{moisture_pct,temp_c,ec,ec_source}_{recorded_at}
        │   (denormalised hot-path read columns, kept in sync by triggers)
        └── (used by) inventory_items.area_id, tasks.area_id, devices.area_id, ...

garden_layouts (N per home)
└── garden_shapes (N)
    ├── shape_type (rect / polygon / circle / line)
    ├── geometry columns (x_m, y_m, width_m, height_m, radius_m, points)
    ├── area_id? (link to a real area)
    ├── plan_id? (filter by plan)
    └── style (color, dashed, extrude_m, preset_id)
```

---

## Role 1 — Technical Reference

### `locations` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | FK |
| `name` | text | |
| `description` | text | |
| `is_outdoor` | bool | |
| `created_at` | timestamptz | |

### `areas` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | FK (denormalised for RLS speed) |
| `location_id` | uuid | FK |
| `name` | text | |
| `area_type` | text | bed / pot / lawn / container / etc. |
| `light_intensity_lux` | int | Latest reading |
| `ph` | float8 | |
| `soil_moisture_pct` | float8 | |
| `water_movement` | text | well-drained / low-drained / etc. |
| `growing_medium` | text | |
| `nutrient_source` | text | |

### `area_lux_readings` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id`, `area_id` | uuid | |
| `lux_value` | int | |
| `recorded_at` | timestamptz | |
| `source` | text | "sensor" / "manual" / "ai" |

### `garden_layouts` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | FK |
| `name` | text | |
| `canvas_w_m`, `canvas_h_m` | float8 | Canvas dimensions in metres |
| `north_offset_deg` | float8 | Override home's north_offset |
| `created_at`, `updated_at` | timestamptz | |

### `garden_shapes` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `layout_id` | uuid | FK |
| `area_id` | uuid? | FK (optional — for area-linked shapes) |
| `plan_id` | uuid? | FK (planner integration) |
| `shape_type` | text | "rect" / "polygon" / "circle" / "line" |
| `preset_id` | text? | e.g. "raised-bed", "fence-panel", "tree" |
| `label` | text | Display label |
| `color` | text | Hex |
| `x_m`, `y_m` | float8 | Position |
| `width_m`, `height_m`, `radius_m`, `points` | float8 / jsonb | Geometry (per shape_type) |
| `rotation` | float8 | Degrees |
| `z_index` | int | Stacking order |
| `dashed` | bool | Boundary style |
| `extrude_m` | float8 | 3D height |

### Cross-references

- `inventory_items.area_id` ties plants to areas.
- `tasks.location_id` / `tasks.area_id` scope tasks.
- `task_blueprints.scope` may use either.
- Shape→area linkage drives Area Details and microclimate computations.

### `sync-areas-to-shapes` cron

Mirrors `areas.name` / metrics to linked shape labels so the editor stays consistent without manual updates.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

The Location → Area hierarchy is Rhozly's mental model. Locations are broad ("Back Garden", "Greenhouse"); Areas are specific ("Tomato Bed", "Herb Spiral"). The data graph follows: everything attaches to an area, which sits inside a location, which sits inside a home.

Layouts overlay onto this with visual shapes — each shape can be linked to an area to inherit metrics. This is what powers the Garden Layout Editor's overlays (sun, lux, frost) and the 3D view.

### Recommended workflows

- **Always link shapes to areas.** Otherwise the data graph is just decoration.
- **Use locations sparingly.** Front Garden / Back Garden / Allotment is usually enough; don't over-fragment.

---

## Related reference files

- [Location Manager](../03-garden-hub/03-location-manager.md)
- [Garden Layout Editor](../03-garden-hub/06-garden-layout-editor.md)
- [Area Details](../03-garden-hub/04-area-details.md)
- [Sun Analysis](./28-sun-analysis.md)

## Code references for ongoing maintenance

- `supabase/migrations/*_locations.sql`, `*_areas.sql`, `*_garden_layouts.sql`, `*_garden_shapes.sql`
- `supabase/functions/sync-areas-to-shapes/index.ts`
