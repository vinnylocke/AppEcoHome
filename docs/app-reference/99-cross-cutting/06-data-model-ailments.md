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

### `ailment_library` (global catalogue, added 2026-06-18 — Phase 1)

A self-populating **global** catalogue of pests/diseases/invasives/disorders, mirroring `plant_library` (distinct from the per-home `ailments` watchlist below). Columns: `name`, `kind` (pest|disease|invasive|disorder), `scientific_name`, `aliases`, `description`, `symptoms`, `causes`, `treatment`, `prevention`, `severity` (low|moderate|high|critical), `affected_plant_types`, `affected_families`, `season`, `organic_friendly`, image fields, provenance (`source`, `valid`, `sources`, `seeded_*`/`verified_*`), and a generated `name_key` (unique, dedup). RLS: public read for `authenticated`; writes service-role only. `ailment_library_runs` logs each seed run (admin-read). Seeded by [`seed-ailment-library`](./10-edge-functions-catalogue.md) (`_shared/ailmentSeedPrompt.ts`) + a weekly cron. **Phase 2 (2026-06-18):** a browse surface ([`AilmentLibrary.tsx`](../../../src/components/AilmentLibrary.tsx) at route `/ailment-library`, reached via "Browse the ailment library" in the Watchlist) with search + kind filters + detail view, and **"Add to watchlist"** which maps a catalogue entry into a home `ailments` row via [`ailmentLibraryService.ts`](../../../src/services/ailmentLibraryService.ts) (`mapLibraryToWatchlistPayload`, unit-tested — kind→type, severity 4→3 levels, treatment/prevention → steps). **Phase 3 (2026-06-18):** [`verify-ailment-library`](./10-edge-functions-catalogue.md) runs a weekly AI self-critique over unverified rows (accuracy + safe-treatment), setting `valid`/`verified_at` (amending fields where wrong); and `generate-ailment-suggestions` is **grounded** in the catalogue (matching entries are injected into its prompt so watchlist suggestions stay consistent). **Library links (2026-06-18):** `generate-ailment-suggestions` now tags each suggestion with a `library_id` when its name matches a catalogue entry; the Watchlist AI results show an "In library" chip that deep-links to `/ailment-library?ailment=<id>` (the browse surface opens that entry's detail from the URL param). Remaining optional follow-up: a Perenual provider source for the catalogue. Migration `20260730000000_ailment_library.sql`. See [docs/plans/ailment-library.md](../../plans/ailment-library.md). **Tiered Add + write-back (2026-06-19):** the Watchlist Add modal is now a unified tiered search (library → Perenual → Rhozly AI); the AI tier **writes its result back to `ailment_library`** via the new service-role `add-ailment-to-library` fn (maps the AI payload → library row with `_shared/ailmentLibraryMap.ts`, upserts on `name_key`, never clobbers a curated row), so AI-discovered ailments become Tier-1 library hits for every future user. See [docs/plans/watchlist-tiered-add-search.md](../../plans/watchlist-tiered-add-search.md).

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
