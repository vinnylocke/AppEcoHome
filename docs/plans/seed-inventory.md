# Plan — The Nursery (Seed Packets + Sowings + Plant-Out)

## Goal

Give serious vegetable growers (and curious beginners) a place to track everything that exists between "I bought a seed packet" and "it's a plant in my garden":

1. **Packets owned** — variety, vendor, purchased date, opened-on, sow-by, rough quantity.
2. **Sowings** — every time you put seeds in a medium. Tracks `sown_count`, `germinated_count`, and a status lifecycle (`sown` → `germinated` → `planted_out` / `discarded`).
3. **Viability tracking** — a packet's latest germination rate is computed from its most recent sowing. Old packets with dropping rates get flagged.
4. **Plant-out → real plant instances** — the moment seedlings go in the ground, a sowing produces an `inventory_items` row (with the existing quantity field carrying the number planted) linked back to the source packet. The seedlings become trackable plants in the Shed.
5. **Tight integration with the rest of the app** — sowing tasks pull from the Nursery, the shopping list auto-suggests refills, and a "Seeds in your Nursery" pill appears on the Care Guide tab of any plant you've got packets of.

Marcus needs this most — the serious vegetable grower running successions across multiple beds. Sarah benefits passively — through the "is this packet still good?" check, the auto-shopping-list refill, and not having to manually re-create plant instances when her sunflower seedlings go into the ground.

## Name

**The Nursery.** Real gardener term that broadens the scope beyond dormant inventory — it covers packets on the shelf, sowings in seed trays, and seedlings on the windowsill. Pairs naturally with **The Shed** (where plants live in the garden) — seedlings *graduate* from the Nursery to the Shed when planted out.

## User-facing flows

### 1. Open the Nursery

- New **Plants** / **Nursery** toggle pill at the top of `/shed`. The Plants grid stays as the default; Nursery is the new view.
- The Nursery view shows a packet list, filterable / sortable by: family · sow-by date approaching · opened · low germination · vendor.
- Each row shows variety + parent plant + a packet thumbnail + sow-by chip + a status chip:
  - "12 sown · awaiting germination" (when there's an active in-progress sowing)
  - "Last sowing 75% (Mar 9)" (when latest sowing has been observed)
  - "5 planted out" (when a sowing recently graduated)
  - "Refill due — sow-by Oct '26" (when nothing's active and the packet is approaching its sow-by)
- Tap a row → opens the Packet Detail modal.

### 2. Add a packet

- Tap **Add packets** on the Nursery tab. Two-step flow:
  - **Step 1 — Pick the plant.** Search the Library (re-uses `LibrarySearchTab`). Picks a Perenual / Verdantly / AI plant catalogue entry. Auto-creates the catalogue row via the existing `ensureCataloguePlantFromSearchResult` helper if it doesn't yet exist.
  - **Step 2 — Packet details.** Variety (free text), vendor, purchased date, sow-by, opened-on (defaults blank), rough quantity (free text like "~50 seeds"), notes.
- A bulk-add mode: tap **Paste a list** → multiline input → "Tomato Sungold (Suttons, sow-by 2027-12, opened May 2024)" → server parses to candidate packets → user reviews and confirms.

### 3. Log a sowing

- From a packet detail OR from a "sow" task completion: tap **Log a sowing**.
- Modal: sown date (defaults today), sown count (default 10), notes, optional area (so the sowing knows where it'll eventually go).
- Save → a `seed_sowings` row appears under the packet with status `sown`. The packet's chip flips to "12 sown · awaiting germination".

### 4. Observe germination

- After a few days the user comes back to the packet detail. Each active sowing has an **Observe** button.
- Modal: observed date (defaults today), germinated count (slider 0–sown_count), notes.
- Save → status moves to `germinated`. The packet's "latest rate" chip updates. The sowing now has a **Plant out** action.

### 5. Plant out (sowing → instance)

- The big new flow. Tap **Plant out** on a `germinated` sowing.
- Slim modal: location + area picker, planted date (defaults today), quantity (defaults to `germinated_count`), nickname (optional, free text).
- Confirm → creates ONE `inventory_items` row with:
  - `quantity` = the picked number (≤ `germinated_count`)
  - `growth_state` = `Seedling`
  - `planted_at` = the picked date
  - `from_sowing_id` = FK back to the sowing
  - `plant_id` = the packet's `plant_id`
  - standard area / home / status = `Planted`
- The sowing's status moves to `planted_out`, `planted_out_at` is stamped.
- AutomationEngine's `applyPlantedAutomations` runs as it would from PlantAssignmentModal — care schedules generate from the catalogue defaults.
- Toast: *"6 Sungold seedlings added to your Back Bed."*

### 6. Discard a sowing

- For failed batches (no germination, lost tray, fungal collapse): **Discard** on a sowing.
- Confirm modal: optional notes ("damping off").
- Status → `discarded`. The sowing stays in the packet's history (counts against viability), it just stops appearing as active.

### 7. Sow from a task

- Existing sow-task creation gains a **From your Nursery** picker. Defaults to the most-recently-opened matching packets.
- Completing a sow task prompts: *"Log this as a sowing from your Tomato Sungold packet?"* → one tap creates the `seed_sowings` row pre-filled (sown_count from the task description if parseable, else 10).
- A follow-up: *"Set a germination check for 14 days?"* → one tap creates a scheduled task tied to the sowing.

### 8. Shopping list refills

- Once a week (cron) the app scans for packets where: sow-by is within 90 days, latest germination rate < 60%, or `opened_on` is older than 18 months.
- A non-intrusive banner on the Shopping List screen: *"3 packets approaching their sow-by — want to add fresh stock to this week's list?"*

## App-reference docs consulted

- [docs/app-reference/03-garden-hub/01-the-shed.md](../app-reference/03-garden-hub/01-the-shed.md) — Shed is the host surface.
- [docs/app-reference/02-dashboard/12-the-library.md](../app-reference/02-dashboard/12-the-library.md) — search is reused for "Pick the plant".
- [docs/app-reference/04-planner/05-shopping-lists.md](../app-reference/04-planner/05-shopping-lists.md) — refills surface.
- [docs/app-reference/04-planner/07-blueprint-manager.md](../app-reference/04-planner/07-blueprint-manager.md) — sow-task creation flow we extend.
- [docs/app-reference/08-modals-and-overlays/01-add-task-modal.md](../app-reference/08-modals-and-overlays/01-add-task-modal.md) — task modal gets a seed picker.
- [docs/app-reference/08-modals-and-overlays/07-plant-assignment-modal.md](../app-reference/08-modals-and-overlays/07-plant-assignment-modal.md) — PlantOutSowingModal mirrors its shape.
- [docs/app-reference/99-cross-cutting/03-data-model-plants.md](../app-reference/99-cross-cutting/03-data-model-plants.md) — `plants.id` is the foreign key from packets.
- [docs/app-reference/99-cross-cutting/04-data-model-tasks.md](../app-reference/99-cross-cutting/04-data-model-tasks.md) — `inventory_items` is the target of plant-out.
- [docs/app-reference/99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — new weekly refill-scan cron.
- [docs/app-reference/99-cross-cutting/19-rls-patterns.md](../app-reference/99-cross-cutting/19-rls-patterns.md) — home-scoped RLS.

## Data model

```sql
-- 1. Packets — what you own.
CREATE TABLE public.seed_packets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  plant_id              int  REFERENCES public.plants(id) ON DELETE SET NULL,

  variety               text,                          -- "Sungold", "Boltardy"
  vendor                text,                          -- "Suttons", "Real Seeds", "Free from neighbour"
  purchased_on          date,
  opened_on             date,
  sow_by                date,
  quantity_remaining    text,                          -- "~50 seeds", free text

  notes                 text,
  is_archived           boolean NOT NULL DEFAULT false,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX seed_packets_home_idx    ON public.seed_packets (home_id);
CREATE INDEX seed_packets_sow_by_idx  ON public.seed_packets (home_id, sow_by);
CREATE INDEX seed_packets_plant_idx   ON public.seed_packets (plant_id);

-- 2. Sowings — every tray / pot / paper-towel test sown from a packet.
--    Replaces the original plan's `seed_germination_tests` table — a "test"
--    is just a sowing the user doesn't plant out.
CREATE TABLE public.seed_sowings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES public.homes(id) ON DELETE CASCADE,
  seed_packet_id        uuid NOT NULL REFERENCES public.seed_packets(id) ON DELETE CASCADE,

  sown_on               date NOT NULL,
  sown_count            int  NOT NULL CHECK (sown_count > 0 AND sown_count <= 1000),

  -- Set when the user logs an observation. NULL means "haven't checked yet".
  observed_on           date,
  germinated_count      int  CHECK (germinated_count IS NULL OR (germinated_count >= 0 AND germinated_count <= sown_count)),

  -- Lifecycle: sown → germinated → planted_out OR discarded.
  status                text NOT NULL DEFAULT 'sown'
                          CHECK (status IN ('sown', 'germinated', 'planted_out', 'discarded')),
  planted_out_at        date,                          -- stamped when status moves to planted_out
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX seed_sowings_packet_idx ON public.seed_sowings (seed_packet_id, sown_on DESC);
CREATE INDEX seed_sowings_home_idx   ON public.seed_sowings (home_id);

-- 3. Inventory-items link back to the sowing they came from.
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS from_sowing_id uuid REFERENCES public.seed_sowings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS inventory_items_from_sowing_idx
  ON public.inventory_items (from_sowing_id) WHERE from_sowing_id IS NOT NULL;

-- 4. Computed-on-read latest germination rate per packet.
CREATE OR REPLACE VIEW public.seed_packets_with_germination AS
SELECT
  sp.*,
  latest.observed_on                                  AS latest_germination_observed_on,
  latest.rate_pct                                     AS latest_germination_rate_pct,
  latest.sown_count                                   AS latest_germination_sample_size,
  active.id                                           AS active_sowing_id,
  active.status                                       AS active_sowing_status,
  active.sown_count                                   AS active_sowing_sown_count
FROM public.seed_packets sp
LEFT JOIN LATERAL (
  -- Most-recent OBSERVED sowing (drives the viability chip).
  SELECT
    observed_on,
    sown_count,
    ROUND(100.0 * germinated_count / NULLIF(sown_count, 0)) AS rate_pct
  FROM public.seed_sowings
  WHERE seed_packet_id = sp.id
    AND germinated_count IS NOT NULL
  ORDER BY observed_on DESC NULLS LAST
  LIMIT 1
) latest ON TRUE
LEFT JOIN LATERAL (
  -- Most-recent IN-PROGRESS sowing (drives the "12 sown · awaiting germination" chip).
  SELECT id, status, sown_count
  FROM public.seed_sowings
  WHERE seed_packet_id = sp.id
    AND status IN ('sown', 'germinated')
  ORDER BY sown_on DESC
  LIMIT 1
) active ON TRUE;
```

**RLS:**

```sql
ALTER TABLE public.seed_packets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seed_sowings   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Home members read seed packets"
  ON public.seed_packets FOR SELECT TO authenticated
  USING (public.is_home_member(home_id));

CREATE POLICY "Members with shed.edit can mutate seed packets"
  ON public.seed_packets FOR ALL TO authenticated
  USING (public.has_permission(home_id, 'shed.edit'))
  WITH CHECK (public.has_permission(home_id, 'shed.edit'));

CREATE POLICY "Home members read sowings"
  ON public.seed_sowings FOR SELECT TO authenticated
  USING (public.is_home_member(home_id));

CREATE POLICY "Members with shed.edit can mutate sowings"
  ON public.seed_sowings FOR ALL TO authenticated
  USING (public.has_permission(home_id, 'shed.edit'))
  WITH CHECK (public.has_permission(home_id, 'shed.edit'));
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

(No Gemini calls — pure SQL scan.)

## Surfaces and where they slot

| Surface | Slot |
|---|---|
| `/shed` — Plants / Nursery toggle | A pill at the top of TheShed switches the grid between Plants (current) and the new Nursery list. |
| `AddSeedPacketModal` | New modal launched from "Add packets" on the Nursery view. Two steps: Library picker → details form. |
| `SeedPacketDetailModal` | Per-packet detail with sowings list + sparkline + actions (Log sowing / Edit / Archive). |
| `LogSowingModal` | Slim modal — sown date + count + notes + optional area. Creates a `seed_sowings` row. |
| `ObserveGerminationModal` | Modal — observed date + germinated count slider + notes. Updates the sowing. |
| `PlantOutSowingModal` | Modal — location + area + planted date + quantity. Creates an `inventory_items` row + flips the sowing to `planted_out`. |
| `/planner?tab=shopping` | Top-of-list banner: *"3 packets approaching sow-by"* with **Add refills** button. |
| Add Task / Edit Schedule modal | When task type is "Sow", a new **From your Nursery** picker shows matching packets. Optional — task still works without a packet selected. |
| Plant Edit Modal (Care Guide tab) | New "Seeds in your Nursery" pill when any packets exist for this `plant_id`. Tap → opens the matching packet detail modal. |

## Files to add

| File | Purpose |
|---|---|
| `supabase/migrations/<ts>_nursery.sql` | Packets + sowings + view + RLS + `inventory_items.from_sowing_id` |
| `supabase/functions/parse-seed-packets/index.ts` | AI free-text → packet rows |
| `supabase/functions/seed-refill-scan/index.ts` | Weekly cron |
| `src/components/nursery/NurseryTab.tsx` | List view with filters / sorts (lives inside `/shed`) |
| `src/components/nursery/AddSeedPacketModal.tsx` | Two-step add flow |
| `src/components/nursery/SeedPacketDetailModal.tsx` | Packet detail + sowings list + sparkline + action bar |
| `src/components/nursery/LogSowingModal.tsx` | Log one sowing |
| `src/components/nursery/ObserveGerminationModal.tsx` | Update sowing with germinated count |
| `src/components/nursery/PlantOutSowingModal.tsx` | Create inventory_items row from a sowing |
| `src/components/shopping/SeedRefillBanner.tsx` | Top-of-list banner |
| `src/services/nurseryService.ts` | Client service (queries the view, writes packets / sowings, plant-out helper) |
| `docs/app-reference/03-garden-hub/10-nursery.md` | New surface doc |
| `docs/app-reference/99-cross-cutting/33-data-model-nursery.md` | Cross-cutting data model entry |

## Files to modify

| File | Change |
|---|---|
| `src/components/TheShed.tsx` | Plants/Nursery toggle, mount `<NurseryTab>` when active |
| `src/components/AddTaskModal.tsx` | When `taskType === "Sow"`, show seed picker |
| `src/components/ShoppingLists.tsx` | Mount `<SeedRefillBanner>` |
| `src/components/PlantEditModal.tsx` | "Seeds in your Nursery" pill on Care Guide tab when packets exist for this plant |
| `src/lib/automationEngine.ts` | No change — the plant-out flow uses the existing `applyPlantedAutomations` entry point |
| `docs/app-reference/03-garden-hub/01-the-shed.md` | Document the new toggle + Nursery view |
| `docs/app-reference/04-planner/05-shopping-lists.md` | Document the refill banner |
| `docs/app-reference/99-cross-cutting/10-edge-functions-catalogue.md` | Add `parse-seed-packets` + `seed-refill-scan` |
| `docs/app-reference/99-cross-cutting/11-cron-jobs.md` | Add `seed-refill-scan-weekly` |
| `docs/app-reference/00-INDEX.md` | Add new docs |

## The plant-out lifecycle in detail

The mechanic that makes the Nursery worth more than a glorified spreadsheet.

```
seed_packets (1) ─┐
                  ├── seed_sowings (N) ──→ inventory_items (N rows or 1 multi-quantity row)
plants    (1) ────┘                       (status='Planted', growth_state='Seedling',
                                           from_sowing_id=..., quantity=N)
```

**State machine on `seed_sowings.status`:**

| From | Trigger | To | Side effects |
|------|---------|----|--------------|
| (insert) | `LogSowingModal` save | `sown` | Row created. Packet's "active sowing" chip lights up. |
| `sown` | `ObserveGerminationModal` save | `germinated` | `germinated_count` + `observed_on` set. Packet's "latest rate" chip updates. |
| `germinated` | `PlantOutSowingModal` save | `planted_out` | `planted_out_at` stamped. `inventory_items` row inserted with `from_sowing_id`. `AutomationEngine.applyPlantedAutomations` fires. |
| `sown` or `germinated` | **Discard** button | `discarded` | Notes optional. Counts against viability over time. |

**Why a single `inventory_items` row, not N?**

`inventory_items` already has a `quantity` field used by the existing Plant Assignment Modal — sowing 16 tomato seedlings into a bed produces one row with `quantity=16`, not 16 rows. The Nursery follows the same convention so the rest of the app (Garden Layout, Task Engine, Care Guide tab, Companions) behaves identically for nursery-graduated plants and direct-assigned plants.

If the user wants to split (e.g. 6 seedlings into one bed, 10 into another), they Plant Out twice, each time selecting a fraction of `germinated_count`. The sowing flips to `planted_out` once the cumulative quantity equals germinated; otherwise it stays `germinated` with a "8 left to plant out" chip until the user finalises.

**Garden-side reverse lookup.**

A new "From the Nursery" badge appears on the Instance Edit Modal when `from_sowing_id` is non-null: *"Grown from a Sungold packet — sown Mar 10, 6 of 9 germinated."* Tap → opens the source packet's detail modal. This gives growers the full provenance chain.

## Use cases — Marcus (expert)

**Mid-January, planning the year**

Marcus has just received his 2026 seed haul from Suttons, Real Seeds and a swap with the allotment association. About 30 packets.

He opens `/shed`, toggles to Nursery, taps **Add packets** → **Paste a list**:

```
Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)
Tomato Brandywine (Real Seeds, sow-by 2027-12, ~25 seeds)
Beetroot Boltardy (Suttons, sow-by 2027-09, ~100 seeds)
... 27 more lines
```

The AI parser turns it into 30 candidate rows. He confirms. The Library catalogue rows for each plant are auto-ensured behind the scenes (no Gemini cost for those because Perenual returns the data).

**Late February — first sowing day**

He taps **Sungold** → packet detail → **Log a sowing**. Sown count: 12. Notes: "south windowsill, peat-free compost". Status: `sown`. Saves.

He opens his sow blueprint and ticks it complete → app prompts: *"Log this as a sowing? Tomato Sungold — sown 12"* → he taps Yes. (Or skips, since he just did it manually.) Follow-up prompt: *"Set a germination check for Mar 9?"* → one tap → scheduled.

**Mar 9 — germination check fires**

Notification taps through to ObserveGerminationModal pre-filled with Sungold. He counts 9 of 12 → updates. Sungold's chip on the Nursery list updates to "Last sowing 75% (Mar 9)" with a green pill. Status: `germinated`.

**Mid-May — first planting day**

Frost risk gone. He taps Sungold → packet detail → **Plant out**. Picks Back Bed, planted date today, quantity 9, nickname blank. Saves.

App creates an `inventory_items` row: status `Planted`, growth_state `Seedling`, quantity 9, area Back Bed, from_sowing_id pointing at the Feb sowing. `AutomationEngine.applyPlantedAutomations` runs — generates watering and pruning blueprints from Sungold's care defaults. Toast: *"9 Sungold seedlings added to Back Bed."*

He opens the new instance in the Shed → the Care Guide tab shows a "From the Nursery" badge: *"Grown from Suttons Tomato Sungold — sown Feb 26, 9 of 12 germinated."* Tap → bounces back to the packet detail.

**Sep — late-season planning**

He opens Nursery, sorts by **latest germination**. A 4-year-old packet of Brandywine shows 38% — flagged red. He archives it.

The Shopping List refill banner now shows: *"4 packets approaching sow-by — Brandywine (replaced), Pak Choi, Florence Fennel, Coriander"*. He hits **Add refills** → the four rows land in his current week's shopping list.

## Use cases — Sarah (amateur)

**A supermarket impulse buy**

Sarah grabs a packet of sunflower seeds at Sainsbury's. At home she opens the app, taps Add packets → searches Sunflower → picks the Perenual match → fills in vendor=Sainsbury's, sow-by from the packet, leaves quantity blank.

**Spring — she actually sows them**

She empties three seeds into a pot on the patio. Opens the app, Nursery → Sunflower → **Log a sowing**, sown=3. A week later she comes back: **Observe**, germinated=2.

When the seedlings are ~15 cm she taps **Plant out** → picks the front border → quantity 2 → confirm. Two sunflower seedlings now appear in her Shed with status Planted and growth_state Seedling. Care reminders kick in automatically.

She never thought of this as "managing seed inventory" — she just used the prompt the app gave her each step of the way.

## Edge cases / risks

- **Packets without a Library match** — `plant_id` is nullable. Plant-out is disabled for these (we'd be inserting an `inventory_items` row with no `plant_id` which breaks downstream). The detail modal nudges the user to "link this packet to a plant" via the Library picker before they can plant out.
- **Partial plant-outs** — see the dedicated note above. Sowing only flips to `planted_out` once cumulative quantity hits `germinated_count`.
- **Germination observation BEFORE plant-out** — if the user skips the Observe step and clicks Plant Out directly, the modal forces an `observed_on` + `germinated_count` first. Reuses the ObserveGerminationModal as a step-1 dialog.
- **Bulk paste of malformed lines** — the parser tolerates a wide grammar but kicks ambiguous lines back to the user as "needs review" before commit.
- **Shared homes** — every nursery row is home-scoped; any member with `shed.edit` can mutate. Audit log fires `EVENT.NURSERY_*` events.
- **Privacy** — vendor + variety go to Gemini in the parser. No PII concerns; vendor is a brand name.

## Tier gating

| Tier | What they see |
|---|---|
| Sprout | Full CRUD on packets + sowings + plant-out. **No** AI bulk paste parser (the strict-regex fallback works for hand-typed lines). No photo-OCR. |
| Botanist | Same as Sprout. |
| Sage | Full features incl. AI bulk-paste parsing + (v2) photo OCR. |
| Evergreen | Same as Sage. |

## Out of scope (v1)

- **Photo OCR** of a physical seed packet (v2).
- **Seed-saving workflow** — when a user's plant goes to seed, walking them through harvest and storage. Separate feature.
- **Local seed swap marketplace** — community / multi-home feature, larger scope.
- **Auto-deduction of `quantity_remaining`** based on sowings. Quantity stays free-text.
- **Auto-promotion from Seedling to Vegetative** when a planted-out seedling reaches some age. The existing `update-plant-states` cron handles growth-state transitions; nothing nursery-specific needed.

## Sequencing

1. Migration: packets + sowings + view + `inventory_items.from_sowing_id` + RLS.
2. Service module + a minimal Nursery list page (read-only) to verify the data model.
3. Add Packet modal + Library picker integration.
4. Log Sowing modal + Observe Germination modal — exercise the lifecycle through `germinated`.
5. **Plant Out modal** — the marquee flow. Creates `inventory_items`, fires AutomationEngine, transitions sowing to `planted_out`. Verify the instance lands in the Shed and care schedules generate.
6. "From the Nursery" badge on Instance Edit Modal (reverse lookup).
7. Sow-task picker integration in AddTaskModal.
8. Shopping list refill banner + cron.
9. AI bulk-paste parser (Sage+) — last because the rest works without it.
10. App-reference docs (new surface, data model, edge fns, cron).
11. E2E spec: add packet → log sowing → observe → plant out → verify instance + care tasks.
12. Release notes + deploy.
