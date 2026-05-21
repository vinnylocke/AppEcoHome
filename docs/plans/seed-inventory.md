# Plan — Seed Inventory + Germination Log

## Goal

Give serious vegetable growers (and curious beginners) a place to track:

1. **Seed packets owned** — variety, vendor, purchased date, opened-on, sow-by, rough quantity.
2. **Germination tests** — sample N seeds, count germinated, compute a rate per packet across multiple tests.
3. **Viability tracking** — seeds age. Show a sparkline of germination over time and flag packets that have dropped below ~60%.
4. **Tight integration with the rest of the app** — sowing tasks pull from the seed inventory, the shopping list auto-suggests refills, the Library "Add as seed packet" replaces "Save to Shed" when the user explicitly wants the seed side of things.

This is the single biggest unmet need for the Marcus persona (serious vegetable grower with multiple beds). Sarah benefits more passively — through the "is this packet still good?" check and the auto-shopping-list refill.

## User-facing flows

### 1. Browse / manage the seed library

- New **Seeds** tab on `/shed` (alongside the existing plant grid). Toggle pill: **Plants** / **Seeds**.
- List view, filterable / sortable by: family · sow-by date approaching · opened · low germination · vendor.
- Each row shows variety + parent plant + a packet thumbnail + sow-by chip + last-germination-rate chip.
- Tap a row → opens a Seed Packet Detail modal.

### 2. Add a seed packet

- Tap **Add packets** on the Seeds tab. Two-step flow:
  - **Step 1 — Pick the plant.** Search the Library (re-uses `LibrarySearchTab`). Picks a Perenual / Verdantly / AI plant catalogue entry. Auto-creates the catalogue row via the existing `ensureCataloguePlantFromSearchResult` helper if it doesn't yet exist.
  - **Step 2 — Packet details.** Variety (free text), vendor, purchased date, sow-by, opened-on (defaults blank), rough quantity (free text like "~50 seeds"), notes.
- A bulk-add mode: tap **Paste a list** → multiline input → "Tomato Sungold (Suttons, sow-by 2027-12, opened May 2024)" → server parses to candidate packets → user reviews and confirms.

### 3. Sow from inventory

- Existing sow-task creation flow gains a **From your seed library** picker. Defaults to your most-recently-opened matching packets.
- Completing a sow task prompts: *"Set a germination check for 14 days?"* → one tap creates a scheduled task tied to the packet.

### 4. Log a germination test

- From a packet detail OR from a "germination check" task: tap **Log germination**.
- Modal: tested date (defaults today), sample size (default 10), number germinated (slider 0–N), notes.
- Save → row appended to `seed_germination_tests`. Packet's "latest rate" chip updates.

### 5. Shopping list refills

- Once a week (cron) the app scans for packets where: sow-by is within 90 days, latest germination rate < 60%, or `opened_on` is older than 18 months.
- A non-intrusive card on the Shopping List screen: *"3 packets approaching their sow-by — want to add fresh stock to this week's list?"*

## App-reference docs consulted

- [docs/app-reference/03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md) — Shed is the host surface.
- [docs/app-reference/02-dashboard/12-the-library.md](../app-reference/02-dashboard/12-the-library.md) — search is reused for "Pick the plant".
- [docs/app-reference/04-planner/05-shopping-lists.md](../app-reference/04-planner/05-shopping-lists.md) — refills surface.
- [docs/app-reference/04-planner/07-blueprint-manager.md](../app-reference/04-planner/07-blueprint-manager.md) — sow-task creation flow we extend.
- [docs/app-reference/08-modals-and-overlays/01-add-task-modal.md](../app-reference/08-modals-and-overlays/01-add-task-modal.md) — task modal gets a seed picker.
- [docs/app-reference/99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — `plants.id` is the foreign key from seed packets.
- [docs/app-reference/99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — new weekly refill-scan cron.
- [docs/app-reference/99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — home-scoped RLS.

## Data model

```sql
CREATE TABLE public.seed_packets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  plant_id              int  REFERENCES public.plants(id) ON DELETE SET NULL,

  variety               text,                          -- "Sungold", "Boltardy" etc.
  vendor                text,                          -- "Suttons", "Real Seeds", "Free from neighbour"
  purchased_on          date,
  opened_on             date,
  sow_by                date,
  quantity_remaining    text,                          -- "~50 seeds", "half a packet", free text

  notes                 text,
  is_archived           boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX seed_packets_home_idx          ON public.seed_packets (home_id);
CREATE INDEX seed_packets_sow_by_idx        ON public.seed_packets (home_id, sow_by);
CREATE INDEX seed_packets_plant_idx         ON public.seed_packets (plant_id);

CREATE TABLE public.seed_germination_tests (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_packet_id        uuid NOT NULL REFERENCES public.seed_packets(id) ON DELETE CASCADE,
  tested_on             date NOT NULL DEFAULT now()::date,
  sample_size           int  NOT NULL CHECK (sample_size > 0 AND sample_size <= 200),
  germinated            int  NOT NULL CHECK (germinated >= 0),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT germ_test_sample_consistent CHECK (germinated <= sample_size)
);

CREATE INDEX seed_germ_tests_packet_idx ON public.seed_germination_tests (seed_packet_id, tested_on DESC);

-- Computed-on-read latest germination rate via a view (avoids storing
-- derived data, which would drift):
CREATE OR REPLACE VIEW public.seed_packets_with_germination AS
SELECT
  sp.*,
  latest.tested_on   AS latest_germination_tested_on,
  latest.rate_pct    AS latest_germination_rate_pct,
  latest.sample_size AS latest_germination_sample_size
FROM public.seed_packets sp
LEFT JOIN LATERAL (
  SELECT
    tested_on,
    sample_size,
    ROUND(100.0 * germinated / NULLIF(sample_size, 0)) AS rate_pct
  FROM public.seed_germination_tests
  WHERE seed_packet_id = sp.id
  ORDER BY tested_on DESC
  LIMIT 1
) latest ON TRUE;
```

**RLS:**

```sql
ALTER TABLE public.seed_packets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_germination_tests     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members read seed packets"
  ON public.seed_packets FOR SELECT TO authenticated
  USING (public.is_home_member(home_id));

CREATE POLICY "Members with shed.edit can mutate seed packets"
  ON public.seed_packets FOR ALL TO authenticated
  USING (public.has_permission(home_id, 'shed.edit'))
  WITH CHECK (public.has_permission(home_id, 'shed.edit'));

CREATE POLICY "Home members read germination tests"
  ON public.seed_germination_tests FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.seed_packets sp
      WHERE sp.id = seed_germination_tests.seed_packet_id
      AND public.is_home_member(sp.home_id)
    )
  );

CREATE POLICY "Members with shed.edit can mutate germination tests"
  ON public.seed_germination_tests FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.seed_packets sp
      WHERE sp.id = seed_germination_tests.seed_packet_id
      AND public.has_permission(sp.home_id, 'shed.edit')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.seed_packets sp
      WHERE sp.id = seed_germination_tests.seed_packet_id
      AND public.has_permission(sp.home_id, 'shed.edit')
    )
  );
```

(Reuses the existing `is_home_member` and `has_permission` helpers per [RLS Patterns](../app-reference/99-cross-cutting/19-rls-patterns.md).)

## Edge functions

Mostly direct supabase reads/writes from the client — RLS does the heavy lifting. Two small edge functions:

| Fn | Purpose |
|---|---|
| `parse-seed-packets` (new) | Free-text bulk paste → AI parses to candidate packet rows. Sage+ only; fallback for Sprout / Botanist is a strict regex parser (`{name} ({vendor}, sow-by {date}, opened {date})`). |
| `scan-seed-packet-photo` (new, optional v2) | Snap a photo of the seed packet, OCR + Gemini extract fields. Sage+ only. |

## Cron

**New cron** `seed-refill-scan-weekly` — every Monday 05:00 UTC.

- Walks every home.
- For each: counts packets with `sow_by < now() + interval '90 days' OR latest_germination_rate_pct < 60 OR (opened_on IS NOT NULL AND opened_on < now() - interval '18 months')`.
- If count > 0 and the home has a current active shopping list, inserts a `shopping_list_alerts` row that the UI surfaces as a banner on the Shopping List screen.

(No Gemini calls in this cron — it's a pure SQL scan.)

## Surfaces and where they slot

| Surface | Slot |
|---|---|
| `/shed` — Plants / Seeds toggle | A pill at the top of TheShed component switches the grid between Plants (current) and the new Seeds list. |
| `AddSeedPacketModal` | New modal launched from "Add packets" button on the Seeds tab. Two steps: Library picker → details form. |
| `SeedPacketDetailModal` | Per-packet detail with germination history. Edit fields, log tests, archive packet. |
| `GerminationTestModal` | Slim modal to log one test. Reusable from packet detail OR from a "germination check" task. |
| `/planner?tab=shopping` | A new top-of-list banner: *"3 packets approaching sow-by"* with **Add refills** button. |
| Add Task / Edit Schedule modal | When task type is "Sow", a new **From your seeds** picker shows matching packets. Optional — task still works without a packet selected. |

## Files to add

| File | Purpose |
|---|---|
| `supabase/migrations/<ts>_seed_inventory.sql` | Tables + view + RLS |
| `supabase/functions/parse-seed-packets/index.ts` | AI free-text → packet rows |
| `src/components/shed/SeedInventoryTab.tsx` | List view with filters / sorts |
| `src/components/shed/AddSeedPacketModal.tsx` | Two-step add flow |
| `src/components/shed/SeedPacketDetailModal.tsx` | Packet detail + germination history sparkline |
| `src/components/shed/GerminationTestModal.tsx` | Log a single test |
| `src/components/shopping/SeedRefillBanner.tsx` | Top-of-list banner |
| `src/lib/seedInventory.ts` | Client service (queries the view, writes packets / tests) |
| `docs/app-reference/03-garden-hub/10-seed-inventory.md` | New surface doc |
| `docs/app-reference/99-cross-cutting/33-data-model-seeds.md` | Cross-cutting data model entry |

## Files to modify

| File | Change |
|---|---|
| `src/components/TheShed.tsx` | Add Plants/Seeds toggle, mount `<SeedInventoryTab>` when active |
| `src/components/AddTaskModal.tsx` | When `taskType === "Sow"`, show seed picker |
| `src/components/ShoppingLists.tsx` | Mount `<SeedRefillBanner>` |
| `src/components/PlantEditModal.tsx` | Add a "Seeds in your library" pill on the Care Guide tab if any packets exist for this plant |
| `docs/app-reference/03-garden-hub/01-the-shed.md` | Document the new toggle + Seeds tab |
| `docs/app-reference/04-planner/05-shopping-lists.md` | Document the refill banner |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Add `parse-seed-packets` |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | Add `seed-refill-scan-weekly` |
| `docs/app-reference/00-INDEX.md` | Add new docs |

## Use cases — Marcus (expert)

**Mid-January, planning the year**

Marcus has just received his 2026 seed haul from Suttons, Real Seeds and a swap with the allotment association. About 30 packets.

He opens `/shed`, toggles to Seeds, taps **Add packets** → **Paste a list**:

```
Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)
Tomato Brandywine (Real Seeds, sow-by 2027-12, ~25 seeds)
Beetroot Boltardy (Suttons, sow-by 2027-09, ~100 seeds)
... 27 more lines
```

The AI parser turns it into 30 candidate rows. He confirms. The Library catalogue rows for each plant are auto-ensured behind the scenes (no Gemini cost for those because Perenual returns the data).

**Late February — first sowing day**

He opens the Today screen, sees a sow task he scheduled for tomatoes. Taps to complete → app prompts: *"Set a germination check for Mar 9?"*. One tap → scheduled.

**Mar 9 — germination check task fires**

Notification taps through to the Germination Test modal pre-filled with Sungold. He counts 5 of 6 → 83%. Saves. Sungold's chip on the Seeds list updates to "83% · Mar 9".

**Sep — late-season planning**

He opens Seeds, sorts by **latest germination**. A 4-year-old packet of Brandywine shows 38% — flagged red. He archives it.

The Shopping List refill banner now shows: *"4 packets approaching sow-by — Brandywine (replaced), Pak Choi, Florence Fennel, Coriander"*. He hits **Add refills** → the four rows land in his current week's shopping list.

## Use cases — Sarah (amateur)

**A supermarket impulse buy**

Sarah grabs a packet of sunflower seeds at Sainsbury's. At home she opens the app, taps Add packets → searches Sunflower → picks the Perenual match → fills in vendor=Sainsbury's, sow-by from the packet, leaves quantity blank.

She never re-opens the Seeds tab on purpose. But:

- 14 months later the refill banner pings her: *"Your sunflower seeds are getting old — quick test?"*
- When she goes to create a sow task for "sunflower spring 2027" the seed picker pre-fills with her existing packet.

The value for her is **the app remembering** without nagging.

## Edge cases / risks

- **Seed packets without a Library match** — the user types a variety the catalogue doesn't have. We allow `plant_id` to be NULL and the row stores common-name text. The Care Guide / Companions integrations skip for these rows.
- **Bulk paste of malformed lines** — the parser tolerates a wide grammar but kicks ambiguous lines back to the user as "needs review" before commit.
- **Shared homes** — a packet is home-scoped; any member with `shed.edit` can mutate. Audit log fires `EVENT.SEED_PACKET_*` events.
- **Privacy** — vendor + variety go to Gemini in the parser. No PII concerns; vendor is a brand name.

## Tier gating

| Tier | What they see |
|---|---|
| Sprout | Full CRUD on packets + germination. **No** bulk paste parser (the strict-regex fallback works for hand-typed lines). No photo-OCR. |
| Botanist | Same as Sprout. |
| Sage | Full features incl. AI bulk-paste parsing + (v2) photo OCR. |
| Evergreen | Same as Sage. |

## Out of scope (v1)

- **Photo OCR** of a physical seed packet (v2).
- **Seed-saving workflow** — when a user's plant goes to seed, walking them through harvest and storage. Separate feature.
- **Local seed swap marketplace** — community / multi-home feature, larger scope.
- **Auto-deduction of `quantity_remaining`** based on sow tasks. Quantity stays free-text.

## Sequencing

1. Migration + view + RLS.
2. Service module + a minimal Seeds list page (read-only) to verify the data model.
3. Add Packet modal + Library picker integration.
4. Germination test modal + sparkline.
5. Sow-task picker integration.
6. Shopping list refill banner + cron.
7. AI bulk-paste parser (Sage+) — last because the rest works without it.
8. App-reference docs (new surface, data model, edge fn, cron).
9. E2E spec: add packet → log test → refill banner appears next cron run.
10. Release notes + deploy.
