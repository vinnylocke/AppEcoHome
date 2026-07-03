# RHO-21 — Selecting a yield amount on a multi-instance harvest copies it to every instance at full value

**Jira:** RHO-21 · Bug · Sprout tier · v34.0001. **Status: triage / plan only — do NOT implement.**

## Problem (reporter)
A harvesting task linked to MORE THAN ONE plant instance: completing it / logging a
yield of "3" results in the dashboard "this week" harvest panel showing a MULTIPLIED
figure ("33"). Expected: the amount you enter is the TOTAL for the task, not duplicated
onto each instance at full value.

## Root cause — exact, with file:line

It is **numeric multiplication (`value × instanceCount`), not string concatenation, and
not a display double-count.** The yield is written once *per linked instance, each row
carrying the full entered value*, and every downstream sum adds those N rows.

**The single write site** — `HarvestPartialPickSheet` ("Picked some"):
- `src/components/HarvestPartialPickSheet.tsx:70-81` — `const numericValue = parseFloat(value)` then a
  loop `for (const instanceId of instanceIds) { await insertYieldRecord({ ..., value: numericValue, ... }) }`.
  So a task linked to 2 instances inserts **2 rows of value 3** (not 1 row of 3). The file's
  own header comment (lines 16-19) documents this as intentional: *"One yield_records row is
  inserted per linked instance, all with the same value + unit + note."*
- `src/services/yieldService.ts:21-43` — `insertYieldRecord` inserts exactly the row it's handed
  (numeric `value`), plus a best-effort `plant_journals` row. No apportionment.
- DB column is numeric: `supabase/migrations/20260504000000_yield_recorder.sql:11` —
  `value numeric(10,3) NOT NULL CHECK (value > 0)`. And the input is `parseFloat`'d before insert
  (`HarvestPartialPickSheet.tsx:70`, `YieldTab.tsx:80`). **Rules out string concat** — "3 → 33"
  is `3 + 3` summed across two instance rows (or `3 × N` for N linked instances), surfaced as a
  single panel number, which *reads* like "33".

**The sum that surfaces it** — dashboard "this week" panel:
- `supabase/functions/home-dashboard-stats/index.ts:289-293` —
  `totalYieldByUnit[y.unit] = (totalYieldByUnit[y.unit] ?? 0) + (y.value ?? 0)` over every
  `yield_records` row → adds all N per-instance rows → N× the true total.
- `src/components/HomeDashboard.tsx:114-116` builds the `yieldSummary` string from that map (pure display, correct given its input).
- `plantInstancesHarvested` (`index.ts:286-288, 380`) counts *distinct* `instance_id`s, so that
  stat is unaffected — only the **summed total** (`totalYieldByUnit`) is inflated.
- The same inflation shows in Task Detail's "Picked so far in this window" running total
  (`TaskModal.tsx:1479-1515`), which sums the same per-instance rows.

**Entry points that reach the buggy sheet** (all pass the full `inventory_item_ids` array as `instanceIds`):
- Task Detail → `HarvestWindowFooter` "Picked some" → `HarvestPartialPickSheet`
  (`TaskModal.tsx:1449, 1576-1584, 1637-1645`).
- Garden Walk → `WalkTaskRow` "Picked some" → `HarvestPartialPickSheet`
  (`walk/WalkTaskRow.tsx:104, 350-363, 469-479`).

**Note on the "Harvested" path:** the plain "Harvested" button (`TaskModal.tsx:1562 onComplete`,
`WalkTaskRow.tsx:137 handleHarvested`) only completes the task + opens `HarvestEndOfLifePrompt`
(`HarvestEndOfLifePrompt.tsx`) — it does **not** insert yield rows. So the inflation is specific
to the "Picked some" partial-pick flow (the one where you "select a yield amount"). The single-
instance manual `YieldTab` form (`YieldTab.tsx:77-83`) inserts one row and is correct.

## App-reference consulted
- `docs/app-reference/02-dashboard/13-garden-walk.md` (line 123 already documents "one `yield_records`
  row per linked instance" — this doc encodes the bug and must be corrected).
- `docs/app-reference/02-dashboard/01-dashboard-tab.md`, `15-weekly-overview.md`, `16-head-gardener.md`
  (the "this week" harvest/yield panel fed by `useHomeDashboardStats` → `home-dashboard-stats`).
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` (harvest window model + `inventory_item_ids` multi-link).
- No dedicated yield/harvest data-model cross-cutting file exists; `yield_records` is described inline
  in the dashboard refs and `docs/yield-recorder-plan.md`.

## Recommended fix

**Contract:** the entered amount is the TOTAL for the task, split across the linked instances.
Keep the **one-row-per-instance** data model (so per-instance drill-in / `YieldTab` history and
`plantInstancesHarvested` stay meaningful) but each row carries `value / N`, so the dashboard
sum equals the entered total.

1. **Split in `HarvestPartialPickSheet`** (`HarvestPartialPickSheet.tsx:66-95`):
   - Treat the input as the task total. On submit, `const per = total / instanceIds.length` and
     insert one row per instance with `value: per` (respecting `numeric(10,3)` — round each to 3dp;
     to avoid the sum drifting off the entered total by rounding, put the rounding remainder on the
     last instance so `Σ per === total`). Update the toast to read the total, not the per-instance value.
   - Rewrite the misleading header comment (lines 16-19) to describe the split.
2. **UI decision (see open question):** for v1, ship the equal-split of a single **total** field
   (minimal, matches the reporter's "3 = total" expectation). Optionally add a "Split evenly across
   N plants" helper line + a disclosed per-instance override (an editable value per instance that
   defaults to `total/N`) — the reporter explicitly floated per-instance entry. Recommend total-only
   for v1, per-instance override as a fast-follow.
3. **Pull the split into a pure helper** for testability, e.g. `src/lib/yieldSplit.ts`
   `splitYieldEvenly(total: number, n: number): number[]` (n rows summing exactly to `total`,
   each ≥ 0, 3dp) — used by the sheet.
4. **Dashboard sum needs NO change** once rows sum to the total — `index.ts:289-293` becomes correct
   by construction. `TaskModal.tsx` running total likewise self-corrects.

## Prod data cleanup — YES, needed
Existing over-counted rows are already persisted on Sprout (prod). Any harvest logged via
"Picked some" against a multi-instance task wrote N rows of the full value. A one-off backfill
migration should divide historical duplicated rows by their instance count. This is **fiddly**:
`yield_records` has no `task_id`, so we can't perfectly reconstruct which rows were a single
partial-pick split across instances vs. genuinely separate per-instance harvests. Options:
- **(a) Conservative:** identify groups of rows with identical `(home_id, value, unit, notes,
  harvested_at)` across different `instance_id`s (the sheet writes them in the same sub-second loop
  with identical value/unit/note) → collapse each group to `value/groupSize` per row.
- **(b) Leave history, fix forward only** — acceptable if product judges the historical dashboard
  total non-critical (it's a lifetime/weekly stat, not a transactional record).
Recommend (a) with a tight match window on `harvested_at` (e.g. same second). Flag as an open
decision for product — the backfill is best-effort by nature.

## Tests
- **Unit (Vitest)** `tests/unit/lib/yieldSplit.test.ts`: `splitYieldEvenly` — N=1 returns `[total]`;
  N=2 of 3 → `[1.5, 1.5]`; a total that doesn't divide evenly (e.g. 10/3) sums exactly to the total
  with the remainder on the last row; 3dp rounding respected; N=0 guarded.
- **Unit (Vitest)** extend `tests/unit/lib/yieldService.test.ts` only if the split moves through the
  service; otherwise it stays a pure-helper test.
- **E2E (Playwright)** `tests/e2e/specs/`: a harvest task linked to 2 instances → "Picked some" →
  enter total 3 → assert two `yield_records` rows of 1.5 (or assert the dashboard "this week" yield
  reads 3, not 6). Needs a seeded multi-instance harvest task (see seed note below).
- **Deno** `supabase/tests/dashboardStats.test.ts`: no logic change to `computeHarvestCounts`, but add
  an assertion that `totalYieldByUnit` equals the sum of row values (guards against future re-inflation
  if the split regresses) — this exercises the edge function's aggregation, not the sheet.

## Docs to update
- `docs/app-reference/02-dashboard/13-garden-walk.md:123` — correct "one row per linked instance
  [at full value]" → "one row per instance at `total/N` (equal split)".
- Dashboard refs (`01-dashboard-tab.md`, `15-weekly-overview.md`, `16-head-gardener.md`) — note the
  yield total is the sum-of-splits, i.e. the task total, in the yield-panel field description.
- `docs/e2e-test-plan/` — add the multi-instance partial-pick row(s) + status; update
  `docs/e2e-test-plan/01-seeded-fixtures.md` if a new seeded multi-instance harvest task/UUID is added.
- `TESTING.md` inventory + counts for the new `yieldSplit.test.ts` (and E2E spec if new).

## Seed dependency
The E2E test needs a **harvest-window task whose `inventory_item_ids` has ≥ 2 entries** — check
`supabase/seeds/03_tasks_blueprints.sql`; if none exists, add one (two of the seeded inventory items),
and record it in `01-seeded-fixtures.md`.

## Risks / edge cases
- **Rounding drift:** naive `Math.round(total/N, 3)` per row can under/over-sum; the remainder-on-last
  approach keeps `Σ = total` exactly — this is the crux of the helper's tests.
- **`unit: "count"`** (discrete items): an even split can yield fractional counts (e.g. 3 tomatoes over
  2 plants → 1.5 each). `numeric(10,3)` allows it and the dashboard total stays correct; per-instance
  history shows 1.5 which is odd but truthful. Per-instance override (v1.1) is the clean answer for
  discrete crops — worth flagging to product.
- **`CHECK (value > 0)`:** with a tiny total and large N a per-row value could round to 0 and violate
  the constraint — clamp/guard in the helper (e.g. minimum representable 0.001, or reject N > total×1000).
- **Single-instance tasks unaffected:** `total/1 = total`, identical to today.
- **`YieldTab` manual single-instance form unchanged** — it's already correct (one instance, one row).

## Open questions for product
1. **v1 UI: equal-split of one total field, or per-instance entry?** Recommend total-only + equal split
   for v1 (minimal, fixes the reporter's case); per-instance override as fast-follow. Reporter suggested
   per-instance is acceptable — confirm scope.
2. **Prod backfill:** run the best-effort dedup/divide (option a), or fix-forward only (option b)?
