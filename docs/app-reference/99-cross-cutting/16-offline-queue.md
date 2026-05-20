# Offline Queue — Mechanics, Kinds, Replay

> A localStorage-backed write queue. When the user makes changes while offline (or while a sync fails), the action is stashed locally and replayed when connectivity returns or via the QueuedActionsBadge.

---

## Quick Summary

```
User action ──► supabase write ──┬── success (90%)
                                 └── failure / offline ──► queue item appended to localStorage
                                                            │
                                                            └── flush on online + manual tap
                                                                ├── success → drop from queue
                                                                └── failure → keep + back off
```

Queue lives at `localStorage.rhozly_queue` (or similar key). Drained via `useOfflineQueue().flush()`.

---

## Role 1 — Technical Reference

### Queue item shape

```ts
{
  id: string,                    // uuid
  kind: string,                  // e.g. "task.complete", "inventory.add"
  payload: Record<string, any>,  // operation-specific
  createdAt: number,             // ms epoch
  attempts: number,
  lastError?: string,
}
```

### Kinds (typical)

| Kind | Operation |
|------|-----------|
| `task.complete` | Mark task complete |
| `task.update` | Update task fields |
| `inventory.update` | Update inventory item |
| `journal.add` | Add journal entry |
| `yield.add` | Add yield log |

(Not every write goes through the queue — only those wired to use it.)

### `useOfflineQueue` hook

```ts
{
  count: number,
  flush(): Promise<void>,
  isFlushing: boolean,
  enqueue(kind, payload): void,
  // peek / clear utilities for debugging
}
```

### Flush algorithm

1. While online + count > 0 + not already flushing:
2. Take next item.
3. Dispatch based on `kind`.
4. On success → drop from queue.
5. On retryable failure → increment attempts, exponential backoff.
6. On permanent failure (4xx) → leave in queue with `lastError`; require user attention.

### Auto-flush triggers

- Window `online` event.
- App boot (if queue non-empty + online).
- Manual via QueuedActionsBadge tap.

### Persistence

- localStorage survives reload, close, even browser restart.
- Cleared only on flush success or manual reset.

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

- `src/hooks/useOfflineQueue.ts`
- Per-kind dispatchers in `src/lib/queueDispatch.ts` (or similar)
- `localStorage` key `rhozly_queue`
