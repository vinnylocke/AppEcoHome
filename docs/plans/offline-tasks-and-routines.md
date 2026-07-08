# Offline — one-off tasks visible everywhere + routines created offline

**Date:** 2026-07-08 · **Ask:** (1) an offline-created one-off task should appear in *all* task views immediately (not just after reconnect); (2) recurring routines (blueprints) should be creatable offline too.

## App-reference consulted

- [`99-cross-cutting/16-offline-queue.md`](../app-reference/99-cross-cutting/16-offline-queue.md) — the `db-write` queue + producer pattern I'll extend.
- [`99-cross-cutting/14-caching.md`](../app-reference/99-cross-cutting/14-caching.md) — the localStorage snapshot conventions (`rhozly:snap:v1:{name}:{scope}`) and why the task list is the one screen with no persistent cache today.
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — tasks / blueprints / ghosts model; the harvest-window dedup the engine must preserve.
- [`04-schedule/01-blueprint-manager.md`](../app-reference/04-schedule/01-blueprint-manager.md) — the routine surface (will need an offline note).

## Why today's behaviour is what it is

- **`TaskEngine.fetchTasksWithGhosts`** (`src/lib/taskEngine.ts`) fetches `tasks` + `task_blueprints` from the DB, then generates **ghost tasks in pure JS** from the blueprints (no DB calls), dedups harvest windows, and returns the list. Its only cache is an **in-memory `Map` with a 60 s TTL** — there is **no localStorage snapshot**. So offline, a cold open can't render any task view, and an offline one-off task (queued in Phase 3) has nowhere to show until a reconnected refetch.
- **Routines are gated online** because creating one chains: insert `task_blueprints` → read back its id → insert the first `tasks` row → call the **`generate-tasks` edge function** (`BlueprintService.generateBlueprintTasks`) to materialise future instances. The edge call can't run offline.

Two enabling facts make both asks tractable:
1. **Ghosts are generated purely in JS from the blueprint** — so a blueprint that merely *exists in the local list* produces its upcoming tasks with no server round-trip. Offline we can skip `generate-tasks` entirely; ghosts cover the display, and the daily cron / a reconnect call materialises real rows later.
2. **`tasks.id` and `task_blueprints.id` are both `uuid`** — the client can generate stable ids, so queued inserts replay idempotently (upsert) with no id remap, exactly like Phase 3/4.

## Approach

### Part A — a persistent task snapshot (the shared foundation for both asks)

Give the task engine the same instant-paint-then-revalidate cache every other screen already has.

- On every successful `fetchTasksWithGhosts`, write the **raw inputs** to `rhozly:snap:v1:tasks:{homeId}` via the existing `snapshotCache.ts`: `{ physicalTasks, blueprints }` (raw rows, pre-ghost). Range-independent — one snapshot per home.
- Refactor the pure-JS portion of `run()` (skipped-tombstone filter → harvest-window dedup → ghost generation → range filter) into a reusable `buildRenderTasks({ physicalTasks, blueprints, skipped, args })`. The **online path calls it unchanged** (no behaviour change — same output), and the **offline path calls it on the cached raw rows**.
- When the Round-1 fetch throws/errs **and** `isOffline()`, serve from the snapshot: run `buildRenderTasks` on the cached raw data and return a `FullResult` with an empty `inventoryDict` / `blockedTaskIds` (those need network — degrade gracefully; thumbnails + dependency badges fill in on reconnect). Never throw offline if a snapshot exists.

Result: **every** task view (Dashboard daily list, Schedule, Calendar, area/plant/plan-scoped lists) renders offline from the one shared snapshot.

### Part B — one-off task appears in all views (ask 1)

- Add `TaskEngine.injectOfflineTask(homeId, taskRow)`: push the row into the snapshot's `physicalTasks` and `invalidateCache(homeId)` so the next `peek`/fetch rebuilds from the snapshot.
- `AddTaskModal` offline one-off branch (already queues the insert) also calls `injectOfflineTask`. Because all views derive from the shared snapshot, the task shows everywhere immediately, and the queued insert syncs on reconnect (idempotent upsert reconciles).

### Part C — routines created offline (ask 2)

In `AddTaskModal`, replace the current online-only gate for the **new-recurring** path with an offline branch (the routine-**edit** path stays online — editing an existing blueprint is rarer and touches materialised rows):

- Client-generate `blueprintId = crypto.randomUUID()` and the first `taskId`.
- `insertOrQueue("task_blueprints", { id: blueprintId, ...payload })` then `insertOrQueue("tasks", { id: taskId, blueprint_id: blueprintId, ... })`.
- **Skip** `generateBlueprintTasks` offline (the edge fn) — ghosts render the recurrence. On reconnect the blueprint insert flushes; the daily `generate-tasks` cron (or a one-shot call we fire on reconnect) materialises real rows.
- Drop the online **conflict-detection** dup query offline (or check the cached blueprint list instead).
- `injectOfflineBlueprint(homeId, blueprintRow)` → push into the snapshot's `blueprints` so ghosts regenerate across all views instantly.

## Files to change

- `src/lib/taskEngine.ts` — extract `buildRenderTasks`; write/read the `tasks` snapshot; offline fallback; `injectOfflineTask` + `injectOfflineBlueprint`; `invalidateCache` already exists.
- `src/lib/snapshotCache.ts` — no change (reused); add `"tasks"` to the documented `name` set.
- `src/components/AddTaskModal.tsx` — offline one-off now injects; new-recurring path gains an offline branch.
- `src/components/TaskList.tsx` — no logic change expected (it already reads the engine); confirm the offline path surfaces cached rows instead of the error toast.
- **Tests:** unit for `buildRenderTasks` (same output as before on sample data) + `injectOfflineTask`/`injectOfflineBlueprint`; a Vitest for the offline-fallback read. Live Playwright: offline create one-off → appears on Dashboard + Schedule + Calendar; offline create routine → its ghosts appear; reconnect → both flush and reconcile.
- **Docs:** update `16-offline-queue.md` (one-off now injects; routines now queue), `14-caching.md` (new `tasks` snapshot), `04-schedule/01-blueprint-manager.md` (offline note), and the plan record.

## Risks / notes

- **Snapshot ↔ server divergence:** server stays authoritative; the reconnect refetch overwrites the snapshot, so an optimistic task/blueprint is reconciled with (or replaced by) the real row. Ghost ids are deterministic (`ghost-{blueprint_id}-{date}`) so no duplication when the real blueprint returns.
- **`generate-tasks` skipped offline:** acceptable — ghosts are the display layer and the cron/materialisation is idempotent on reconnect. Worst case a routine's *persisted* rows appear a little later; its *visible* tasks are immediate via ghosts.
- **Refactor safety:** `buildRenderTasks` must be a pure extraction — the online output has to be byte-identical, guarded by a unit test on representative data (incl. a harvest-window blueprint) so the dedup/window logic doesn't regress.
- **localStorage size:** one raw task+blueprint snapshot per home — well within budget (same scale as the shed cache).

## Rollout

One phase, one deploy, live-verified (offline create → visible everywhere → reconnect → synced) before finishing — matching the established session rhythm.

## Delivered (2026-07-08)

Shipped as planned. `TaskEngine` gained the `rhozly:snap:v1:tasks:{homeId}` snapshot (raw inputs) and a pure `buildRenderTasks` shared by the online + offline paths; the offline path serves it via a known-offline short-circuit **and** a thrown/returned-error fallback (a real network drop *throws*, so catching only returned errors wasn't enough — caught during live testing). `AddTaskModal` offline branch now injects one-off tasks and creates new routines (blueprint + first task queued, `generate-tasks` skipped). Verified end-to-end against a real DB: offline one-off + routine appear via the engine, reconnect flushes, blueprint + both tasks persist with the FK intact. Tests: `tests/unit/lib/taskEngineOffline.test.ts` (7) + the existing 41 engine tests confirm `buildRenderTasks` is byte-identical. Docs updated: `16-offline-queue.md`, `14-caching.md`, this plan + the master offline plan.
