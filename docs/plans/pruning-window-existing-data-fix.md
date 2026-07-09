# Fix: completed pruning still counts + disappears (window-model transition)

**Date:** 2026-07-09 · **Reported (regression from OS 35.0046):** "1 of 2" where a **completed** pruning is (a) still counted in the total and (b) disappeared from view. Should be "1 of 1", pruning not counted, but still shown as completed.

## Root cause (reproduced live)
The pruning→window change assumed the window ghost is at the blueprint's `start_date` and is suppressed by a physical row **at that exact date**. But **pre-existing** pruning tasks (materialised daily by the old cron, then *completed* by the user) have:
- `due_date` = some day **inside** the window (e.g. 07-07), **not** the window start (07-04), and
- `window_end_date = NULL` (they were daily rows, never given the window field).

So today, for such a blueprint:
1. **Engine** (`buildRenderTasks`): the window ghost is `ghost-{bp}-{07-04}`; it's suppressed only if a row exists at `{bp}:07-04`. The completed row is at `{bp}:07-07` → no match → a **phantom window ghost is emitted** alongside the completed row.
2. **Count** (`locationTaskCounts`, fed by the `fetchDashboardData` query): the query fetches `due_date = today OR (due_date <= today AND window_end_date >= today)`. The completed row (due 07-07, `window_end_date = NULL`) matches **neither** → not fetched → doesn't suppress the ghost → **the ghost counts as pending** (inflates the total).
3. **Visibility:** the completed row's `updated_at`/`created_at` is an earlier day, so the engine's completed-task filter (`due-in-range OR completed-in-range`, today-only range) drops it → **"disappeared."**

Reproduced: `countForThisPrune = 1` (should be 0); engine returns both the completed row **and** a phantom `isGhost` window row; the query does **not** fetch the completed row.

My earlier cleanup migration only *deleted pending* daily pruning rows — it never gave existing pruning tasks the `window_end_date` that ties them to the window model (harvest's Wave-20 backfill did exactly that for harvest).

## Fix (three parts)

### 1. Engine — window-aware ghost suppression
In `buildRenderTasks`' seasonal-window branch, suppress the ghost if the blueprint already has **any** physical row whose `due_date` falls inside `[window_start, window_end]` (not just an exact `window_start` match) — plus the existing tombstone check. A window has at most one representative task; a completed/pending/snoozed row anywhere in the window means "don't emit a duplicate ghost." Fixes the phantom ghost regardless of which in-window day the row sits on.

### 2. Engine — keep a completed window task visible across its open window
In the completed-task filter, also show a completed task whose window still overlaps the range (`window_end_date >= startDateStr && due_date <= endDateStr`). So a pruning/harvest completed earlier in the window stays visible (as completed, with its "Pruning/Harvest completed {date}" chip) until the window closes, instead of vanishing the next day. Fixes "should still show in the completed."

### 3. Migration — backfill `window_end_date` onto existing pruning tasks
One-shot: for pruning tasks (Pending + Completed) of windowed pruning blueprints (`task_type='Pruning' AND end_date IS NOT NULL`) where `window_end_date IS NULL`, set `window_end_date = blueprint.end_date`. This makes existing completed pruning rows **in-window** so the `fetchDashboardData` query fetches them → they suppress the ghost in the **count** (which has no code change — it suppresses by `blueprint_id` once the row is fetched). Idempotent.

Together: count no longer includes the completed pruning (migration → row fetched → ghost suppressed); the phantom ghost is gone (engine window-aware suppression); the completed pruning stays visible in its window (engine visibility). Result: "1 of 1", pruning shown as completed.

## Files
- `src/lib/taskEngine.ts` — `buildRenderTasks`: window-aware suppression (#1) + completed-window visibility (#2). Both are `window_end_date`-generic, so they also benefit harvest (a harvest completed earlier in its window now stays visible too — an improvement, consistent with the chip).
- `supabase/migrations/<ts>_backfill_pruning_window_end_date.sql` — #3.

## Tests
- Unit `taskEngineOffline.test.ts`: (a) a completed in-window row at a **non-window-start** date suppresses the ghost (no phantom); (b) a completed window task stays in the rendered list while `window_end_date >= today` even when completed on an earlier day.
- Unit `locationTaskCounts.test.ts` already covers "completed in-window → 0" (relies on the row being fetched; the migration makes it fetchable — I'll add a note).
- Live: reproduce the exact scenario (windowed pruning + completed non-window-start row) → count 0, one completed row shown, no phantom ghost; then reconnect/refetch.

## Risk
- #1/#2 are `window_end_date`-generic → harvest gets the same (better) behaviour; existing harvest tests must still pass (they use window-start-aligned rows, which the superset suppression still catches).
- Migration is pruning-scoped, idempotent, only sets a NULL field — no data loss.

## Rollout
One phase, one deploy (incl. migration), live-verified before finishing.

## Delivered (2026-07-09)

Shipped. `buildRenderTasks`: (#1) window-aware ghost suppression via a per-blueprint `dueDatesByBlueprint` map — the ghost is suppressed if any real task sits anywhere in `[window_start, window_end]`; (#2) a completed window task stays in the rendered list while `window_end_date >= startDate && due_date <= endDate`. Migration `20260908000000_backfill_pruning_window_end_date.sql` backfills `window_end_date` onto existing non-Skipped pruning tasks of windowed blueprints (applied locally OK).

Verified live against the real DB (post-migration state = `window_end_date` set on the completed row): **count 0** (no longer pending) and the completed pruning **shows** (`isGhost: false`), no phantom ghost — i.e. "1 of 1", still visible as completed. Confirmed the pre-migration state (NULL `window_end_date`) is exactly why the count stayed 1, which the migration fixes.

Tests (so it can't recur): `taskEngineOffline.test.ts` +3 — (a) a completed task on a **non-window-start** in-window day suppresses the ghost (no phantom); (b) a completed window task stays visible while its window is open; (c) it drops off once the window closes. The 41 existing engine tests still pass (harvest gets the same, more-robust behaviour — the fix is `window_end_date`-generic).

**Note (test-authoring gotcha):** `public.tasks` has **no `updated_at` column** — the engine's "completed in window" check reads `updated_at || created_at || due_date`, and `created_at` is the real column. An early repro inserted `updated_at` and silently failed (supabase-js returns the error, doesn't throw), so the rows never persisted and the fix *looked* broken. Backdate `created_at`, never `updated_at`.
