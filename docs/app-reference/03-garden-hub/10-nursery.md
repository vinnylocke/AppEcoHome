# The Nursery

> The seed-side of The Shed — where unopened packets, in-progress sowings, and germinating seedlings live until they earn their place in the garden. Reached from a Plants / Nursery toggle on `/shed`. Seedlings *graduate* from the Nursery into the Shed via the Plant Out flow, which inserts a real `inventory_items` row linked back to the originating sowing.

**Route:** `/shed` (Plants / Nursery toggle near the title)
**Source files:**
- `src/components/nursery/NurseryTab.tsx` — packet list shell
- `src/components/nursery/AddSeedPacketModal.tsx` — single-packet add flow (two-step)
- `src/components/nursery/BulkPasteSeedPacketsModal.tsx` — multi-packet paste flow (two-step)
- `src/components/nursery/SeedPacketDetailModal.tsx` — packet hub + sowings list + actions
- `src/components/nursery/LogSowingModal.tsx` — log a sowing against a packet
- `src/components/nursery/ObserveGerminationModal.tsx` — record germinated count
- `src/components/nursery/PlantOutSowingModal.tsx` — sowing → `inventory_items` row
- `src/components/nursery/NurseryPacketPicker.tsx` — reusable picker (used by AddTaskModal)
- `src/components/nursery/NurseryPacketsForPlant.tsx` — Care Guide tab pill
- `src/components/shopping/SeedRefillBanner.tsx` — refill nudge on the Shopping List screen
- `src/services/nurseryService.ts` — all reads + writes + lifecycle helpers
- `src/lib/parseSeedPackets.ts` — bulk-paste regex fallback + edge-fn wrapper

---

## Quick Summary

A second view on `/shed` that lists seed packets the home owns. Each packet carries variety / vendor / sow-by / opened-on / quantity. Sowings (every batch sown from a packet) sit underneath in a status lifecycle: `sown → germinated → planted_out / discarded`. Plant Out is the marquee flow — it creates an `inventory_items` row (with `growth_state="Seedling"` and `from_sowing_id` linking back) and fires the standard `AutomationEngine.applyPlantedAutomations` so care schedules generate exactly like a normal Plant Assignment.

---

## Role 1 — Technical Reference

### Component graph

```
TheShed (Plants / Nursery toggle in the header)
└── NurseryTab (when toggle = "nursery")
    ├── Summary header (count, active sowings, approaching sow-by)
    ├── Action buttons
    │   ├── Paste a list      → BulkPasteSeedPacketsModal
    │   └── Add packets       → AddSeedPacketModal
    ├── Packet list
    │   └── NurseryRow ×N
    │       ├── Variety + plant name + scientific name
    │       └── Status chip (active sowing / latest rate / sow-by / vendor)
    │       └── Tap → SeedPacketDetailModal
    ├── AddSeedPacketModal (portal)
    │   ├── Step 1 — Pick plant (Shed search OR free-text "add later")
    │   └── Step 2 — Packet details (vendor, dates, quantity, notes)
    ├── BulkPasteSeedPacketsModal (portal)
    │   ├── Step 1 — Paste textarea + Parse button (AI for Sage+, regex otherwise)
    │   └── Step 2 — Review: editable rows + Save N packets
    └── SeedPacketDetailModal (portal)
        ├── Packet meta strip (vendor / dates / qty / notes)
        ├── Sowings list
        │   └── SowingRow ×N
        │       ├── Status chip (Awaiting / Ready to plant out / Planted out / Discarded)
        │       ├── Sown / observed / planted-out dates
        │       └── Action bar (Observe / Plant out / Discard)
        ├── Log Sowing button       → LogSowingModal
        ├── Archive / Restore       → packet flagged is_archived
        ├── ObserveGerminationModal (portal-inside-portal)
        └── PlantOutSowingModal (portal-inside-portal)
            ├── Location + Area chained selects
            ├── Quantity (defaults to remaining)
            ├── Planted date
            └── Optional nickname
```

### Props received

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | TheShed | Scope every read + write |
| `aiEnabled` | `boolean` | TheShed (from `App.tsx`) | Routes bulk-paste to Gemini vs the regex fallback |

### State (local)

| State | Purpose |
|-------|---------|
| `entries` | `NurseryListEntry[]` — packet + plant pairs from the view |
| `loading` / `error` | Initial fetch state |
| `showAddModal` / `showBulkPasteModal` / `activeEntry` | Open-modal flags |

### Data flow — read paths

#### 1. Packet list (`fetchNurseryPackets`)

- **Calls** `supabase.from("seed_packets_with_germination").select("*").eq("home_id", homeId).eq("is_archived", false).order(...)`.
- **When**: on mount + after any add / log / observe / plant-out / discard / archive (parent calls `load()` from the modal callbacks).
- **Output**: `SeedPacketWithGermination[]` (packet columns + latest germination chip data + active in-progress sowing snapshot).
- **Auth**: home-member read via RLS.
- **Caching**: none — fast query under the (home_id, is_archived) partial index.
- **N+1 follow-up**: one batched `supabase.from("plants").select("id, common_name, scientific_name").in("id", plantIds)` to hydrate species labels.

#### 2. Sowings per packet (`fetchSowingsForPacket`)

- **Calls** `supabase.from("seed_sowings").select("*").eq("seed_packet_id", id).order("sown_on", desc)`.
- **When**: on `SeedPacketDetailModal` mount + after every sowing-level write.
- **RLS**: home-member read via the home_id column.

#### 3. "Already planted out" count (`fetchPlantedOutTotal`)

- **Calls** `supabase.from("inventory_items").select("quantity").eq("from_sowing_id", id)`. Client sums.
- **When**: `PlantOutSowingModal` mount.
- **Why**: enforces the per-sowing cap on quantity (`germinated_count - alreadyPlanted`) without storing a derived column.

#### 4. Care-guide-tab pill (`NurseryPacketsForPlant`)

- **Calls** `seed_packets_with_germination` filtered by `home_id` + `plant_id`. Hides itself when empty.

#### 5. Shopping-list refill banner (`SeedRefillBanner`)

- **Calls** `seed_packets_with_germination` joined to `plants(common_name)`. Filters client-side for:
  - `latest_germination_rate_pct < 60`, OR
  - `sow_by` within 90 days (including past-sow-by), OR
  - `opened_on` older than 18 months.
- Computed on-read (no cron) — see the **Design notes** section below.

### Data flow — write paths

#### Add packet (`createSeedPacket`)

- Triggered by Step 2 of `AddSeedPacketModal`. Inserts `seed_packets` with the picked `plant_id` (or null for the "Add later" path).
- Logs `EVENT.NURSERY_PACKET_ADDED`.

#### Bulk paste (`parseSeedPackets` + `createSeedPacket` per row)

- `AddSeedPacketModal` calls `parseSeedPackets(text, { homeId, aiEnabled })` which routes Sage+ to the edge fn `parse-seed-packets` and others to the local regex.
- Review step lets the user edit every field inline; trash icon per row.
- Save iterates `createSeedPacket` per row with partial-success handling.

#### Scan a packet (`scanSeedPacket` + `createSeedPacket` + `uploadPacketImage`)

- Sage+ only. `ScanSeedPacketModal` captures a packet photo (Capacitor camera on native, file input on web), compresses to ~800px JPEG, calls `scan-seed-packet` edge fn.
- Edge fn returns `{ packet, confidence, unreadable? }`. Review step pre-fills with whatever Gemini extracted; surfaces a hint when confidence < high; switches to retake flow when unreadable.
- On Save: `createSeedPacket` inserts the row → `uploadPacketImage` puts the compressed JPEG at `seed-packet-images/{home_id}/{packet_id}.jpg` → `setSeedPacketImageUrl` patches the row's `image_url`. Storage upload failures are non-fatal — the packet still saves cleanly with `image_url = null`.
- The packet detail modal renders the scanned photo above the meta strip when `image_url` is present.

#### Log sowing (`logSowing`)

- `LogSowingModal` inserts `seed_sowings` at `status='sown'` with `sown_on` + `sown_count` + optional notes.

#### Observe germination (`observeSowing`)

- `ObserveGerminationModal` updates the row with `observed_on` + `germinated_count`, transitions to `status='germinated'`. Notes are *appended* (not overwritten) so historical context is preserved.

#### Plant out (`plantOutSowing`)

- `PlantOutSowingModal` calls the helper which:
  1. Re-reads `germinated_count` + sums existing `inventory_items.quantity` `WHERE from_sowing_id = X` (defence-in-depth — server-trust, doesn't rely on the modal's cached number).
  2. Inserts ONE `inventory_items` row with `from_sowing_id` FK + `growth_state="Seedling"` + the picked `quantity` + standard area/location fields.
  3. Transitions the sowing to `status='planted_out'` *only* once cumulative quantity hits `germinated_count`; otherwise leaves it at `germinated` so the user can finish later.
- After the helper returns, the modal fires `AutomationEngine.applyPlantedAutomations([item], areaId, plantedAt)`. Engine failures are caught and logged — the instance is still real, schedules can be wired later.

#### Discard (`discardSowing`)

- One-tap on a `sown` or `germinated` row. Optional reason appends to the notes.

#### Archive packet (`archiveSeedPacket` / `unarchiveSeedPacket`)

- `SeedPacketDetailModal` footer. `is_archived` flag toggles; the list view filters archived by default.

### Edge functions invoked

| Function | When | Tier | Notes |
|----------|------|------|-------|
| `parse-seed-packets` | Bulk paste, AI path | Sage+ | Gemini extracts up to 60 packet rows from free text. Server-side validates dates + caps strings. AI failure falls back to the client regex. |

No other Nursery flow calls an edge function — all reads / writes are direct Supabase via RLS.

### Cron / scheduled jobs that affect this surface

None. The original plan called for a weekly `seed-refill-scan` cron + `shopping_list_alerts` table; the implementation skipped both in favour of on-read computation by `SeedRefillBanner`. The user benefit is identical, no new schema, and we don't have push notifications wired to consume cron output anyway.

### Realtime channels

None — the parent calls `load()` on every modal callback so the list is always in sync.

### Tier gating

| Tier | What's gated |
|------|--------------|
| Sprout | Full CRUD on packets + sowings + Plant Out. **Bulk-paste** runs the strict regex parser only. **Scan-a-packet** is hidden (Gemini Vision required). |
| Botanist | Same as Sprout. |
| Sage | Bulk-paste runs Gemini. AI failures still fall back to regex. **Scan-a-packet** available — Gemini Vision OCR. |
| Evergreen | Same as Sage. |

### Beta gating

None.

### Permissions / role-based UI

Every read + write is gated by `is_home_member(home_id)` in RLS. The original plan referred to a `shed.edit` permission; the implementation goes with simple home-membership because nothing in the existing schema enforces `shed.edit` separately — every home member can manage seed packets the same way they manage plants.

### Error states

| State | Result |
|-------|--------|
| Packet list fetch fails | Inline error card with `Try again` button |
| Plant Out on a sowing where `germinated_count` is null | Helper throws `Observe the sowing first…`; modal surfaces it inline |
| Plant Out exceeding remaining quantity | Helper throws `Only N seedlings left…`; modal disables Save and shows the cap inline |
| Bulk paste returns 0 candidates | Modal stays on Step 1 with a tier-aware hint |
| `AutomationEngine.applyPlantedAutomations` fails post-Plant Out | Caught + logged; instance still real, user can wire schedules manually |
| Edge fn AI failure on Sage+ | Silent fall-through to regex parser |

### Performance notes

- Packet list uses the `seed_packets_home_idx` partial index (where `is_archived = false`) so the common-case query is O(log N).
- Plant hydration is one batched `IN` query — no N+1.
- The view's two LATERAL joins are cheap because both subqueries hit the `seed_sowings_packet_idx` and `seed_sowings_active_idx` partial indexes.
- Bulk paste caps at 60 candidates server-side AND client-side (regex slices). Saves iterate serially to keep RLS errors per-row recoverable.

### Linked storage buckets

None.

### Design notes

- **Why no `seed-refill-scan` cron?** The original plan called for a weekly cron writing into a `shopping_list_alerts` table. The implementation computes the same banner on-read using the `seed_packets_with_germination` view. The trade-off: no cross-device "alerted" state and no push notification hook — neither of which we use today. Re-add the cron if/when we wire push.
- **Why no `shed.edit` permission?** The existing RLS for `plants`, `inventory_items`, etc. uses simple home-membership. Adding a new permission key here would create a confusing split — a member could manage plants but not packets. Keep the surface symmetric.
- **Bulk-paste rows lose `plant_id`.** Free-text doesn't carry a Library link. Rows insert with `plant_id = null` and a notes stamp recording the parsed common name. The user attaches the catalogue plant later via the packet detail (required before Plant Out, which is the only flow that hard-needs a `plant_id`).

---

## Role 2 — Expert Gardener's Guide

### Why open this view

For a serious grower, the Nursery answers questions the rest of the app can't: *"Which packets are getting old?", "How did last year's Brandywines germinate?", "I've sown 12 — how many actually came up?"* For a beginner, it's quieter — a place to log a single sunflower packet so the app can nudge you in 14 months when it's getting tired.

Crucially, it's not just inventory. The Plant Out flow is what makes it earn its keep: graduated seedlings become real instances in your Shed, with the same care schedules they'd get if you'd assigned them from a Library search. The provenance chain stays intact — open the new instance in your Shed and a "From the Nursery" badge tells you which packet, which vendor, and how many of how many sprouted.

### Every flow on this view

#### 1. Browse your packets

- The list defaults to non-archived packets, sorted by sow-by ascending. Each row shows variety + plant + a status chip:
  - "12 sown · awaiting germination" — active sowing in `sown`.
  - "12 sown · ready to plant out" — active sowing in `germinated`.
  - "Last sowing 75%" — most-recent observed sowing (colour-coded — green ≥70%, amber 40–69%, red below).
  - "Sow-by Oct '26 · 132d left" — countdown when nothing's active.

#### 2. Add a packet

- **Step 1**: pick a plant from your Shed (with search) — or tick "Add later" to log the packet with just a name and link it to a real plant later.
- **Step 2**: variety, vendor, purchased date, opened date, sow-by, free-text quantity, notes. All optional.

#### 3. Bulk-paste a list

- Sage+ paste flow: dump a bunch of lines, AI extracts candidates, you review and save the batch. Each row is fully editable before commit.
- Sprout / Botanist regex flow: format is documented in the modal hint — `Tomato Sungold (Suttons, sow-by 2028-12, ~30 seeds)`. Looser formats get less reliable extraction.
- Both paths land in the same review step — same shape, same save flow.

#### 4. Log a sowing

- Open a packet → tap **Log sowing**. Choose date + count + optional notes. Sowing appears at status `sown`.

#### 5. Observe germination

- Tap **Observe** on a `sown` sowing. Slider + numeric input for how many came up. The packet's viability chip updates immediately. Status → `germinated`.

#### 6. Plant out

- Tap **Plant out** on a `germinated` sowing. Pick a location + area + planted date + how many. Save → a real plant instance lands in your Shed with growth-state `Seedling`, care schedules generate.
- **Partial plant-outs** are supported — plant 6 of 9 and the sowing stays at `germinated` with "3 still on the bench". Plant the remaining 3 in a different bed and the sowing finally graduates to `planted_out`.

#### 7. Discard

- Failed batches (no germination, damping off, lost tray) get **Discard**. The sowing stays in the history with the reason — counts against the packet's viability stats over time.

#### 8. Archive a packet

- Empty packets / out-of-rotation varieties get **Archive** from the packet detail. They disappear from the active list but the history's still queryable.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Variety | Free-text varietal name (e.g. "Sungold"). May be empty for very generic packets. |
| Plant name | The catalogue plant the packet is linked to. Empty for packets added via "Add later" / bulk-paste until you link them. |
| Vendor | Where the packet came from — supplier, friend, allotment swap. |
| Sow-by | The date printed on the back of the packet. Drives the refill nudge and the colour on the sow-by countdown chip. |
| Purchased / Opened | Free metadata — opened-on > 18 months ago is one of the refill-banner triggers. |
| Quantity remaining | Free text — "~30 seeds", "half a packet". Never auto-deducted. |
| Last sowing % | Latest *observed* sowing's `germinated_count / sown_count`. Drives the colour and the refill banner. |
| Active sowing chip | The most-recent sowing in `sown` or `germinated`. Drives the "awaiting germination" / "ready to plant out" chips. |
| Sowing status | `sown` → `germinated` → `planted_out` (or `discarded`). Lifecycle is one-way except for the `germinated` → `germinated` partial-plant-out case. |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout | Full CRUD; bulk-paste limited to the strict regex grammar. |
| Botanist | Same as Sprout. |
| Sage | Bulk-paste uses Gemini — looser formats welcome. AI failures still fall back to regex automatically. |
| Evergreen | Same as Sage. |

### New user vs returning user vs power user

- **Brand new** (Sarah): one-off packet via Add Packets. Never opens the Nursery again on purpose. Value comes from the refill banner pinging her 14 months later and the Care Guide pill on her Sunflower plant.
- **Returning** (small library): logs sowings, observes, plants out via the cycle the modals walk her through.
- **Power user** (Marcus): bulk-paste a season's worth of packets in one go; Care Guide pill on each plant shows which packets are in play; refill banner during weekly shop drives the order list.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Forgetting to link the catalogue plant on bulk-paste rows.** Plant Out won't work until you do — the detail modal nudges you.
- **Treating "discard" as undo.** It's not — discards stay in viability history. If you mis-clicked Plant Out, re-edit the resulting Shed instance instead.
- **Skipping the Observe step.** Plant Out requires a `germinated_count` to know the cap; the modal forces an Observe first if you haven't done one.

### Recommended workflows

- **January seed haul:** Bulk-paste your whole order → review → save. Pop the catalogue plant on each packet later as you decide which to grow.
- **Sowing day:** Open the packet → Log sowing. Optionally pre-schedule a germination check via the AddTask flow.
- **Day of germination:** Notification fires (when wired) → Observe → numbers in.
- **Planting-out day:** Plant out → choose area → care schedules auto-generate.

### What to do if something looks wrong

- **A sowing's "ready to plant out" but the button is disabled** — the packet has no `plant_id`. Open the packet, link it to a Shed plant via the picker, retry.
- **Bulk-paste extracted the wrong fields** — every row is fully editable on the review step. Fix inline, save.
- **Refill banner won't go away** — dismiss it with the X (sessionStorage), or add the refills to a list (auto-dismisses).

---

## Related reference files

- [The Shed](./01-the-shed.md) — host surface (Plants / Nursery toggle lives here)
- [Plant Edit Modal](../08-modals-and-overlays/06-plant-edit-modal.md) — "Seeds in your Nursery" pill on Care Guide tab
- [Instance Edit Modal](../08-modals-and-overlays/08-instance-edit-modal.md) — "From the Nursery" badge on Details tab
- [Plant Assignment Modal](../08-modals-and-overlays/07-plant-assignment-modal.md) — Plant Out modal mirrors its area-picker shape
- [Shopping Lists](../04-planner/05-shopping-lists.md) — refill banner host surface
- [Data Model — Nursery](../99-cross-cutting/33-data-model-nursery.md) — `seed_packets`, `seed_sowings`, view, FK
- [Edge Functions Catalogue](../99-cross-cutting/10-edge-functions-catalogue.md) — `parse-seed-packets`
- [RLS Patterns](../99-cross-cutting/19-rls-patterns.md) — `is_home_member`-based gating

## Code references for ongoing maintenance

- `src/components/nursery/` — every UI component
- `src/services/nurseryService.ts` — all reads + writes + lifecycle helpers
- `src/lib/parseSeedPackets.ts` — bulk-paste parser (regex fallback + AI wrapper)
- `supabase/functions/parse-seed-packets/index.ts` — Sage+ Gemini parser
- `supabase/migrations/20260624000500_nursery.sql` — schema (packets, sowings, view, FK, RLS)
- `tests/unit/lib/parseSeedPackets.test.ts` — 16 cases covering the regex grammar
