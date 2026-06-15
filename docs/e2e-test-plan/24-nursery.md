# 24. The Nursery (Seed Packets + Sowings + Plant Out)

**Spec file:** `tests/e2e/specs/nursery-lifecycle.spec.ts`
**Page Object:** `tests/e2e/pages/NurseryPage.ts`
**Seed dependencies:** None dedicated — each test wipes `seed_packets` + `seed_sowings` + leftover Nursery `inventory_items` (those with `from_sowing_id NOT NULL`) in `beforeEach` via a Node-side authenticated Supabase client. Tests seed their own state through the UI or direct INSERTs.
**App-reference:** [03-garden-hub/10-nursery.md](../app-reference/03-garden-hub/10-nursery.md), [99-cross-cutting/33-data-model-nursery.md](../app-reference/99-cross-cutting/33-data-model-nursery.md)

## Browse + add packets

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-001 | ✅ | Plants / Nursery toggle visible on `/shed` | — | ✅ Passing |
| NURSERY-002 | ✅ | Empty state shows `nursery-empty` + `nursery-add-empty` + `nursery-paste-empty` | — | ✅ Passing |
| NURSERY-003 | ✅ | Add Packet — Shed-pick path: search Shed → pick plant → Next → variety + vendor + sow-by → Save → row at "Sow-by …" status | — | ✅ Passing |
| NURSERY-004 | ✅ | Add Packet — Free-text "add later" path (tick `add-seed-packet-freetext-toggle`); `plant_id=null`, Plant Out gated | — | ✅ Passing |

## Sowing lifecycle

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-010 | ✅ | Log Sowing creates an active sowing (`packet-detail-log-sowing` → fill count → Save → `STATUS_LABEL.sown` chip) | — | ✅ Passing |
| NURSERY-011 | ✅ | Observe Germination flips status — slider 9 of 12 → "Ready to plant out" chip + "75% sprouted" | — | ✅ Passing |
| NURSERY-012 | ✅ | Discard sowing → Discarded chip; action bar hidden | — | ✅ Passing |

## Plant Out — marquee flow

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-020 | ✅ | Plant Out creates `inventory_items` row with `from_sowing_id`, `growth_state=Seedling`, `quantity=9` | — | ✅ Passing |
| NURSERY-021 | ✅ | Partial plant-out (6 of 9) keeps sowing at "germinated" with "3 still on the bench" hint when re-opened | — | ✅ Passing |
| NURSERY-022 | ✅ | Plant Out fires AutomationEngine — `plantOutSowing` returns even with no matching `plant_schedules` rows (non-fatal try/catch) | — | ✅ Passing |
| NURSERY-023 | ✅ | Plant Out disabled when `packet.plant_id` is null — `sowing-{id}-link-plant` shown instead | — | ✅ Passing |
| NURSERY-024 | ✅ | "From the Nursery" badge surfaces on InstanceEditModal — `instance-from-nursery-badge` with sown date + germination count | — | ✅ Passing |

## Bulk paste

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-030 | ✅ | Regex path (Sprout/Botanist) — paste 3 lines → `bulk-paste-parse` → 3 review rows | — | ✅ Passing |
| NURSERY-031 | ✅ | Bulk save inserts rows with `plant_id = null`; toast "Added 3 packet…" | — | ✅ Passing |
| NURSERY-032 | ✅ | Inline edit variety → save → packet has edited variety | — | ✅ Passing |
| NURSERY-033 | ✅ | AI parse path (Sage+) — mocked edge fn returns 1 row, review shows AI source label | `parse-seed-packets` edge fn | ✅ Passing |

## Task + Care Guide integration

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-040 | ✅ | AddTaskModal — Planting type reveals `nursery-packet-picker` | — | ✅ Passing |
| NURSERY-041 | ✅ | Picking a packet pre-fills task title | — | ✅ Passing |
| NURSERY-042 | ✅ | Care Guide tab pill — `care-guide-nursery-packets` visible when packet exists for that plant | — | ✅ Passing |

## Shopping list refill banner

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-050 | ✅ | Banner renders when packet sow_by within 90 days + active list exists | — | ✅ Passing |
| NURSERY-051 | ✅ | "Add to {list}" — toast "Added N packet refill…"; list grows by N | — | ✅ Passing |
| NURSERY-052 | ✅ | Banner hidden when no refills due / no active list | — | ✅ Passing |
