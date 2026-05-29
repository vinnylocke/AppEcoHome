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

**Species-keyed catalogue vs common-name library variants.** The global AI catalogue holds **one row per species** (the index above). `plant_library`, by contrast, has many common-name variants per species ("Tomato", "Beefsteak Tomato", "Cherry Tomato" are all *Solanum lycopersicum*). When `ensureCataloguePlantFromLibrary` clones a selected library row and the species is **already catalogued under a different common name**, it does **not** create a second global row (the unique index forbids it) and does **not** adopt the catalogued variant's name — it reuses the existing catalogue `plantId` for the species-level tabs (Grow Guide / Companions / Light) while **presenting the selected library row's own identity + care data**. This is why tapping library "Tomato" shows "Tomato" even when "Beefsteak Tomato" already owns the species' catalogue slot. See `src/lib/plantCatalogue.ts` → `ensureCataloguePlantFromLibrary`.

### New tables introduced by Wave 1 of AI Plant Overhaul

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `plant_care_revisions` | Append-only audit trail of every AI care-guide change. One row per `(plant_id, version)`. | `plant_id`, `version`, `source` (`initial`/`stale_check`/`manual_refresh`/`backfill`), `care_guide_data`, `changed_fields`, `diff_summary`, `triggered_by` |
| `user_plant_ack` | Per-user, per-plant "I've seen version N" tracking. Drives the "Updated" chip. | PK `(user_id, plant_id)`, `seen_freshness_version`, `acked_at`. **Important (Wave 5):** `plant_id` always references the GLOBAL AI plant row (`home_id IS NULL`), even when the user only has a home-scoped shallow fork in their shed. `useAiPlantFreshness` resolves `forked_from_plant_id → global_id` before reading or writing this table, so the same user with the same global in multiple homes sees consistent ack state. |
| `ai_plant_manual_refresh_log` | One row per Sage+ user-triggered manual refresh. Drives the 7-day rate limit. | `user_id`, `plant_id`, `refreshed_at` |
| `plant_grow_guides` | **Grow Guides feature.** 1:1 with `plants.id`. Catalogue-level comprehensive 9-section AI guide. RLS: authenticated SELECT, service-role writes only. Refreshed via `refresh-stale-grow-guides` cron (90-day TTL) + on-demand via the `generate_grow_guide` edge fn action. See [Grow Guide Tab](../08-modals-and-overlays/36-grow-guide-tab.md). | PK `plant_id`, `guide_data` jsonb (envelope: `{schema_version, generated_at, sections[]}`), `schema_version`, `freshness_version`, `last_generated_at`, `last_freshness_check_at`, `updated_fields` |

See [AI Plant Catalogue](./33-ai-plant-catalogue.md) for the full lifecycle (planned doc, Wave 9).

### RPCs introduced by Wave 1 + Wave 6 of AI Plant Overhaul

| RPC | Purpose | Called from |
|-----|---------|-------------|
| `fork_ai_plant_for_home(plant_id, home_id, edits, overridden_fields)` | Atomic detach-and-fork: inserts home-scoped fork row, repoints inventory_items, seeds user_plant_ack. `SECURITY DEFINER`. | **Not called by Wave 6's flow** — Wave 3's bulk-add already creates a home-scoped row at catalogue-add time, so the modal flips the existing row in-place via `overridden_fields` instead. Kept for the post-D3 world where Inventory references the global directly. |
| `reset_ai_plant_fork(fork_id)` | Repoints inventory_items back to global parent, seeds acks at the parent's current version, deletes the fork. `SECURITY DEFINER`. | **Not called by Wave 6's flow** — deletion would make the plant vanish from TheShed (D3 not done yet). Kept for the post-D3 world. |
| `revert_ai_plant_fork_in_place(fork_id)` | **Wave 6.** In-place revert: restores `care_guide_data` + editable top-level columns from the global parent, clears `overridden_fields`, syncs `freshness_version` + seeds `user_plant_ack`. Row stays in TheShed, rejoins auto-updates. `SECURITY DEFINER`. | **"Revert" button** in Plant Edit Modal Care tab (post-Wave-7 UX rename — was "Reset to catalogue"). |

### AI plant lifecycle

> User-facing UI never says "catalogue", "fork" or "linked". All of these internal terms are mapped to the simpler "AI plant whose care guide auto-updates" and "AI plant you've edited" in the UI. See [Plant Edit Modal](../08-modals-and-overlays/06-plant-edit-modal.md#ai-editing-flow) for the user copy.

1. **Add an AI plant.** Bulk-add (or PlantSearchModal single-add) creates a home-scoped row with `forked_from_plant_id = global_id`, `overridden_fields = []`. The user sees an **"AI"** chip on the row.
2. **Cron updates the global.** Wave 4's `refresh-stale-ai-plants` bumps the global's `freshness_version` if Gemini's regenerated guide differs. Home rows are not touched.
3. **User sees the freshness chip.** `useAiPlantFreshness` resolves home-scoped rows to their global via `forked_from_plant_id`, compares against `user_plant_ack.seen_freshness_version`. Yellow "N fields updated" chip appears on the Shed card + Plant Edit Modal callout when behind.
4. **User clicks Refresh.** Calls `manual-refresh-ai-plant` against the global. Toast reports either "Care guide is up to date" or "Care guide refreshed — N fields updated". 7-day local + edge rate-limit per (user, plant).
5. **User edits a care field.** `<DetachConfirmModal>` warns; on confirm, the home row's `overridden_fields` is populated. Chip flips to **"AI · Edited"**. Refresh button disables. Yellow chip stops firing for this user on this plant.
6. **User clicks Revert.** `<ResetConfirmModal>` warns. On confirm, `revert_ai_plant_fork_in_place` restores the home row from its global parent. Chip flips back to **"AI"** and Refresh re-enables.

#### Orphan rows + self-heal

A home-scoped AI row with `forked_from_plant_id IS NULL` is an **orphan** — typically because Wave 2's catalogue-write wasn't yet active when the row was inserted. `useAiPlantFreshness` returns null for orphans (no chip, no freshness data); the Refresh button still renders.

Clicking Refresh on an orphan triggers an inline **self-heal**:
1. Call `PlantDoctorService.generateCareGuide(commonName, homeId)`. Edge fn finds existing global by `scientific_name_key` (cheap) or inserts a new one (one Gemini call).
2. Update the home row: `forked_from_plant_id = db_plant_id`, `overridden_fields = []`.
3. Seed `user_plant_ack` at the global's current `freshness_version`.
4. Close the modal so the parent re-fetches.

User sees one toast: "Care guide is up to date." Orphan state is invisible to them.

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
| `ended_at` | timestamptz (nullable) | Set by the End-of-Life flow (LifecycleCompleteModal / HarvestEndOfLifePrompt). `IS NOT NULL` is the Senescence-tab membership predicate. Restored instances null this out. |
| `was_natural_end` | bool (nullable) | TRUE = harvest close / natural senescence; FALSE = deliberate ending (pest, mistake, redesign). NULL once restored. Drives the Senescence filter pills + decides whether AI lifecycle analysis is offered (analysis fires only when not natural). |
| `end_summary` | text (nullable) | Optional closing note captured during the End-of-Life flow. Mirrored into the closing `plant_journals` entry for full-text search. Cleared on restore. |

### End-of-Life + Restore lifecycle

The fields above implement a **reversible** lifecycle endpoint. The flow:

1. **Mark End of Life** — either via the per-instance `LifecycleCompleteModal` (any plant) or the `HarvestEndOfLifePrompt` modal that fires after a Harvesting task completes (multi-select across the task's `inventory_item_ids`). Both writers stamp `ended_at`, `was_natural_end`, `end_summary`, and set `status = 'Archived'`, then insert a `plant_journals` row with `subject` prefixed `"Lifecycle complete"`.
2. **Senescence tab** ([03-garden-hub/12-senescence.md](../03-garden-hub/12-senescence.md)) reads `inventory_items` filtered by `ended_at IS NOT NULL` (home-scoped via RLS). Closing photos are lazy-loaded by searching `plant_journals.subject ILIKE 'Lifecycle complete%'` per row.
3. **Restore** clears `ended_at`, `was_natural_end`, `end_summary` (sets all to NULL), flips `status` back to `'Planted'`, writes a `plant_journals` "Restored from Senescence" entry, then invokes the `generate-tasks` edge function so blueprint-bound routines resume. Importantly, restore does **NOT** recreate or reset blueprints — any customisations the user made are preserved.

This means the lifecycle is a one-bit flag (`ended_at IS NULL` ↔ live; `ended_at IS NOT NULL` ↔ in Senescence) with structured context on each side. The Plant Instances tab and Senescence tab are mutually exclusive views over the same table.

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

### `plants.family` and the rotation engine

The `plants.family` column (text, populated by the AI in `plant_library` enrichment and in the `seed-plant-library` flow) is what powers the crop-rotation engine.

- **Reads**: `src/lib/rotationEngine.ts` (via `AreaRotationCard`) joins it through `inventory_items.plant_id`; the server-side mirror in `supabase/functions/_shared/rotationContext.ts` uses the same join. Family text is normalised through `rotationFamilies.ts` to a canonical key — colloquial aliases (e.g. "nightshades"), historical names (e.g. "Cruciferae", "Compositae", "Chenopodiaceae"), and parenthetical context all resolve to the same canonical family.
- **Writes**: never written by the user; only the AI / Plant Library backfill paths populate it.
- **Nullable**: families on rows the AI hasn't classified yet stay null. The rotation card still shows those plants in its history timeline (under "unclassified") but produces no avoid/prefer recommendation for them.

The 12 families with rotation rules — Solanaceae, Brassicaceae, Fabaceae, Alliaceae, Cucurbitaceae, Apiaceae, Asteraceae, Amaranthaceae, Lamiaceae, Poaceae, Polygonaceae, Liliaceae — are listed in `src/lib/rotationFamilies.ts` (browser) and `supabase/functions/_shared/rotationFamilies.ts` (server). A Deno parity test asserts the two stay in sync.

### `plant_library` images are null by design

AI-seeded `plant_library` rows store `image_url` = `thumbnail_url` = **null** (`seedRowToColumnShape` in `_shared/plantSeedPrompt.ts`) — Gemini enrichment produces care data, not photos. Search-result and detail-hero UI therefore resolves an image **by name** at display time via `<PlantResultThumb>` → `plant-image-search` (server-cached in `plant_image_cache`), rather than relying on a stored library URL. See [Image Sources](./24-image-sources.md).

---

## Related reference files

- [The Shed](../03-garden-hub/01-the-shed.md)
- [Plant Edit Modal](../08-modals-and-overlays/06-plant-edit-modal.md)
- [Instance Edit Modal](../08-modals-and-overlays/08-instance-edit-modal.md)
- [Plant Providers](./25-plant-providers.md)
- [Area Details — Crop Rotation](../03-garden-hub/04-area-details.md)
- [AI — Gemini (rotation context injection)](./13-ai-gemini.md)

## Code references for ongoing maintenance

- `supabase/migrations/*_plants.sql`, `*_inventory_items.sql`
- `src/lib/plantProvider.ts`
- `src/services/plantDoctorService.ts`
