# Data Model — Plants, Inventory Items, Sources

> Two layers: `plants` is the species record (one row per "tomato" the user has); `inventory_items` is per-instance (this specific tomato in this specific area). Provider tracked via `plants.source`.

---

## Quick Summary

```
plants (species)
├── source: "manual" | "api" | "ai" | "verdantly"
├── common_name + scientific_name[]
├── perenual_id | verdantly_id
├── sunlight[], watering, cycle, hardiness, etc.
└── ──► inventory_items (instances, N per species)
        ├── area_id, location_id
        ├── growth_state, planted_date, quantity
        ├── status: "In Shed" | "Planted" | "Archived" | ...
        ├── display_x_m, display_y_m, display_size_m, display_height_m (Garden Layout)
        ├── sprite_url (Visualiser)
        └── cover_image_url
```

---

## Role 1 — Technical Reference

### `plants` columns (subset)

| Column | Type | Notes |
|--------|------|-------|
| `id` | int (auto) | PK |
| `home_id` | uuid | FK |
| `source` | text | constraint allows manual / api / ai / verdantly |
| `common_name` | text | |
| `scientific_name` | text[] | |
| `perenual_id`, `verdantly_id` | int / text | Provider ids |
| `sunlight` | text[] | |
| `watering`, `cycle`, `medium`, `hardiness` | text/jsonb | |
| `data` | jsonb | Provider full payload (legacy) |
| `default_image` | text | URL |
| `is_archived` | bool | |

### `plants_source_check` constraint

```sql
CHECK (source IN ('manual', 'api', 'ai', 'verdantly'))
```

This constraint required a migration when 'ai' was added — historical reference saved in memory.

### `inventory_items` columns (subset)

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id`, `plant_id` | FK | |
| `location_id`, `area_id` | uuid | Spatial binding |
| `identifier` | text | "Tomato #3" |
| `plant_name` | text | Denormalised for fast filters |
| `status` | text | In Shed / Planted / Harvested / Archived / etc. |
| `growth_state` | text | seedling / vegetative / flowering / etc. |
| `is_established` | bool | |
| `quantity` | int | |
| `planted_date` | date | |
| `propagation_method` | text | |
| `cover_image_url` | text | Pinned from PhotoTimeline |
| `sprite_url` | text | Plant Visualiser |
| `display_x_m`, `display_y_m` | float8 | Plant token position |
| `display_size_m`, `display_height_m` | float8 | Token sizing |

### Source semantics

| Source | Meaning |
|--------|---------|
| `manual` | User-typed; no provider |
| `api` | Perenual |
| `verdantly` | Verdantly DB |
| `ai` | Rhozly AI (PlantDoctorService.generateCareGuide) |

### Helpers

- `careGuideToPlantDetails(aiData, name)` — normalises AI care guide → unified `PlantDetails`.
- `getProviderPlantDetails({ source, perenual_id?, verdantly_id? })` — unified fetch.
- `searchAllProviders(query, filters, gates)` — parallel multi-provider search.

---

## Role 2 — Expert Gardener's Guide

### Why two layers

A species record + per-instance records lets you say "I have 4 Brandywine tomato plants" and track each one separately (growth state, planted date, photos, journal) while sharing the species-level care defaults.

### Common workflows

- **Add to Shed:** creates a `plants` row (or reuses existing) + an `inventory_items` row.
- **Assign:** sets `inventory_items.area_id`, `growth_state`, etc.
- **Promote to layout:** sets `display_x_m` / `display_y_m` so the plant appears as a token in the editor.

---

## Related reference files

- [The Shed](../03-garden-hub/01-the-shed.md)
- [Plant Edit Modal](../08-modals-and-overlays/06-plant-edit-modal.md)
- [Instance Edit Modal](../08-modals-and-overlays/08-instance-edit-modal.md)
- [Plant Providers](./25-plant-providers.md)

## Code references for ongoing maintenance

- `supabase/migrations/*_plants.sql`, `*_inventory_items.sql`
- `src/lib/plantProvider.ts`
- `src/services/plantDoctorService.ts`
