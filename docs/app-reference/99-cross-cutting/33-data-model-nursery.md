# Data Model — The Nursery (Packets, Sowings, Plant-Out FK)

> Two tables + a view + one FK on `inventory_items`. Models the lifecycle from "packet on a shelf" to "real plant in the Shed" without coupling either side to the other.

---

## Quick Summary

```
seed_packets (1)
├── plant_id  → plants(id)  (nullable; null for bulk-paste rows until linked)
├── home_id   → homes(id)
├── variety / vendor / sow_by / opened_on / purchased_on / quantity_remaining / image_url
├── is_archived flag
└── ──► seed_sowings (N)
        ├── sown_on / sown_count
        ├── observed_on / germinated_count
        ├── status: sown | germinated | planted_out | discarded
        ├── planted_out_at (stamped on transition to planted_out)
        └── ──► inventory_items (N rows, or one multi-quantity row)
                ├── from_sowing_id  → seed_sowings(id)  (this column)
                ├── growth_state    = "Seedling"        (initial state from Plant Out)
                ├── quantity        = N planted out     (the existing column)
                └── ...standard inventory_items fields
```

The full lifecycle: **buy a packet → log sowings against it → observe germination → plant out the germinated seedlings → those become real plant instances in the Shed.**

---

## Role 1 — Technical Reference

### `seed_packets` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | gen_random_uuid() |
| `home_id` | uuid NOT NULL | FK → `homes(id)`, ON DELETE CASCADE |
| `plant_id` | int | FK → `plants(id)`, ON DELETE SET NULL. Nullable — bulk-paste rows + "Add later" rows start null |
| `variety` | text | Free-text variety / cultivar (e.g. "Sungold") |
| `vendor` | text | Free-text source ("Suttons", "neighbour", "allotment swap") |
| `purchased_on` | date | When you bought it |
| `opened_on` | date | When the packet was opened — drives the >18-month refill trigger |
| `sow_by` | date | Sow-by from the packet — drives the 90-day refill trigger |
| `quantity_remaining` | text | Free-text — "~30 seeds", "half a packet". Never auto-deducted |
| `notes` | text | Anything; bulk-paste + scan flows stamp the parsed common name here |
| `image_url` | text | Public URL of the packet photo captured via the Scan-a-packet flow. Null when the packet was added manually or via bulk paste. Stored in the `seed-packet-images` bucket at `home_id/packet_id.jpg`. |
| `is_archived` | boolean NOT NULL DEFAULT false | List view filters this out by default |
| `created_at` / `updated_at` | timestamptz | `updated_at` maintained by trigger |

**Indexes:**
- `seed_packets_home_idx` ON `(home_id) WHERE is_archived = false` — list view's bread-and-butter query.
- `seed_packets_sow_by_idx` ON `(home_id, sow_by) WHERE is_archived = false` — refill banner.
- `seed_packets_plant_idx` ON `(plant_id) WHERE plant_id IS NOT NULL` — Care Guide tab pill.

### `seed_sowings` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `home_id` | uuid NOT NULL | FK → `homes(id)`, ON DELETE CASCADE — denormalised for direct RLS |
| `seed_packet_id` | uuid NOT NULL | FK → `seed_packets(id)`, ON DELETE CASCADE |
| `sown_on` | date NOT NULL | When seeds went in the medium |
| `sown_count` | int NOT NULL CHECK (1 ≤ N ≤ 1000) | How many seeds were sown |
| `observed_on` | date | NULL until the user logs an observation |
| `germinated_count` | int CHECK (0 ≤ N ≤ sown_count) | NULL until observed |
| `status` | text NOT NULL DEFAULT 'sown' | CHECK in (`sown`, `germinated`, `planted_out`, `discarded`) |
| `planted_out_at` | date | Stamped when status moves to `planted_out` |
| `notes` | text | Observation notes append rather than overwrite |
| `task_id` | uuid | FK → `tasks(id)`, ON DELETE SET NULL. Set when the sowing was auto-created from a completed Planting task that was linked to this packet. Enforces a UNIQUE partial index — same task can't produce two sowings (idempotent on uncomplete + recomplete). |
| `created_at` / `updated_at` | timestamptz | trigger maintains updated_at |

**Lifecycle:**

```
(insert) ──► sown
sown      ──► germinated   (via observeSowing — sets observed_on + germinated_count)
germinated ──► planted_out (via plantOutSowing — only when cumulative qty ≥ germinated_count)
germinated ──► germinated  (partial plant-out — quantity carried into inventory_items but more remains)
sown|germ ──► discarded    (via discardSowing — terminal, kept for viability stats)
```

**Indexes:**
- `seed_sowings_packet_idx` ON `(seed_packet_id, sown_on DESC)` — packet detail's sowings list.
- `seed_sowings_home_idx` ON `(home_id)` — refill-banner RLS scan.
- `seed_sowings_active_idx` ON `(seed_packet_id) WHERE status IN ('sown', 'germinated')` — the view's "active sowing" subquery.
- `seed_sowings_task_id_unique` UNIQUE ON `(task_id) WHERE task_id IS NOT NULL` — idempotency for the task → sowing bridge. The auto-create service swallows the `23505` violation as a no-op.

### Bridge to the task system

The `tasks.seed_packet_id` + `task_blueprints.seed_packet_id` nullable FKs (see [Data Model — Tasks](./04-data-model-tasks.md)) close the loop in both directions:

- **Direction A (Task → Sowing):** a Planting task can be created with `seed_packet_id` set (via `AddTaskModal`'s NurseryPacketPicker or `AddToCalendarSheet` when invoked from the Sowing Calendar tab). On completion, `src/services/sowingAutoCreateService.ts` opens an inline `LogSowingFromTaskModal` to capture the count, then writes a `seed_sowings` row with `task_id` set. The unique partial index above guarantees idempotency.
- **Direction B (Packet → Calendar):** the Sowing Calendar tab on `SeedPacketDetailModal` reads the packet's linked plant's `plant_grow_guides` row, classifies propagation + germination `schedulable_tasks` into sow indoors / sow direct / transplant out bands, and routes the user back into `AddToCalendarSheet` with `seedPacketId` pre-filled so Direction A automatically fires later.

### `inventory_items.from_sowing_id`

```sql
ALTER TABLE public.inventory_items
  ADD COLUMN from_sowing_id uuid
  REFERENCES public.seed_sowings(id) ON DELETE SET NULL;
```

The only new column on `inventory_items` for the Nursery. Populated on Plant Out, used by:
- **InstanceEditModal "From the Nursery" badge** — joins back to the sowing + packet for provenance text.
- **`fetchPlantedOutTotal(sowing_id)`** — sums `quantity` for partial-plant-out cap enforcement.

Partial-index for fast lookups:
```sql
CREATE INDEX inventory_items_from_sowing_idx
  ON public.inventory_items (from_sowing_id) WHERE from_sowing_id IS NOT NULL;
```

### `seed_packets_with_germination` view

```sql
CREATE OR REPLACE VIEW public.seed_packets_with_germination AS
SELECT
  sp.*,
  latest.observed_on   AS latest_germination_observed_on,
  latest.rate_pct      AS latest_germination_rate_pct,
  latest.sown_count    AS latest_germination_sample_size,
  active.id            AS active_sowing_id,
  active.status        AS active_sowing_status,
  active.sown_count    AS active_sowing_sown_count
FROM public.seed_packets sp
LEFT JOIN LATERAL (
  SELECT observed_on, sown_count,
         ROUND(100.0 * germinated_count / NULLIF(sown_count, 0))::int AS rate_pct
  FROM public.seed_sowings
  WHERE seed_packet_id = sp.id AND germinated_count IS NOT NULL
  ORDER BY observed_on DESC NULLS LAST LIMIT 1
) latest ON TRUE
LEFT JOIN LATERAL (
  SELECT id, status, sown_count
  FROM public.seed_sowings
  WHERE seed_packet_id = sp.id AND status IN ('sown', 'germinated')
  ORDER BY sown_on DESC LIMIT 1
) active ON TRUE;
```

Used by the Nursery list + Care Guide pill + refill banner — every surface that needs "packet + viability + active sowing" in one query.

### RLS policies

Both tables are home-scoped via the existing `is_home_member(home_id)` helper. Permission gating is intentionally simple — every home member can read + mutate, matching how `plants` and `inventory_items` work:

```sql
CREATE POLICY "Home members read seed packets"
  ON public.seed_packets FOR SELECT TO authenticated
  USING (public.is_home_member(home_id));

CREATE POLICY "Home members write seed packets"
  ON public.seed_packets FOR ALL TO authenticated
  USING (public.is_home_member(home_id))
  WITH CHECK (public.is_home_member(home_id));

-- Identical pair on seed_sowings.
```

The view inherits the underlying tables' RLS (`security_invoker = false` by default in Postgres, so the view runs as the calling user against the policies).

### `user_favourite_seed_packets` columns (Cross-Home Favourites Phase 3, FINAL)

**Cross-Home Favourites Phase 3 (migration `20260902000000_user_favourite_seed_packets.sql`).** A **user-scoped** saved list of packet *varieties* that follows the *user* across homes — the third and final table in the favourites family (siblings: `user_favourite_plants`, `user_favourite_ailments`). **SNAPSHOT-ONLY** — packets have no canonical library, so a favourite is a pure variety reference + a snapshot of the reference fields; there is no live-ref "always live" join.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | gen_random_uuid() |
| `user_id` | uuid NOT NULL | FK → `auth.users(id)` ON DELETE CASCADE. The RLS key. |
| `seed_packet_id` | uuid | FK → `seed_packets(id)`, ON DELETE SET NULL. **Tombstone back-reference** for the "in this home" check only — never a live-data source. |
| `plant_id` | int | FK → `plants(id)`, ON DELETE SET NULL. The variety's plant (nullable); used to re-link on add-to-home. |
| `plant_common_name` / `variety` / `vendor` | text | Immutable identity columns, captured at favourite time. |
| `identity_key` | text NOT NULL | `lower(coalesce(variety,'')) \|\| '\|' \|\| lower(coalesce(plant_common_name,''))` — the single dedupe key (`packetIdentityKey` in `src/lib/favouriteIdentity.ts`). |
| `copied_image_url` | text | Public URL of the favourite-scoped image copy (`seed-packet-images/favourites/{user_id}/{favourite_id}.jpg`). NULL when the origin packet had no image. Survives the home packet's deletion. |
| `snapshot` | jsonb NOT NULL DEFAULT `{}` | Variety-reference fields only (`sow_by`, `notes`, `quantity_remaining`, `purchased_on`, `opened_on` — `buildPacketSnapshot`, whitelisted). **NEVER live stock or sowings.** |
| `favourited_from_home_id` | uuid | FK → `homes`, informational ("Saved from <home>"). ON DELETE SET NULL. |
| `created_at` | timestamptz | DEFAULT now() |

- **Dedupe:** `UNIQUE (user_id, identity_key)` — a single path (unlike ailments' two partial uniques), since a packet always has exactly one identity axis. Re-favouriting the same variety upserts (refreshes the snapshot + image).
- **RLS:** pure user-scoped — `USING/WITH CHECK (user_id = (SELECT auth.uid()))`. Grants `SELECT,INSERT,UPDATE,DELETE` to `authenticated`, no anon.
- **NO tier trigger.** `seed_packets` have no `source` column and packet favourites make zero AI/API calls, so — unlike `user_favourite_plants` / `user_favourite_ailments` — there is no source × tier gate and no `enforce_favourite_*_tier()` trigger. Favouriting and add-to-home are open to every tier and every home member. See `docs/plans/cross-home-favourites-phase-3-nursery.md` for the decision.
- **Image copy (both directions):** favourite-time copies the home packet object → favourite-scoped path (`favouritesService.favouriteSeedPacket`); add-to-home copies the favourite-scoped object → the new home path (`addFavouritePacketToHome`). Both are plain client Storage ops (the bucket's policies allow any authenticated user any path).

### Triggers

- `touch_seed_packets_updated_at` / `touch_seed_sowings_updated_at` — bump `updated_at` on every UPDATE.
- No trigger on `user_favourite_seed_packets` (packets are ungated — see above).

### Migration files

- `supabase/migrations/20260624000500_nursery.sql` — packets + sowings + view + FK + RLS.
- `supabase/migrations/20260624000600_nursery_scan.sql` — `seed_packets.image_url` + `seed-packet-images` storage bucket + policies (public read, authenticated write / update / delete).
- `supabase/migrations/20260902000000_user_favourite_seed_packets.sql` — cross-home favourites (Phase 3): `user_favourite_seed_packets` + user-scoped RLS + grants + indexes. No tier trigger.

### Storage bucket — `seed-packet-images`

- **Public read** so the URL renders anywhere; no signed URLs needed.
- **Authenticated write** — the client uploads from `ScanSeedPacketModal` after the packet row is inserted (so the path can use the new UUID).
- Path layout: `home_id/packet_id.jpg` for home packets; `favourites/{user_id}/{favourite_id}.jpg` for the favourite-scoped copies (Phase 3). Re-uploading to the same path overwrites.
- 5 MB file-size cap server-side; the client compresses to ~150-300 KB so we never hit it.

### Cascade behaviour

- `homes` deleted → packets cascade (lose everything for that home), sowings cascade via their own home_id FK.
- `seed_packets` deleted → sowings cascade (`ON DELETE CASCADE`).
- `seed_sowings` deleted → matching `inventory_items.from_sowing_id` is `SET NULL` (the instance survives — it's a real plant in the garden now).
- `plants` deleted → `seed_packets.plant_id` is `SET NULL` (packet survives, just loses its link).
- `seed_packets` deleted → `user_favourite_seed_packets.seed_packet_id` is `SET NULL` (the favourite survives on its snapshot + `copied_image_url`; only the "in this home" back-reference is lost).
- `auth.users` deleted → `user_favourite_seed_packets` cascade (favourites are the user's own).

---

## Role 2 — Expert Gardener's Guide

### How a packet becomes a plant

Most apps treat seed inventory and plant inventory as separate problems. Rhozly's data model deliberately links them via `inventory_items.from_sowing_id` — when you plant out a sowing, the resulting instance carries a foreign key back to the sowing it came from, and through that the packet, and through that the vendor and the variety and the sow-by date.

This is why "Grown from your Suttons Tomato Sungold — sown Feb 26, 9 of 12 germinated" is just a join, not a separate notes field.

### Why quantity, not N rows

When you plant out 9 seedlings from one sowing, Rhozly inserts ONE `inventory_items` row with `quantity = 9`. Same as how Plant Assignment Modal works for direct-assigned plants. This keeps the rest of the app (Garden Layout, Task Engine, Companions, Care Guide) ignoring the nursery side completely — a nursery-graduated plant looks exactly like a direct-assigned one to every other surface.

If a gardener wants distinct rows (e.g. to track yield per individual plant), they can split via the Instance Edit Modal post-hoc. Most don't.

### What stays editable

Everything on the packet is free-text and editable any time — variety, vendor, dates, quantity, notes. Sowings can be observed multiple times (each Observe appends to notes). The only fields that can't be reversed are:
- `planted_out` status (graduating produced a real instance — undo would mean archiving that instance manually).
- `discarded` status (counts against the packet's viability stats forever).

### Why `plant_id` is nullable

Two paths create rows without a linked plant:
1. **"Add later"** path in the single-add modal — the user just wants to log the packet now.
2. **Bulk add** rows (paste OR CSV upload) whose plant name has **no** match in the home's Shed.

Unmatched rows land with `plant_id = null` and a notes stamp recording the parsed/entered plant name. Plant Out is gated on `plant_id != null` so the resulting `inventory_items` row always references a real catalogue plant.

**Link-by-name write path (RHO-4 Phase 3).** `BulkPasteSeedPacketsModal` — for both the paste and CSV modes — resolves each row's plant name against the home's non-archived `plants` (case-insensitive exact `common_name` match) before calling `createSeedPacket`. A match sets `plant_id` (so the packet is immediately Plant-Out-ready and its favourite identity carries the plant name); no match keeps `plant_id = null` and preserves the name in the notes provenance line. The CSV path enters via `SEED_PACKET_TEMPLATE` in `src/lib/uploadTemplates/registry.ts` (its `plant_name` field is a scratch link key, never a `seed_packets` column) with flexible date parsing (`purchased_on`/`opened_on` round to first-of-period, `sow_by` to last-of-period). No new columns, no migration — the CSV import is bulk `createSeedPacket`, identical to the existing paste insert.

---

## Related reference files

- [The Nursery](../03-garden-hub/10-nursery.md) — the consuming surface
- [Data Model — Plants](./03-data-model-plants.md) — `plants` + `inventory_items` parent docs
- [RLS Patterns](./19-rls-patterns.md) — `is_home_member` helper
- [Edge Functions Catalogue](./10-edge-functions-catalogue.md) — `parse-seed-packets`

## Code references for ongoing maintenance

- `supabase/migrations/20260624000500_nursery.sql` — schema + view + RLS
- `src/services/nurseryService.ts` — all reads / writes / lifecycle
- `src/components/nursery/BulkPasteSeedPacketsModal.tsx` — paste + CSV bulk add, link-by-name resolution, favourites-on-import
- `src/lib/uploadTemplates/registry.ts` — `SEED_PACKET_TEMPLATE` (RHO-4 Phase 3 CSV contract)
- `src/components/nursery/PlantOutSowingModal.tsx` — only writer of `inventory_items.from_sowing_id`
- `src/components/InstanceEditModal.tsx` — only reader of `from_sowing_id` for the provenance badge
