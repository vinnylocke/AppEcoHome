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
| `task-status` | Update `tasks.status` / `completed_at` / `completed_by` | `TaskList` (the only wired producer today). Before enqueueing, TaskList **replaces** any existing queued `task-status` item for the same task (`getQueue()` + `remove()`) — a refetch while offline repaints the task as Pending, so a second tap used to stack a duplicate item instead of superseding the first. |
| `task-postpone` | Update `tasks.due_date` | none yet |
| `journal-add` | Insert into `plant_journals` | none yet |
| `ailment-link` | Insert into `plant_instance_ailments` | none yet |

The union is a deliberate whitelist so persisted payloads stay trustworthy across app versions. Adding a new shape means extending `QueuedWrite["kind"]` + the executor in `applyOne()`. Unknown kinds are dropped silently so a stale shape can't loop forever.

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

- `src/lib/offlineQueue.ts` — queue store, `enqueue` / `flushQueue` / `clearQueue` / `bootstrapOfflineQueue`, per-kind executors in `applyOne()`, cross-tab `storage` listener
- `src/hooks/useOfflineQueue.ts` — reactive view + manual `flush()`
- `src/components/QueuedActionsBadge.tsx` — badge; live online state via `useSyncExternalStore`
- `src/components/TaskList.tsx` — the `task-status` producer (replaces same-task queued items)
- `src/App.tsx` — calls `clearQueue()` on sign-out
- `localStorage` key `rhozly_offline_queue_v1`
