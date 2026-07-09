# Pruning as a seasonal window task (like harvesting) + part-completion

**Date:** 2026-07-09 · **Ask:** treat seasonal pruning like harvesting — ONE window task per season (not a task every day), with harvest-style **part completion** (prune a bit, the task stays open until you fully mark it done).

## App-reference consulted
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — tasks/blueprints/ghosts + the Wave-20 harvest window model.
- [`08-modals-and-overlays/02-task-modal.md`](../app-reference/08-modals-and-overlays/02-task-modal.md) — the window footer (Harvested / Picked some / Not yet).
- [`04-planner/07-blueprint-manager.md`](../app-reference/04-planner/07-blueprint-manager.md) — recurring routines.

## Why pruning currently spams daily
`plantScheduleFactory` builds Pruning seasonal schedules **identically** to Harvesting — a seasonal `start_date`/`end_date` window with `frequency_days: 1`. But the WINDOW model is gated on `task_type`:
- `taskEngine.buildRenderTasks` window branch: `(task_type === "Harvesting" || "Harvest") && end_date` → emits **one** ghost across the window. Pruning falls to the frequency branch → a ghost **every day** of the season.
- `generate-tasks` cron **skips** harvest-with-`end_date` (frontend owns the window), but **materialises** pruning daily.
- `locationTaskCounts.isHarvestWindow` is type-gated too.

Everything else — `isInHarvestWindow`, `isTaskVisibleOnDate`, `isTaskOverdueToday`, dashboardStats `isWindowActiveOn`/`isOverdue`/`computeDayStrip`/`computeDoneToday`, the `window_end_date` overdue/visibility rules, calendar tinting (`collectHarvestWindowDates`), TaskList "in-window" amber styling — already keys on **`window_end_date`** (generic), so it works for any windowed task with **no change**.

## Approach

### A. Make seasonal pruning a window task (3 type-gated spots)
1. `src/lib/taskEngine.ts` `buildRenderTasks` — add `Pruning` to the window branch condition so a pruning blueprint with `end_date` emits ONE window ghost (`window_end_date` set), exactly like harvest.
2. `supabase/functions/generate-tasks/index.ts` — add `Pruning` to the harvest-skip so the cron stops materialising daily pruning rows (frontend owns the window).
3. `src/lib/locationTaskCounts.ts` — generalise `isHarvestWindow` → `isWindowType` to include `Pruning` (so a seasonal pruning counts once, and a completed one suppresses its ghost).

I'll factor the "is this a windowed seasonal type" test into one shared predicate (`isSeasonalWindowType(taskType)` covering Harvesting/Harvest/Pruning) used by all three, so it can't drift again.

### B. Part-completion UX for pruning (mirror harvest, minus yield)
Pruning has no *yield*, so it can't reuse the yield sheet / End-of-Life plant prompt. The harvest "stays open" mechanism is `snoozeFor(days)` → sets `next_check_at` (capped at window end), leaving the task **Pending** and in-window. I'll reuse exactly that.

- `src/components/TaskModal.tsx` — the footer selector (`isHarvestPending && isInWindow`) currently only fires for Harvesting. Add a **`PruningWindowFooter`** for `type === "Pruning" && status Pending && in-window`:
  - **"Done pruning"** (primary) → `onToggleComplete` (normal completion — no yield gate, no EOL).
  - **"Still pruning"** → snooze picker (3 / 5 / 7 days) via the same `snoozeFor` → keeps the task open. This *is* the "prune a bit, come back to it" part-completion.
  - **Delete task.**
  A **`PruningWindowClosedFooter`** (window elapsed, still Pending): **"Mark done"** (complete) / **"Mark missed"** (Skipped) — mirrors `HarvestWindowClosedFooter` without the yield path.
  (I'll extract the shared snooze/materialise logic so the two footers don't duplicate it.)
- `src/components/walk/WalkTaskRow.tsx` — its window footer is chosen on `!!window_end_date`; branch pruning to the pruning footer variant there too (Garden Walk).
- `src/components/TaskList.tsx` — generalise the completed-window chip: "**Pruning completed {date}**" (Scissors icon) alongside the existing "Harvest completed {date}" (Wheat). The completion path's harvest-only yield/EOL branch (`type === "Harvesting"`) stays harvest-only, so pruning just completes.

### C. Existing data (decision needed — see below)
Pruning blueprints already carry `end_date`, so the ghost engine change makes them window tasks immediately. But daily pruning rows the cron already **materialised** remain as real `tasks`. Options:
- **(Recommended) One-shot cleanup**: delete `Pending`, `is_auto_generated`… actually pruning tasks don't carry that flag on the task row — delete `Pending` pruning `tasks` that have a `blueprint_id` whose blueprint is a windowed pruning (`end_date` not null), EXCEPT keep the canonical window row if one exists. This mirrors the harvest cron-fix cleanup. Scoped, reversible-in-spirit (they regenerate as the window ghost).
- **(Alt) Leave them**: only new occurrences change; the user manually clears the stragglers.

## Files
- `src/lib/taskEngine.ts`, `src/lib/locationTaskCounts.ts`, `supabase/functions/generate-tasks/index.ts` — window model + a shared `isSeasonalWindowType` helper (likely in `src/lib/taskFilters.ts` + its Deno mirror, or a tiny shared constant).
- `src/components/TaskModal.tsx` — `PruningWindowFooter` + `PruningWindowClosedFooter` + footer selector branch.
- `src/components/walk/WalkTaskRow.tsx` — pruning footer branch.
- `src/components/TaskList.tsx` — generalised completed-window chip.
- (Optional) `supabase/migrations/<ts>_cleanup_daily_pruning.sql` — one-shot cleanup if we go with Recommended.

## Tests
- **Unit** `taskEngine.test.ts`: a Pruning blueprint with `end_date` emits ONE window ghost (not daily); without `end_date` still recurs by frequency.
- **Unit** `locationTaskCounts.test.ts`: open seasonal pruning counts 1; completed seasonal pruning → 0 (ghost suppressed).
- **Unit** `taskOverdue.test.ts` / `taskFilters`: pruning window not overdue in-window, overdue after close, visible across window.
- **Deno** `dashboardStats.test.ts`: pruning window spans in-window days; done-today counts a pruning completed today.
- **E2E** (extend `tasks`/`schedule` or a new `pruning-window.spec.ts`): open a seasonal pruning → "Still pruning" keeps it open → "Done pruning" completes it.
- **Docs**: `04-data-model-tasks.md` (window model now covers pruning), `02-task-modal.md` (pruning footer), the plan record.

## Risks
- **Breadth via `window_end_date`:** because most logic is already generic, the risk is a spot that *assumes* a windowed task is a harvest (e.g., yield). The completion yield/EOL path is explicitly `type === "Harvesting"`, so pruning won't trigger it. I'll grep for any `window_end_date` consumer that assumes yield.
- **Cleanup migration** (if chosen): must not delete non-pruning or non-windowed tasks. Scoped by `type IN ('Pruning')` + blueprint has `end_date`; verified on local first.
- Frequency-based pruning (no `end_date`) is unchanged — still a normal recurring routine.

## Rollout
One phase, one deploy, live-verified (seasonal pruning shows one window task; "Still pruning" keeps it open; "Done pruning" completes; dashboard counts it once) before finishing.

## Decisions (confirmed 2026-07-09)
1. **Part-completion actions** — approved: "Done pruning" + "Still pruning" (3/5/7-day snooze) + delete; closed-window "Mark done" / "Mark missed".
2. **Existing daily pruning rows** — approved: one-shot cleanup migration.

## Delivered (2026-07-09)

Shipped. Single source `src/lib/windowTasks.ts` (`isSeasonalWindowType`) used by the ghost engine window branch + `locationTaskCounts`; the `generate-tasks` Deno cron mirrors the set (`SEASONAL_WINDOW_TYPES`). New `PruningWindowFooter` / `PruningWindowClosedFooter` in `TaskModal` + selector branch; `WalkTaskRow` narrows its harvest strip to the harvest type (pruning windows use the walk's normal Complete/Postpone/Skip); TaskList completed chip generalised ("Pruning completed {date}", Scissors). One-shot cleanup `supabase/migrations/20260907000000_cleanup_daily_pruning_tasks.sql` (applied locally OK). Tests: engine one-window-ghost for pruning (+ frequency pruning still recurs), `locationTaskCounts` open/completed pruning window. Everything else (visibility, overdue, day-strip, done-today, calendar) is `window_end_date`-generic — no change, covered by existing tests.
