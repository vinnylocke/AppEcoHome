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

## Bulk add — paste + CSV upload (RHO-4 Phase 3)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-030 | ✅ | Regex path (Sprout/Botanist) — paste 3 lines → `bulk-paste-parse` → 3 review rows | — | ✅ Passing |
| NURSERY-031 | ✅ | Bulk save inserts 3 rows; link-by-name links Tomato + Basil to seeded plants, Sunflower stays unlinked; toast "Added 3 packet…" | — | ✅ Passing |
| NURSERY-032 | ✅ | Inline edit variety → save → packet has edited variety | — | ✅ Passing |
| NURSERY-033 | ✅ | AI parse path (Sage+) — mocked edge fn returns 1 row, review shows AI source label | `parse-seed-packets` edge fn | ✅ Passing |
| NURSERY-034 | ✅ | RHO-4: mode toggle (Paste / Upload CSV); CSV mode "Download template" emits `rhozly-seed-packets-template.csv` | — | ✅ Passing |
| NURSERY-035 | ✅ | RHO-4: CSV upload → review rows; bad date row flagged + excluded; valid partial `sow_by` (`2028-12`) resolves to `2028-12-31`; Save counts only the valid row | — | ✅ Passing |
| NURSERY-036 | ✅ | RHO-4: CSV import creates packets; `plant_name` "Tomato" links to the seeded plant; unknown plant stays unlinked with name preserved in notes; favourite-flagged row lands in `user_favourite_seed_packets` | — | ✅ Passing |
| NURSERY-037 | ✅ | RHO-4: free-text paste still reaches the shared review step (Mark-all + per-row favourite visible) | — | ✅ Passing |

**Page object:** `NurseryPage.ts` — added `bulkPasteModePaste` / `bulkPasteModeCsv` / `csvTemplateDownload` / `csvFileInput` / `bulkPasteFavouriteAll` / `bulkPasteFileIssues` locators + `uploadCsv()`, `bulkPasteRowFavourite()`, `bulkPasteRowErrors()` helpers.
**Testids added:** `bulk-paste-mode-toggle`, `bulk-paste-mode-paste`, `bulk-paste-mode-csv`, `csv-template-download`, `csv-file-input`, `csv-parse-error`, `bulk-paste-favourite-all`, `bulk-paste-file-issues`, `bulk-paste-row-N-favourite`, `bulk-paste-row-N-errors`, `bulk-paste-back`, `bulk-paste-close`.

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

## Cross-home favourites — seed packets (Phase 3, FINAL)

**Spec file:** `tests/e2e/specs/favourites.spec.ts` (Section FAV-NU). **Fixtures:** `15_favourites.sql` 0019 segment (see [01-seeded-fixtures.md](./01-seeded-fixtures.md)). The Nursery is a hub tab since Stage 4 — `NurseryPage.goto()` deep-links `/shed?tab=nursery`; the scope chips (All / ♥ Favourites) remain component state.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| FAV-NU-001 | ✅ | Favourites scope lists seeded fixtures (Cherokee Purple live dedupe + Sensation Mix tombstone); every card shows the "Saved variety" chip; first-visit hint banner shows + dismisses | — | ✅ Passing |
| FAV-NU-002 | ✅ | Hearting toggles a Home-tab packet's favourite (seeded Cherokee Purple pre-filled); un/re-favourite round-trips; card appears in Favourites scope | — | ✅ Passing |
| FAV-NU-003 | ✅ | Seeded Cherokee Purple — heart pre-filled on Home tab; "In this home" (no add button) on Favourites | — | ✅ Passing |
| FAV-NU-004 | ✅ | "Add to this home" recreates the Sensation Mix packet in the active home; card flips to "In this home"; copy visible on the Home tab | — | ✅ Passing |
| FAV-NU-005 | ✅ | Packet hearts are UNGATED — a forced-Sprout viewer's heart on any packet is enabled (packets have no source → no tier lock) | Sprout route intercept | ✅ Passing |
| FAV-NU-006 | ✅ | (W1 only) Favourite packets persist across a home switch while the add-state recomputes (Cavolo Nero in the second home) | — | ✅ Passing |

## Hub-tab promotion (Stage 4, 2026-07-21)

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NURSERY-060 | ✅ | `/shed?tab=nursery` hub tab active; "Add seeds" (`nursery-add-seeds-btn`) opens the action sheet; "Type one in" (`nursery-add-packets` on the sheet row) opens AddSeedPacketModal | — | ✅ Passing |
| NURSERY-061 | ✅ | Inline search (`nursery-search-input`) filters packet rows live (variety match, no-match → 0 rows, clear → all) | — | ✅ Passing |
