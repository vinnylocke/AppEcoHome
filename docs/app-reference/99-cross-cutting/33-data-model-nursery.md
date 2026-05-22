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

### Triggers

- `touch_seed_packets_updated_at` / `touch_seed_sowings_updated_at` — bump `updated_at` on every UPDATE.

### Migration files

- `supabase/migrations/20260624000500_nursery.sql` — packets + sowings + view + FK + RLS.
- `supabase/migrations/20260624000600_nursery_scan.sql` — `seed_packets.image_url` + `seed-packet-images` storage bucket + policies (public read, authenticated write / update / delete).

### Storage bucket — `seed-packet-images`

- **Public read** so the URL renders anywhere; no signed URLs needed.
- **Authenticated write** — the client uploads from `ScanSeedPacketModal` after the packet row is inserted (so the path can use the new UUID).
- Path layout: `home_id/packet_id.jpg`. Re-uploading to the same path overwrites — used by future "replace photo" flows.
- 5 MB file-size cap server-side; the client compresses to ~150-300 KB so we never hit it.

### Cascade behaviour

- `homes` deleted → packets cascade (lose everything for that home), sowings cascade via their own home_id FK.
- `seed_packets` deleted → sowings cascade (`ON DELETE CASCADE`).
- `seed_sowings` deleted → matching `inventory_items.from_sowing_id` is `SET NULL` (the instance survives — it's a real plant in the garden now).
- `plants` deleted → `seed_packets.plant_id` is `SET NULL` (packet survives, just loses its link).

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
2. **Bulk-paste** rows — the free-text doesn't carry a catalogue link.

Both paths land with `plant_id = null` and a notes stamp recording the parsed common name. Plant Out is gated on `plant_id != null` so the resulting `inventory_items` row always references a real catalogue plant.

---

## Related reference files

- [The Nursery](../03-garden-hub/10-nursery.md) — the consuming surface
- [Data Model — Plants](./03-data-model-plants.md) — `plants` + `inventory_items` parent docs
- [RLS Patterns](./19-rls-patterns.md) — `is_home_member` helper
- [Edge Functions Catalogue](./10-edge-functions-catalogue.md) — `parse-seed-packets`

## Code references for ongoing maintenance

- `supabase/migrations/20260624000500_nursery.sql` — schema + view + RLS
- `src/services/nurseryService.ts` — all reads / writes / lifecycle
- `src/components/nursery/PlantOutSowingModal.tsx` — only writer of `inventory_items.from_sowing_id`
- `src/components/InstanceEditModal.tsx` — only reader of `from_sowing_id` for the provenance badge
