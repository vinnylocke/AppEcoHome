# Offline Queue — Mechanics, Kinds, Replay

> A localStorage-backed write queue. When the user makes changes while offline (or while a sync fails), the action is stashed locally and replayed when connectivity returns or via the QueuedActionsBadge.

---

## Quick Summary

```
User action ──► supabase write ──┬── success (90%)
                                 └── failure / offline ──► queue item appended to localStorage
                                                            │
                                                            └── flush on online + startup + backoff timer + manual tap
                                                                ├── success → drop from queue
                                                                ├── permanent failure (PostgREST code / 4xx, or 8 attempts) → drop (dead-letter)
                                                                └── network-shaped failure → stop pass, retry with capped backoff
```

Queue lives at `localStorage.rhozly_offline_queue_v1`. Drained via `flushQueue()` (`src/lib/offlineQueue.ts`); `useOfflineQueue().flush()` is the manual entry point.

---

## Role 1 — Technical Reference

### Queue item shape

Items are a discriminated union `QueuedWrite` — one variant per `kind`, with strongly-typed fields (no generic `payload` blob). All variants share `BaseQueued`:

```ts
{
  id: string,                 // `${Date.now()}-${random}` — not a uuid
  queuedAt: number,           // ms epoch
  userId?: string | null,     // auth user stamped at enqueue (from the auth listener)
  attempts?: number,          // incremented on each transient failure
  lastError?: string | null,  // last failure message
}
```

### Kinds

| Kind | Operation | Producer |
|------|-----------|----------|
| `task-status` | Update `tasks.status` / `completed_at` / `completed_by` | `TaskList`. Before enqueueing, TaskList **replaces** any existing queued `task-status` item for the same task (`getQueue()` + `remove()`) — a refetch while offline repaints the task as Pending, so a second tap used to stack a duplicate item instead of superseding the first. |
| `task-postpone` | Update `tasks.due_date` | none wired (legacy shape; use `db-write` for new work) |
| `journal-add` | Insert into `plant_journals` | none wired (legacy shape; use `db-write`) |
| `ailment-link` | Insert into `plant_instance_ailments` | none wired (legacy shape; use `db-write`) |
| `db-write` | **Generic single-row insert / update / delete on any table** (offline-first Phase 3). | `queuedWrite.ts` helpers — see below |
| `task-dep-link` | **Resolve-on-flush task dependency link.** Resolves the real target task at flush (the cron's row if it exists, else materialises one via upsert on `unique_blueprint_date`), then inserts `task_dependencies`. Race-free — see below. | `AddTaskModal` offline dependency linking |

The four bespoke kinds are legacy, hand-rolled shapes. **New offline writes should use `db-write` via the `queuedWrite.ts` helpers, not a new bespoke kind.** The generic kind collapses the ~35 single-row idempotent writes (task create/edit, notes CRUD, plant edit/archive, instance edit, shopping, areas/locations edit, garden shapes, todos, lux) into one replayable shape. The union stays a deliberate whitelist so persisted payloads stay trustworthy across app versions; unknown kinds are dropped silently so a stale shape can't loop forever.

### `db-write` kind (offline-first Phase 3)

```ts
{
  kind: "db-write",
  table: string,                                   // e.g. "notes"
  op: "insert" | "update" | "delete",
  payload?: Record<string, unknown>,               // insert/update rows
  match?: { column: string; value: string|number },// update/delete target
  label?: string,                                   // human label for the badge/debug
}
```

Executor in `applyOne()`:
- `insert` → `supabase.from(table).upsert(payload)` — **upsert, not insert**, so a double-replay of a client-id'd row is idempotent instead of a duplicate/PK conflict. **Every insert must carry a client-generated `id`** (a `crypto.randomUUID()` for uuid-PK tables) so the row is stable across optimistic paint → queue → replay.
- `update` → `.update(payload).eq(match.column, match.value)`
- `delete` → `.delete().eq(match.column, match.value)` (malformed items with no `match` are dropped silently)

RLS enforces safety server-side on replay — the queue never carries elevated privilege; a write that the user couldn't make online is dead-lettered on replay like any other permanent failure.

### `queuedWrite.ts` helpers — the producer API

Producers call these instead of `supabase.from(table)…` directly (`src/lib/queuedWrite.ts`):

```ts
insertOrQueue(table, payload, label?) : Promise<{ queued, error? }>
updateOrQueue(table, patch, match, label?)
deleteOrQueue(table, match, label?)
```

Logic: if `isOffline()` → enqueue a `db-write` and return `{ queued: true }`. Else attempt the write; on a **permanent** error (has a PostgREST `code` or 4xx `status`) return `{ queued: false, error }` so the caller can surface it; on a **transient** (network-shaped) error enqueue + `{ queued: true }`; on success `{ queued: false }`. The caller updates its local state/snapshot **optimistically** so the change shows immediately whether or not it queued.

**Wired producers (Phase 3):**

| Surface | Writes | Notes |
|---------|--------|-------|
| Notes (`useNotes.ts`) | create / update / delete note + `note_links` | Full offline CRUD. Client `crypto.randomUUID()` id; optimistic `setNotes` + snapshot (`rhozly:snap:v1:notes*`). |
| Garden layout (`GardenLayoutEditor.tsx`) | delete-then-insert `garden_shapes` on save | Offline save enqueues the shape rows + writes the `layout` snapshot. |
| Add / edit task + routine, link dependencies (`AddTaskModal.tsx`) | insert a one-off `tasks` row, insert a recurring `task_blueprints` + first `tasks` row, **update** a `task_blueprints` row, and insert `task_dependencies` (+ materialise a ghost target `tasks` row) | **Phase 5 + follow-up.** Everything the modal does now works offline via client uuids. Create (one-off or new routine) queues the inserts (FIFO replay inserts the blueprint before its task, preserving the FK) and injects into the task engine snapshot so it shows in **every** view instantly; the routine's occurrences render as ghosts, so `generate-tasks` is skipped and the cron/reconnect materialises persisted rows. **Routine edit** is an `updateOrQueue("task_blueprints", …)` + re-inject (replace-by-id) so ghosts regenerate from the new values. **Dependency linking** queues a `task-dep-link` (resolve-on-flush) — race-free: no ghost is materialised with a client uuid offline, so it can't collide with the `generate-tasks` cron. |

### `task-dep-link` kind — race-free dependency linking

Linking a task to a *ghost* occurrence is race-prone if the ghost is materialised offline with a client uuid: the `generate-tasks` cron may materialise the **same** `(blueprint_id, due_date)` server-side first, so the client insert would trip `unique_blueprint_date`, dead-letter, and orphan the dependency. This kind defers all resolution to flush time (`applyOne`):

1. **Concrete target** (`targetTaskId`) → insert the dependency directly.
2. **Ghost target** (`targetGhost` = `{ home_id, blueprint_id, due_date, … }`) → query `tasks` for that `(blueprint_id, due_date)`; if a row exists (the cron's, or a prior partial flush) link to it; otherwise `upsert` on `onConflict: "blueprint_id,due_date"` and link to the returned id.
3. Insert `task_dependencies` with the `waiting_on` / `blocks` orientation.

`createdTaskId` (the task the modal just created) is always concrete and queued as its own insert first, so FIFO replay guarantees it exists before the link runs.
| Add manual plant (`saveToShed.ts` ← `TheShed.handleManualSave`) | insert a `plants` row + its auto-seasonal `plant_schedules` | **Phase 4.** Plant integer id is generated client-side (`generatePlantId`) so no server round-trip / id remap is needed; schedule uuids are generated client-side too. Hemisphere for the schedule windows comes from the cached home latitude (`readDashboardCache`) so they still land in the right months offline. Dup-check runs against the cached shed list; the new plant is painted + persisted via `useCachedShed.optimisticAddPlant`. Only the `manual` source is offline-capable — API/AI/Verdantly adds need the network for their care data anyway. |

**Explicitly kept online-gated (Phase 4 product call):**

| Surface | Why gated |
|---------|-----------|
| Automation create/edit (`AutomationBuilderModal.save`) | Automations drive live valve hardware and reference paired devices; a config saved offline can't be validated and can't fire until online. Gated with `requireOnline("Saving an automation")` for a clear message rather than a silent queue. |
| Destructive plant/area cascades | `ON DELETE CASCADE` fan-out (inventory items, journals, tasks) can't be previewed offline; left online-only. |

### Flush triggers (incl. lie-fi, 2026-07-11)

`flushQueue()` runs on: the window `online` event, app startup, a manual tap (`useOfflineQueue().flush()`), a backoff `scheduleRetry()` timer after a transient failure during a flush, AND — since bug-audit-2026-07-10 #20 — **immediately (debounced) when `enqueue()` adds an item while `navigator.onLine !== false`**. The last one matters because `queuedWrite` enqueues on a *transient network-shaped* failure even though the browser still reports online ("lie-fi"): the `online` event only fires on an offline→online *transition*, so without the enqueue-time kick the write sat in localStorage until the next startup/manual tap. `scheduleRetry()` is debounced (one pending timer) and backs off ×2 to 5 min; `flushQueue` resets it to 5 s on any successful drain.

**Snapshot-integrity rule (bug-audit #15):** consumers that paint from a snapshot then revalidate MUST check the query's `.error` before overwriting state / rewriting the snapshot — supabase-js returns `{ data: null, error }` on a blip without throwing, so an unchecked revalidate blanks the card and persists `[]` over good cached data. Applied in `AdaptiveCareCard`, `GardenBrainBriefCard`, `taskEngine` (tombstones), and the `App.tsx` dashboard cache.

### `useOfflineQueue` hook

```ts
{
  items: QueuedWrite[],
  count: number,
  flush(): Promise<void>,
  isFlushing: boolean,
}
```

Enqueueing is done directly via `enqueue()` from `src/lib/offlineQueue.ts`, not through the hook.

**Cross-tab sync:** the queue store listens for the window `storage` event on `rhozly_offline_queue_v1` and notifies its subscribers — a flush (or enqueue) in tab A updates tab B's badge instead of leaving it stale until an unrelated re-render.

**Live online state:** `QueuedActionsBadge` tracks connectivity via `useSyncExternalStore` on the window `online`/`offline` events. It previously read `navigator.onLine` during render, which froze the value — after connectivity returned, the badge could stay disabled ("Will sync when you're back online") indefinitely.

### Flush algorithm (`flushQueue()`)

1. Bail if already flushing (sets `pendingFlush` so another pass runs after) or `navigator.onLine === false`.
2. Resolve the current session's user id.
3. For each item in order:
   - **Wrong user** — if `item.userId` is set and differs from the current session's uid, drop it. Sign-out clears the queue; this is the backstop so one account can never replay another account's writes under its own JWT.
   - Dispatch via `applyOne()` based on `kind`.
   - On success → drop from queue.
   - On **permanent failure** (`isPermanentError`: a non-empty PostgREST error `code`, or a 4xx `status` — RLS denial, deleted row, constraint) or after **8 attempts** (`MAX_ATTEMPTS`) → drop the item (dead-letter with a console warning) so it can't block the items behind it.
   - On **network-shaped failure** → increment `attempts` + record `lastError`, stop the pass, and schedule a retry.
4. Retry uses a timer with capped exponential backoff (5s doubling up to 5min); the delay resets to 5s once a pass succeeds or empties the queue. This fixes the old gap where a transient failure *while already online* was never retried — the `online` event won't fire again, so the queue was stranded until a manual badge tap.

### Auto-flush triggers

- Window `online` event.
- App boot (`bootstrapOfflineQueue()`, ~1.5s after startup if online).
- The backoff retry timer after a transient failure.
- Manual via QueuedActionsBadge tap.

### Persistence & lifecycle

- localStorage survives reload, close, even browser restart.
- Items are stamped with the current `userId` at enqueue (tracked by `bootstrapOfflineQueue`'s auth listener so the synchronous `enqueue()` needs no async session lookup).
- `clearQueue()` drops everything — called on **sign-out** from `App.tsx`, so the next account on the device starts clean.

### Conflict resolution

Server is authoritative. If a queued change conflicts with a newer server state, the server's version wins. Queue items use idempotent updates where possible (`.update({ field })` not `.update({ updated_at: increment })`).

---

## Role 2 — Expert Gardener's Guide

### Why the queue exists

Gardens are often in poor-signal corners. The offline queue lets you carry on editing — ticking tasks, logging yields, adding notes — even when the network is flaky. Everything syncs automatically when you're back online.

### Implications for users

- Don't worry about offline edits.
- The Queued Actions Badge tells you what's pending.
- Tap the badge if you suspect something's stuck.

---

## Related reference files

- [Offline Badge](../09-persistent-ui/03-offline-badge.md)
- [Queued Actions Badge](../09-persistent-ui/04-queued-actions-badge.md)
- [Sync Indicator](../09-persistent-ui/05-sync-indicator.md)

## Code references for ongoing maintenance

- `src/lib/offlineQueue.ts` — queue store, `enqueue` / `flushQueue` / `clearQueue` / `bootstrapOfflineQueue`, per-kind executors in `applyOne()` (incl. the generic `db-write` insert-as-upsert / update / delete), cross-tab `storage` listener
- `src/lib/queuedWrite.ts` — `insertOrQueue` / `updateOrQueue` / `deleteOrQueue` — the offline-aware producer API for the `db-write` kind
- `src/hooks/useOnline.ts` — `useOnline()` / `isOffline()` connectivity source used by the helpers
- `src/hooks/useOfflineQueue.ts` — reactive view + manual `flush()`
- `src/components/QueuedActionsBadge.tsx` — badge; live online state via `useSyncExternalStore`
- `src/components/TaskList.tsx` — the `task-status` producer (replaces same-task queued items)
- `src/hooks/useNotes.ts`, `src/components/GardenLayoutEditor.tsx`, `src/components/AddTaskModal.tsx` — Phase 3 `db-write` producers
- `src/lib/saveToShed.ts` — Phase 4 offline manual-plant insert (plant + schedules); `src/hooks/useCachedShed.ts` `optimisticAddPlant`; `src/components/TheShed.tsx` `handleManualSave`
- `src/components/integrations/AutomationBuilderModal.tsx` — automation save gated online via `requireOnline`
- `src/lib/taskEngine.ts` — Phase 5 persistent task snapshot (`rhozly:snap:v1:tasks:{homeId}`), extracted pure `buildRenderTasks`, offline fetch fallback, `injectOfflineTask` / `injectOfflineBlueprint`
- `src/lib/offlineQueue.ts` `applyOne` `task-dep-link` branch — resolve-on-flush dependency linking
- `tests/unit/lib/queuedWrite.test.ts`, `tests/unit/lib/saveToShedOffline.test.ts`, `tests/unit/lib/taskEngineOffline.test.ts`, `tests/unit/lib/offlineQueueDepLink.test.ts` — helper + offline manual-plant + task-engine + dep-link resolution branches
- `src/App.tsx` — calls `clearQueue()` on sign-out
- `localStorage` key `rhozly_offline_queue_v1`
