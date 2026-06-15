# PR 8 — Nursery lifecycle + integrations E2E (Section 25 — NURSERY-001..052)

## Goal

Close the Nursery section of [`docs/e2e-test-plan.md`](../e2e-test-plan.md) — all 20 rows currently sit at `⏳ Not yet written`. PR 8 covers the **complete Nursery** in one go: lifecycle (browse → add → sow → observe → plant out → "From the Nursery" badge) PLUS the cross-surface integrations (bulk paste, AddTaskModal picker, Care Guide pill, Shopping refill banner).

## Scope decision

Original plan proposed splitting into PR 8 (lifecycle) + PR 9 (integrations). User opted to ship all 20 in one PR for coherence — the integrations are smaller and don't warrant their own batch when the test infrastructure (Page Object, fixtures, wipe pattern) is already in place.

## App-reference files consulted

- [`docs/app-reference/03-garden-hub/10-nursery.md`](../app-reference/03-garden-hub/10-nursery.md) — UX contract + flow surface map
- [`docs/app-reference/99-cross-cutting/33-data-model-nursery.md`](../app-reference/99-cross-cutting/33-data-model-nursery.md) — `seed_packets` + `seed_sowings` schema, `inventory_items.from_sowing_id` FK, RLS policies, `seed_packets_with_germination` view
- [`docs/app-reference/99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) (cross-link only — covered in PR 9)
- No app-reference file for `LogSowingFromTaskModal` yet — only PR 9 touches that path

## What I found in the code

- 13 Nursery components in `src/components/nursery/` already carry **comprehensive `data-testid` coverage** — 84 testids across the surface, no retrofit work needed.
- Key entry points:
  - `NurseryTab.tsx` → `nursery-tab`, `nursery-list`, `nursery-row-{id}`, `nursery-add-empty`, `nursery-paste-empty`, `nursery-add-packets`, `nursery-paste-packets`, `nursery-empty`
  - `AddSeedPacketModal.tsx` → `add-seed-packet-modal`, two-step flow (`add-seed-packet-next` → `add-seed-packet-save`), shed search (`add-seed-packet-shed-search`, `add-seed-packet-shed-option-{id}`), free-text (`add-seed-packet-freetext-toggle`, `add-seed-packet-freetext-name`)
  - `SeedPacketDetailModal.tsx` → `seed-packet-detail-modal`, `packet-detail-log-sowing`, `sowing-row-{id}`, `sowing-{id}-observe`, `sowing-{id}-plant-out`, `sowing-{id}-discard`, `sowing-{id}-link-plant`
  - `LogSowingModal.tsx` → `log-sowing-modal`, `log-sowing-date`, `log-sowing-count`, `log-sowing-save`
  - `ObserveGerminationModal.tsx` → `observe-germination-modal`
  - `PlantOutSowingModal.tsx` → has testids (need exact map)
- Page Object [`tests/e2e/pages/ShedPage.ts`](../../tests/e2e/pages/ShedPage.ts) already exists and supports the `shed-view-nursery` / `shed-view-plants` toggle (used by SHED-DSC tests).
- The Nursery surface mounts inside `TheShed` when the user flips the view toggle. No URL routing — just a state toggle.

## Files I'll change

| File | Change |
|---|---|
| `tests/e2e/specs/nursery-lifecycle.spec.ts` (new) | The 12 NURSERY-001..024 tests |
| `tests/e2e/pages/NurseryPage.ts` (new) | Page Object encapsulating tab + modal selectors |
| `src/components/nursery/PlantOutSowingModal.tsx` | Add any missing `data-testid`s the spec needs (modal id, area select, qty input, save button) — touch-up only |
| `src/components/InstanceEditModal.tsx` | Add `data-testid="instance-from-nursery-badge"` on the existing badge (if it's not there yet) |
| `docs/e2e-test-plan.md` | Flip NURSERY-001..024 from `⏳ Not yet written` → `✅ Passing` |
| `TESTING.md` | Add the new spec to the inventory; bump test counts |

**No new seed file.** Tests create their own state (packet → sowing → observe → plant out) and clean it up in `afterEach`. This matches the user-flow nature of the surface — there's no "stale packet on a shelf" worth seeding.

## Approach — per test

| ID | What it asserts | How |
|---|---|---|
| NURSERY-001 | Plants / Nursery toggle visible on `/shed` | Navigate to `/shed`, assert `shed-view-plants` + `shed-view-nursery` both visible |
| NURSERY-002 | Empty state CTAs | Click `shed-view-nursery` (no packets exist after `beforeEach` wipe) → `nursery-empty`, `nursery-add-empty`, `nursery-paste-empty` visible |
| NURSERY-003 | Add Packet — Shed pick path | Add → search "Basil" → pick from `add-seed-packet-shed-list` → Next → fill variety/vendor/sow-by → Save → row appears in `nursery-list` |
| NURSERY-004 | Add Packet — Free-text path | Add → toggle `add-seed-packet-freetext-toggle` → type "Sunflower" → Next → save → row appears, sowings start gated on Plant Out |
| NURSERY-010 | Log Sowing creates a sowing | Open packet → `packet-detail-log-sowing` → fill count = 12, sown today → Save → `sowing-row-{id}` visible with status chip |
| NURSERY-011 | Observe Germination flips status | After NURSERY-010 → `sowing-{id}-observe` → set 9/12 → Save → status chip updates, "75%" text visible |
| NURSERY-012 | Discard sowing → Discarded chip | After NURSERY-010 → `sowing-{id}-discard` → confirm → row shows Discarded chip, observe/plant-out actions hidden |
| NURSERY-020 | Plant Out creates inventory_items with from_sowing_id | NURSERY-011 chain → `sowing-{id}-plant-out` → pick Location + Area → qty 9 → Save → sowing status flips to `planted_out`. Verify via Shed: open the new instance, badge present. |
| NURSERY-021 | Partial plant-out keeps "germinated" + remaining count | NURSERY-011 chain → plant out 6/9 → re-open Plant Out modal → "3 still on the bench" hint visible |
| NURSERY-022 | Plant Out fires AutomationEngine — care schedules generate | After NURSERY-020 → navigate to `/schedule` → assert at least one blueprint linked to the new inventory item is visible (filter via the BP card containing the plant name) |
| NURSERY-023 | Plant Out disabled when packet.plant_id is null | NURSERY-004 chain (free-text packet) → log sowing → observe → `sowing-{id}-plant-out` is disabled, `sowing-{id}-link-plant` is visible |
| NURSERY-024 | "From the Nursery" badge on Instance Edit Modal | After NURSERY-020 → navigate to `/shed` Plants view → click the new instance → assert `instance-from-nursery-badge` |

## Test isolation strategy

Each test runs against a freshly wiped Nursery state:

```ts
test.beforeEach(async ({ authenticatedPage }) => {
  // Wipe packets + sowings for this worker's home via service-role REST.
  // Sowings cascade from packets; inventory_items.from_sowing_id is SET NULL.
  await supabaseAdmin.from("seed_packets").delete().eq("home_id", homeId);
});
```

To verify NURSERY-022 (AutomationEngine side-effect), I'll poll the `task_blueprints` table for ~5 s after Plant Out completes, then assert via the UI. Falls back to a Page Object helper if the engine is slow.

To verify NURSERY-024 (the badge), the badge component is already wired into `InstanceEditModal.tsx`. I'll add the `data-testid="instance-from-nursery-badge"` if it's not already on the badge element.

For NURSERY-020 + 024, the inventory_items row gets a freshly generated UUID — I'll find it via `from_sowing_id = {known-sowing-id}` once Save completes, then navigate to the Shed and click it.

## Determinism notes

- The Nursery surface lives inside `TheShed` (no URL change on toggle), so all tests start with `await shed.goto()` then `await shed.clickViewToggle("nursery")` (or similar Page Object helper).
- Each test's full chain runs sequentially within the single test body (Add → Log → Observe → Plant Out). No multi-test orchestration where one test depends on another's stored UUID — Playwright runs tests in arbitrary order.

## Risks

1. **PlantOutSowingModal selector audit** — I haven't fully read its 395 lines yet. May need 1-3 testid additions for area picker / qty input / save button. Touch-up only.
2. **Race conditions on Plant Out → AutomationEngine** — the schedule generation is fire-and-forget; NURSERY-022 may need a generous timeout or a poll. Documenting this clearly.
3. **InstanceEditModal "From the Nursery" badge** — exists in spec but may not yet carry a `data-testid`. One Edit addition if missing.
4. **`beforeEach` wipe vs running parallel tests inside the same spec file** — Playwright runs spec files in parallel but tests within a file sequentially, so `beforeEach` per test is safe.

## Approach — added integration tests

| ID | What it asserts | How |
|---|---|---|
| NURSERY-030 | Bulk paste — regex parse | `nursery-paste-empty` → `bulk-paste-textarea` → fill 3 lines (`"Tomato Sungold\nBasil 'Sweet Genovese'\nSunflower (Giant)"` parse) → `bulk-paste-parse` → 3 `bulk-paste-row-*` visible |
| NURSERY-031 | Bulk save inserts rows | After parse → `bulk-paste-save` → toast confirms; `nursery-list` has 3 new rows |
| NURSERY-032 | Inline row edit flows through | Paste 1 line → parse → edit variety field inline → save → packet detail shows edited variety |
| NURSERY-033 | AI parse path (mocked) | Mock `parse-seed-packets-ai` edge fn → paste unstructured text → parse → assert review rows came from the AI source label |
| NURSERY-040 | AddTaskModal Nursery packet picker on Planting | Pre-seed 1 packet → open AddTaskModal (`/schedule` → `blueprint-new-btn`) → change Task Type to "Planting" → `nursery-packet-picker` visible |
| NURSERY-041 | Picking a packet pre-fills the title | Pick from `nursery-packet-picker-select` → assert task title input populated with "Sow {variety}" pattern |
| NURSERY-042 | Care Guide tab pill shows packets | Pre-seed 1 packet for plant 1000002 (Basil) → open Basil's PlantEditModal → Guides tab → assert `care-guide-nursery-packets` visible |
| NURSERY-050 | Refill banner renders when packets need refill | Pre-seed packet with `sow_by = today + 30 days` (within 90-day trigger) → navigate to `/shopping` → `seed-refill-banner` visible |
| NURSERY-051 | "Add refills" pushes items into the active list | Tap `seed-refill-banner-add` → toast confirms "Added N packet refill" → active shopping list item count increases |
| NURSERY-052 | Banner hides without refills | Wipe Nursery → `/shopping` → `seed-refill-banner` not present (count 0) |

## Approach — test isolation + setup

- Use the authenticated Supabase session directly (RLS allows the test user to mutate their own home's packets) — no service role needed.
- `test.beforeEach` wipes `seed_packets` for this worker's home (sowings cascade; `inventory_items.from_sowing_id` SET NULLs).
- For tests that need pre-existing packets (NURSERY-040, 042, 050, 051), call a Page Object helper `nursery.createPacket({ plant_id, variety, vendor, sow_by, ... })` that hits the supabase-js client. This is faster + more deterministic than running the UI add flow.
- For NURSERY-051, also wipe + reseed the shopping list state via service-role / direct insert so the banner has a target list.
- For NURSERY-052, wipe everything and assert non-presence (`toHaveCount(0)`).

## Acceptance

- `npx tsc --noEmit` + `npm run build` clean
- `npx playwright test nursery-lifecycle.spec.ts --workers=1` → 12/12 passing
- No regression on `shed-discovery.spec.ts` (which already touches the view toggle)
- `docs/e2e-test-plan.md` NURSERY-001..024 flipped to ✅, `TESTING.md` inventory bumped
- One commit: `test(e2e): PR 8 — Nursery lifecycle (NURSERY-001..024)`

## App-reference files to update

- [`docs/app-reference/03-garden-hub/10-nursery.md`](../app-reference/03-garden-hub/10-nursery.md) — no change needed; existing doc accurately describes the flow being tested. (If I find any drift between code and doc while writing tests, I'll fix it in the same PR per the planning rule.)
