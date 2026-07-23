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

**Bulk CSV / AI-paste write path (RHO-4 Phase 2).** Besides the one-at-a-time Add modal, a home `ailments` row can be created in batch via [`BulkAddAilmentsModal`](../../../src/components/BulkAddAilmentsModal.tsx) (Watchlist **Bulk add**): a strict CSV parse against `AILMENT_TEMPLATE` ([`src/lib/uploadTemplates/registry.ts`](../../../src/lib/uploadTemplates/registry.ts)) or a free-text AI/regex paste ([`parse-ailment-list`](./10-edge-functions-catalogue.md) / `src/lib/parseAilmentList.ts`). **Every bulk-imported ailment is `source='manual'`** — no library/Perenual/AI lookup runs during import; user-supplied fields are authoritative and edits stay unlocked. `symptoms`/`prevention_steps`/`remedy_steps` land as the same jsonb object arrays the manual `StepBuilder` produces — CSV grammar v1 populates only symptom `title [severity]` and step titles (task_type / frequency / product default and are configured in the detail editor). `name` + `type` are the required CSV columns; `type` is validated against the DB CHECK before insert. A per-row favourite flag (CSV `favourite` column or the review-step toggle) triggers a post-insert `favouriteAilment()` on the new row. Row cap 200 per file.

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

### Cross-Home Favourite Ailments — `user_favourite_ailments`

**Cross-Home Favourites Phase 2 (2026-07-03, migration `20260901000000_user_favourite_ailments.sql`).** A **user-scoped** saved list of watchlist ailments that follows the *user* across homes — mirrors Phase 1's `user_favourite_plants` (pattern: `guide_bookmarks`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `user_id` | uuid (FK → auth.users) | RLS key. `ON DELETE CASCADE`. |
| `ailment_library_id` | bigint (FK → ailment_library.id) | The **immutable canonical reference** — the GLOBAL library row, resolved **best-effort by `name_key`** at favourite time (`resolveAilmentLibraryId`), because the home `ailments` row has **no library FK** (unlike plants → `plants`). Matched → "always live" library render; NULL for manual/unmatched ailments (→ tombstone). `ON DELETE SET NULL`. |
| `identity_key` | text | Lowercased trimmed name (mirrors `ailment_library.name_key`). Dedupes library-less (tombstone) favourites; drives the Home-tab heart-fill. |
| `source` | text | `manual`/`perenual`/`ai`/`library`. Gated by the tier-gate trigger. |
| `name`, `ailment_type`, `thumbnail_url` | text | Tombstone display columns. |
| `snapshot` | jsonb | Tombstone payload (`buildAilmentSnapshot` — `scientific_name`, `description`, `symptoms`, `affected_plants`, `prevention_steps`, `remedy_steps`, `perenual_id`; never home-scoped bookkeeping). Live library data wins when the reference resolves. |
| `favourited_from_home_id` | uuid (FK → homes) | Informational ("Saved from <home>"). `ON DELETE SET NULL`. |
| `created_at` | timestamptz | |
| — | `UNIQUE (user_id, ailment_library_id) WHERE …NOT NULL` + `UNIQUE (user_id, identity_key) WHERE …NULL` | Two **partial** uniques (one per reference-present case). PostgREST can't disambiguate them via `on_conflict`, so `favouriteAilment` does an explicit find-then-update-or-insert instead of an upsert. |

**No fork / copy-on-write.** Ailments have no shared-catalogue in-place edit path like plants had, so **add-to-home is a plain `ailments` insert** (`addFavouriteAilmentToHome`) — no fork row, no re-point, no delete. `source` is preserved.

**Favourite from the library (ailment-library overhaul Stage 1, 2026-07-21):** `favouriteAilment` now accepts an optional third param `preResolvedLibraryId` — the Ailment Library page favourites a catalogue row directly via `favouriteLibraryAilment(row, homeId)` (`ailmentLibraryService.ts`), passing the row's own id and skipping the name-ilike resolution entirely (the favourite is always library-backed, never a tombstone). `undefined` keeps resolve-by-name; explicit `null` forces a tombstone.

**RLS:** pure user-scoped — `FOR ALL … USING (user_id = (SELECT auth.uid())) WITH CHECK (…)`. Grants: `SELECT/INSERT/UPDATE/DELETE` to `authenticated`, no `anon`.

**Server-side source × tier gate:** a `BEFORE INSERT OR UPDATE OF source` trigger, `enforce_favourite_ailment_tier()`, blocks favouriting an ailment whose source exceeds the favouriter's entitlements (`ai` needs `ai_enabled`; `perenual` needs `enable_perenual`; `manual`/`library` open — `library` is the free default search source for every tier). **Since `20261015000000` (ailment-library overhaul Stage 1): a favourite that carries an `ailment_library_id` reference gates as `'library'` — open to every tier** — because the catalogue is public-read and free to add-to-watchlist on every plan; the catalogue row's own `source` records who *authored* it (`ai`/`perenual`/`manual`, mostly `ai`), not what plan is needed to consume it. (The original trigger re-derived from `ailment_library.source`, which made favouriting most library entries throw `tier_locked_source` for non-AI tiers — a review-caught defect that also latently hit the watchlist heart whenever a home `'library'` ailment name-resolved to an AI-authored catalogue row. This doc previously mis-described that trigger as gating on the claimed source — the doc drift is fixed with the behaviour.) Tombstone favourites (no reference) still gate on the claimed `source`. Exempts service-role/direct-SQL (`auth.uid() IS NULL`) so seeds can plant above-tier favourites. See [Tier Gating](./17-tier-gating.md#source--tier-action-matrix--cross-home-favourites).

**Reads are `user_id`-only** — filtering by `home_id` would silently return nothing under the user-scoped RLS. Phase 3 (`user_favourite_seed_packets`) is deferred to its own migration.

### Per-home image override — `ailment_image_overrides` (2026-07-23)

Because `ailment_library` is **global and client-read-only**, a home can't change a catalogue row's image (and shouldn't — it would change the image for every home). So a home's chosen ailment image lives in `ailment_image_overrides` (migration `20261024000000`, home-scoped). Columns: `home_id` (FK homes), `ailment_library_id` (**bigint**, nullable, resolved best-effort by `name_key` like the favourites table, `ON DELETE CASCADE`), `identity_key` (lowercased name bridge when no library match), `image_url`, `thumb_url`, `image_credit jsonb` (attribution carried from the chosen candidate), `source`, audit columns. **Two partial uniques** exactly like `user_favourite_ailments` — `(home_id, ailment_library_id) WHERE …NOT NULL` and `(home_id, identity_key) WHERE …NULL` — so client writes are find-then-upsert (PostgREST can't disambiguate `on_conflict`). RLS: canonical home-scoped `FOR ALL` (`home_id IN (SELECT home_id FROM home_members WHERE user_id = (SELECT auth.uid()))`); GRANT SELECT/INSERT/UPDATE/DELETE to `authenticated`.

**Ailment image resolution order:** (1) home `ailments.thumbnail_url` (if a watchlist row exists) → (2) `ailment_image_overrides.image_url` for this home + library id / identity_key → (3) `ailment_library.image_url`/`thumbnail_url` → (4) KindIcon tile. The "tap image → wrong → replace" flow ([docs/plans/image-judge-and-replace.md](../../plans/image-judge-and-replace.md)) writes BOTH the override (source of truth for library/field-guide surfaces) and the mirrored `ailments.thumbnail_url` (no-join card render). Rejected image URLs are recorded per-home in `image_rejections` (see [Image Sources](./24-image-sources.md#rejection--per-home-image-override-2026-07-23)) so the new `ailment-image-search` never re-serves them.

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
- `supabase/migrations/20260901000000_user_favourite_ailments.sql` — cross-home favourite ailments
- `src/services/favouritesService.ts` — favourite/add-to-home ailment fns
- `src/lib/favouriteIdentity.ts` — ailment identity / gating helpers
- `src/components/BulkAddAilmentsModal.tsx` + `src/lib/uploadTemplates/registry.ts` (`AILMENT_TEMPLATE`) + `src/lib/parseAilmentList.ts` + `supabase/functions/parse-ailment-list/` — RHO-4 Phase 2 bulk manual-ailment write path
- `src/lib/automationEngine.ts`

## Derived presence — `ailment_presence` view (Hub v3 Stage A, 2026-07-22)

`supabase/migrations/20261017000000_presence_views.sql`: **Active** = any `plant_instance_ailments` link `status='active'` on a live instance; **Inactive** = links exist but none live, or any `area_scan_ailments` sighting (scans are history evidence, never Active — owner-locked ruling). Security-invoker; client face `useGardenPresence` (pill: Active > Inactive > Watching).
