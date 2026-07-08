# Offline — routine editing + task-dependency linking

**Date:** 2026-07-08 · **Ask:** the two paths still gated online in `AddTaskModal` — editing an existing routine, and linking a task dependency — should also work offline.

## App-reference consulted
- [`08-modals-and-overlays/01-add-task-modal.md`](../app-reference/08-modals-and-overlays/01-add-task-modal.md) — the modal's write paths (the surface I'm changing).
- [`99-cross-cutting/16-offline-queue.md`](../app-reference/99-cross-cutting/16-offline-queue.md) — the `db-write` queue + `updateOrQueue`/`insertOrQueue` producer API.
- [`99-cross-cutting/04-data-model-tasks.md`](../app-reference/99-cross-cutting/04-data-model-tasks.md) — ghost materialisation + the `unique_blueprint_date` constraint.

## Findings
- **Routine edit** (`existingBlueprint` branch) is a single `task_blueprints` UPDATE by uuid id. It touches no materialised rows and doesn't call `generate-tasks` — ghosts just regenerate from the changed blueprint. So it's a clean `updateOrQueue`.
- **Dependency linking** (`selectedDepTask`): `task_dependencies.id` is uuid; `ensurePhysicalTask` (ghost → physical) is a plain task insert. Both are client-uuid-able and queueable.

## Approach (extend the existing offline branch in `handleSubmit`)

Drop the `if (existingBlueprint || selectedDepTask) requireOnline(...)` gate and handle both:

1. **Routine edit** — build the same update payload the online path uses; `updateOrQueue("task_blueprints", updates, { column: "id", value: existingBlueprint.id }, "Edit routine")`; re-inject the merged blueprint (`{ ...existingBlueprint, ...updates }`) into the snapshot so its ghosts refresh. Toast + `onSuccess`; return.
2. **Dependency linking** — after the offline one-off / routine create (which already yields a client `createdTaskId`):
   - if `selectedDepTask.isGhost`: materialise offline — build a physical task row with a client uuid (ghost's blueprint_id + due_date + fields), `insertOrQueue("tasks", …)`, `injectOfflineTask`, use that uuid as the dep target; else use `selectedDepTask.id`.
   - `insertOrQueue("task_dependencies", { id: crypto.randomUUID(), task_id, depends_on_task_id }, "Task link")` with the same `waiting_on`/`blocks` orientation as online.

`injectOfflineBlueprint` / `injectOfflineTask` will be made **replace-by-id** (dedupe then prepend) so an edit updates in place instead of duplicating in the snapshot; harmless for creates (no existing id).

## Files to change
- `src/lib/taskEngine.ts` — make `injectOfflineBlueprint` / `injectOfflineTask` replace-by-id.
- `src/components/AddTaskModal.tsx` — offline branch: add routine-edit + dependency-linking (incl. offline ghost materialisation).
- **Tests:** extend `tests/unit/lib/taskEngineOffline.test.ts` — inject replaces an existing id rather than duplicating. Live Playwright: offline edit a routine → change reflected in ghosts → reconnect → blueprint row updated; offline link a dependency (incl. a ghost target) → reconnect → `task_dependencies` row present with the materialised task.
- **Docs:** `16-offline-queue.md` + `01-add-task-modal.md` (edit + linking now offline); plan records.

## Risks
- **Ghost-materialisation race (rare):** if the daily `generate-tasks` cron materialises the *same* (blueprint_id, due_date) server-side between the offline link and reconnect, our queued materialise-insert hits `unique_blueprint_date` and dead-letters — the dependency would then reference a task id that wasn't inserted. Acceptable: dependencies are a soft ordering hint, it needs an exact same-date collision, and the queue logs the dead-letter. (No change to the online path, which has the same materialise-then-link shape.)
- **Blocked-state display:** offline we return empty `blockedTaskIds` (deps need a network round-trip), so a newly-linked task won't show greyed/blocked until the reconnect refetch. Cosmetic.

## Rollout
One phase, one deploy, live-verified (offline edit + link → reconnect → synced) — established rhythm.

## Delivered (2026-07-08)

Shipped. `injectOfflineTask`/`injectOfflineBlueprint` are now replace-by-id (so an edit updates in place). `AddTaskModal`'s offline branch dropped the `requireOnline` gate and handles routine edit (`updateOrQueue` + re-inject) and dependency linking (offline ghost materialisation + queued `task_dependencies`). Verified end-to-end vs a real DB: offline edit changed the blueprint's ghost cadence (7→2 days), offline link to a ghost materialised the target and queued the dependency; on reconnect the queue drained and the DB showed the updated blueprint, the materialised task, and the dependency row — all FKs intact. Tests: +2 in `taskEngineOffline.test.ts` (replace-by-id); the 41 engine tests still pass. Docs updated: `16-offline-queue.md`, `01-add-task-modal.md`.
