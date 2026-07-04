# Harvest completion → yield prompt + split/per-plant choice

## Problem / goal
Marking a **Harvesting** task complete does not prompt for a yield, and there is no way to choose whether a total is **split evenly across the linked plants** or entered **per plant**. Today:
- Yield is only captured via the **"Picked some"** button (partial pick), which lives only in the Task detail modal + walk row.
- "Picked some" **always auto-splits** the total evenly across linked instances (RHO-21) — no per-plant entry, no choice.
- The **"Harvested" / mark-complete** action (all surfaces) just closes the task + runs the End-of-Life prompt; it never asks for a yield.

**Chosen behaviour** (confirmed with user):
1. **Prompt for a yield whenever a harvest task is completed**, on **every** completion surface (dashboard Today's tasks, walk flow, calendar, task detail modal).
2. When the task links to **>1 plant**, offer a **toggle**: *One total (split evenly)* **or** *Enter an amount per plant*. 1 plant → single input, no toggle.

## App-reference consulted
- `docs/app-reference/08-modals-and-overlays/02-task-modal.md` — HarvestWindowFooter, "Harvested" vs "Picked some" actions.
- `docs/app-reference/99-cross-cutting/04-data-model-tasks.md` — `tasks.inventory_item_ids` (uuid[]) links a task to N instances; harvest detection.
- (Yield write path) `src/services/yieldService.ts`, `src/lib/yieldSplit.ts`, `tests/unit/lib/yieldSplit.test.ts`.

## Current wiring (from trace)
- Harvest detection: `task.type === "Harvesting"`; window via `task.window_end_date`.
- Instances: `task.inventory_item_ids: string[]` (inventory_items ids).
- Yield write: `insertYieldRecord({ home_id, instance_id, value, unit, notes })` → one `yield_records` row (value has a `> 0` CHECK) + best-effort journal. `instance_id` is required, so unlinked harvests can't carry a yield_record.
- Split: `splitYieldEvenly(total, n)` → number[] summing to total (remainder on last).
- Completion surfaces + harvest branches:
  - `src/components/TaskModal.tsx` — "Harvested" (final) `onComplete` (~1560-1574); "Picked some" opens `HarvestPartialPickSheet` (~1577).
  - `src/components/walk/WalkTaskRow.tsx` — `handleHarvested()` (~137-147); "Picked some" (~471).
  - `src/components/TaskList.tsx` — single `toggleTaskCompletion()` harvest branch (~904-917) + bulk (~417-429); dashboard Today's tasks renders TaskList.
  - `src/components/TaskCalendar.tsx` — confirm its harvest-complete path and hook it too.

## Approach

### 1. Generalise the sheet → `HarvestPartialPickSheet` gains a `mode` + per-plant entry
Extend the existing sheet (keep the file/name to limit churn) rather than duplicate:
- New prop `mode: "partial" | "final"` (default `"partial"` = today's behaviour, snooze + `onLogged`).
- New prop `instances: { id: string; name: string }[]` (replaces the single `plantName` for per-plant labels). Surfaces pass what they have; the sheet **falls back to fetching names** by `inventory_item_ids` (single `inventory_items` select) when a caller only has ids.
- **Entry mode toggle** (only when `instances.length > 1`): `total | perPlant`.
  - `total`: existing single input → `splitYieldEvenly`.
  - `perPlant`: one numeric input per instance (labelled by plant name), shared unit; each row inserts its own value (skip blanks/zeros — the `> 0` CHECK).
- `mode: "final"`: hide snooze; primary button "Log yield & complete"; add secondary **"Skip — nothing to log"**; on submit/skip call new `onComplete()` (write rows if any, then let the caller finish completion). `mode: "partial"` unchanged (snooze + `onLogged`).
- Extract the row-building into a pure helper for testability (see §3).

### 2. Central gate hook `useHarvestYieldGate` (keeps "everywhere" DRY)
New `src/hooks/useHarvestYieldGate.tsx`:
- Returns `{ requestHarvestComplete(task, complete: () => void|Promise<void>), sheet: ReactNode }`.
- `requestHarvestComplete`: if `task.type === "Harvesting"` **and** `inventory_item_ids.length >= 1` → open the sheet in `final` mode; on submit/skip write the yield rows, then run `complete()`. If not a harvest, or unlinked (0 instances) → call `complete()` directly (no prompt; unlinked has no instance to attribute — consistent with RHO-16).
- Each surface renders `{sheet}` once and routes its harvest-complete path through `requestHarvestComplete(task, existingComplete)`. `existingComplete` is the surface's current completion (which already marks Completed + queues the End-of-Life prompt), so **order is: yield sheet → write yields → complete → EOL prompt**.

### 3. Pure helper + tests
- Add `buildHarvestYieldRows(opts)` to `src/lib/yieldSplit.ts` (or new `src/lib/harvestYield.ts`): given `{ mode, total?, perPlant?: Record<id,number>, instanceIds, unit, notes }` → `NewYieldRecord[]` (partial, minus home_id), reusing `splitYieldEvenly` for `total`. Unit-test both modes, remainder handling, zero-skipping, and sum-equals-total for split.

### Files to change
- `src/components/HarvestPartialPickSheet.tsx` — mode + per-plant toggle + name fetch + `onComplete`.
- `src/hooks/useHarvestYieldGate.tsx` — **new**.
- `src/lib/yieldSplit.ts` (or new `harvestYield.ts`) — `buildHarvestYieldRows` pure helper.
- `src/components/TaskModal.tsx`, `src/components/walk/WalkTaskRow.tsx`, `src/components/TaskList.tsx`, `src/components/TaskCalendar.tsx` — route harvest completion through the gate.

## Edge cases
- **1 instance** → single input, no toggle (split of 1 = the value).
- **0 instances (unlinked)** → no prompt, just complete (no instance to attribute; matches RHO-16).
- **Skip** → complete with no yield rows.
- **Bulk complete** (TaskList) → gate per harvest task in the selection (sequential sheets) or a single "log later" fast-path; **decision: bulk completes without per-task prompts** (a queue of modals is hostile) and shows a toast "Yields not logged for N harvests — open each to add." Single completes prompt. (Confirm in review.)
- Value CHECK `> 0` — skip zero/blank rows in both modes.

## Risks / alternatives
- **Churn across 4 surfaces** — mitigated by the gate hook (surfaces change by ~one call each).
- Alternative considered: prompt only in modal + walk (rejected — user chose "everywhere").
- Alternative: separate new `HarvestYieldSheet` component (rejected — duplicates the entry/unit/validation UI; extending keeps one source of truth).

## Tests / docs (mandatory)
- **Unit**: `tests/unit/lib/*` for `buildHarvestYieldRows` (both modes, remainder, zero-skip, sum==total). Keep existing `yieldSplit.test.ts` green.
- **E2E**: extend `tests/e2e/specs/harvest-window.spec.ts` — complete a multi-instance harvest → sheet appears → split path and per-plant path both write; single-instance path; skip path. Update the harvest Page Object with the new testids.
- **Seeds**: ensure a seeded harvest task links ≥2 instances (`03_tasks_blueprints.sql` / fixtures) so the toggle is exercised; update `docs/e2e-test-plan/01-seeded-fixtures.md` if a fixture changes.
- **data-testid**: `harvest-yield-mode-total` / `-perplant`, `harvest-yield-perplant-<instanceId>`, `harvest-yield-complete`, `harvest-yield-skip`.
- **App-reference to update**: `08-modals-and-overlays/02-task-modal.md` (Harvested now prompts for yield + toggle), the walk-row + Today's-tasks + calendar surface files (completion now prompts), and `99-cross-cutting/04-data-model-tasks.md` (yield-on-completion note). Update `docs/e2e-test-plan/` harvest surface rows.

## Not doing
- No DB migration (yield_records + split already exist).
- No change to "Picked some" partial-pick behaviour beyond gaining the per-plant toggle.
- No home-level yield for unlinked harvests (out of scope; RHO-16 territory).

## Deploy
Frontend-only → `npm run deploy`, **+1 bump**. Release note: yes — user-facing improvement ("Log your harvest yield when you complete a harvest task, split across plants or per plant").
