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
| `home_id` | uuid (nullable) | FK. NULL for global rows (Perenual API + global AI catalogue). |
| `source` | text | constraint allows manual / api / ai / verdantly |
| `common_name` | text | |
| `scientific_name` | jsonb (array) | |
| `perenual_id`, `verdantly_id` | int / text | Provider ids |
| `sunlight` | jsonb (array) | |
| `watering`, `cycle`, `medium`, `hardiness` | text/jsonb | |
| `data` | jsonb | Provider full payload (legacy) |
| `default_image` | text | URL |
| `is_archived` | bool | |
| **AI catalogue columns** (Wave 1 of AI Plant Overhaul — `20260620000000`): | | |
| `scientific_name_key` | text (GENERATED) | Auto-computed lowercased + whitespace-collapsed first scientific name. Dedup key for AI globals + home forks. |
| `care_guide_data` | jsonb | AI-generated structured care guide. Replaces the legacy 30-day TTL string cache. See `CARE_GUIDE_SCHEMA` in `supabase/functions/plant-doctor/index.ts`. Key shape: `{ plantData: { common_name, scientific_name[], description, plant_type, cycle, care_level, growth_rate, watering_min_days, watering_max_days, sunlight[], flowering_season[] ∈ [Spring/Summer/Autumn/Winter], harvest_season[] ∈ same, pruning_month[] ∈ [Jan-Dec abbrev], propagation[], attracts[], is_toxic_pets, is_toxic_humans, indoor, is_edible, ... } }`. The `flowering_season`/`harvest_season`/`pruning_month` enums are enforced server-side via Gemini's `enum` schema constraint — see [AI — Gemini](./13-ai-gemini.md#structured-output). |
| `updated_care_fields` | jsonb (array) | Field names that changed in the most recent stale-check regeneration. Drives the per-field highlight. |
| `freshness_version` | int | Bumps each time `care_guide_data` changes. Compared against `user_plant_ack.seen_freshness_version` to decide whether to show the "Updated" chip. Default 1. |
| `last_freshness_check_at` | timestamptz | 90-day stale-check window driver and the cron's idempotency lock. NULL → row is eligible for the next run. The `refresh-stale-ai-plants` cron (Wave 4) updates this ONLY after the per-plant work succeeds — if Gemini throws or the plant update fails, the row's `last_freshness_check_at` stays put and the next run re-tries it. |
| `last_care_generated_at` | timestamptz | When the care guide was actually re-generated (vs. just verified unchanged). Shown to user as "Care guide refreshed N days ago". Wave 4 backfill seeded this from `created_at` for existing global AI rows so the cron has a sensible age baseline. |
| `forked_from_plant_id` | int (FK → plants.id) | For home-scoped AI forks: the global parent. NULL on globals. `ON DELETE SET NULL`. As of Wave 3, also set on **shallow forks** — home-scoped AI rows created by the bulk-add flow where the catalogue already had a global row. Shallow forks have `forked_from_plant_id != NULL` AND `overridden_fields = []`. Wave 4+ may collapse them. |
| `overridden_fields` | jsonb (array) | For home-scoped AI forks: field names the user explicitly changed. Drives "Overridden" badges. Empty array (`[]`) on shallow forks (Wave 3 + later). |

### `plants_source_check` constraint

```sql
CHECK (source IN ('manual', 'api', 'ai', 'verdantly'))
```

This constraint required a migration when 'ai' was added — historical reference saved in memory.

### AI catalogue dedup indexes (Wave 1)

```sql
-- Global: at most one AI row per species (no overrides).
plants_ai_global_dedup_idx (scientific_name_key)
  WHERE source = 'ai' AND home_id IS NULL AND scientific_name_key IS NOT NULL;

-- Per-home fork: at most one fork per (home, species).
plants_ai_home_fork_dedup_idx (home_id, scientific_name_key)
  WHERE source = 'ai' AND home_id IS NOT NULL AND scientific_name_key IS NOT NULL;

-- Stale-check cron's primary scan.
plants_ai_global_stale_idx (last_freshness_check_at NULLS FIRST)
  WHERE source = 'ai' AND home_id IS NULL;

-- Reset / orphan-repair lookup.
plants_forked_from_idx (forked_from_plant_id)
  WHERE forked_from_plant_id IS NOT NULL;
```

### New tables introduced by Wave 1 of AI Plant Overhaul

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `plant_care_revisions` | Append-only audit trail of every AI care-guide change. One row per `(plant_id, version)`. | `plant_id`, `version`, `source` (`initial`/`stale_check`/`manual_refresh`/`backfill`), `care_guide_data`, `changed_fields`, `diff_summary`, `triggered_by` |
| `user_plant_ack` | Per-user, per-plant "I've seen version N" tracking. Drives the "Updated" chip. | PK `(user_id, plant_id)`, `seen_freshness_version`, `acked_at`. **Important (Wave 5):** `plant_id` always references the GLOBAL AI plant row (`home_id IS NULL`), even when the user only has a home-scoped shallow fork in their shed. `useAiPlantFreshness` resolves `forked_from_plant_id → global_id` before reading or writing this table, so the same user with the same global in multiple homes sees consistent ack state. |
| `ai_plant_manual_refresh_log` | One row per Sage+ user-triggered manual refresh. Drives the 7-day rate limit. | `user_id`, `plant_id`, `refreshed_at` |

See [AI Plant Catalogue](./33-ai-plant-catalogue.md) for the full lifecycle (planned doc, Wave 9).

### RPCs introduced by Wave 1 + Wave 6 of AI Plant Overhaul

| RPC | Purpose | Called from |
|-----|---------|-------------|
| `fork_ai_plant_for_home(plant_id, home_id, edits, overridden_fields)` | Atomic detach-and-fork: inserts home-scoped fork row, repoints inventory_items, seeds user_plant_ack. `SECURITY DEFINER`. | **Not called by Wave 6's flow** — Wave 3's bulk-add already creates a home-scoped row at catalogue-add time, so the modal flips the existing row in-place via `overridden_fields` instead. Kept for the post-D3 world where Inventory references the global directly. |
| `reset_ai_plant_fork(fork_id)` | Repoints inventory_items back to global parent, seeds acks at the parent's current version, deletes the fork. `SECURITY DEFINER`. | **Not called by Wave 6's flow** — deletion would make the plant vanish from TheShed (D3 not done yet). Kept for the post-D3 world. |
| `revert_ai_plant_fork_in_place(fork_id)` | **Wave 6.** In-place revert: restores `care_guide_data` + editable top-level columns from the global parent, clears `overridden_fields`, syncs `freshness_version` + seeds `user_plant_ack`. Row stays in TheShed, rejoins auto-updates. `SECURITY DEFINER`. | "Reset to catalogue" button in Plant Edit Modal. |

### AI plant lifecycle (Wave 6)

1. **Add from catalogue** (Wave 3): bulk-add creates a home-scoped row with `forked_from_plant_id = global_id`, `overridden_fields = []`. The row is a *shallow fork* — catalogue-tracking.
2. **Cron updates the global** (Wave 4): bumps `freshness_version` on the global if Gemini's regenerated guide differs. Home rows are not touched.
3. **User sees the chip** (Wave 5): `useAiPlantFreshness` resolves the shallow fork's freshness via the global's version, compares against `user_plant_ack.seen_freshness_version`.
4. **User edits a care field** (Wave 6): `<DetachConfirmModal>` warns; on confirm, the home row's `overridden_fields` is populated with the changed field names. Now a *custom fork* — opted out of auto-updates.
5. **User resets** (Wave 6): `revert_ai_plant_fork_in_place` restores the row from the parent. Now back to shallow fork.

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
