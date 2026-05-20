# Queued Actions Badge

> Header chip showing how many actions are waiting in the offline queue. Tappable to trigger an immediate flush. Self-hides when the queue is empty.

**Source file:** `src/components/QueuedActionsBadge.tsx`
**Hook:** `src/hooks/useOfflineQueue.ts`

---

## Quick Summary

Renders only when `count > 0`. Sky-blue chip with refresh icon (online) or upload-cloud icon (offline). Tap to flush manually. Disabled while flushing or offline.

---

## Role 1 — Technical Reference

### Component graph

```
QueuedActionsBadge (renders null when count === 0)
└── Button pill
    ├── Loader2 (flushing) / RefreshCw (online) / UploadCloud (offline)
    └── "N queued" text
```

### Hook surface (`useOfflineQueue`)

```ts
{
  count: number,
  flush(): Promise<void>,
  isFlushing: boolean,
  // also exposes queue manipulation for replays
}
```

### Data flow

- Reads queue state from `useOfflineQueue` (localStorage-backed, see [Offline Queue](../99-cross-cutting/16-offline-queue.md)).
- Manual `flush()` replays queued writes.

### Edge functions invoked

None directly. Queue items may invoke any function.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

None.

### Error states

| State | Result |
|-------|--------|
| Flush partial fail | Failed items stay queued; succeeded items drop |

### Performance

- Hook subscribes to localStorage changes.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this badge

When you go offline and continue working, every write you do queues up locally. The badge shows the count so you know "I made 3 changes that haven't synced yet".

### Every flow

#### 1. Watch it appear

- Add a task / complete a task / save a note while offline → count bumps.

#### 2. Tap to flush

- When online, tap → manual sync.
- Auto-flushes on connection return — manual is for impatience.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Refreshing the browser with queue non-empty.** localStorage persists; the queue survives. Don't worry.
- **Long queues with errors.** If a queued item keeps failing, it can block successful ones. See troubleshooting.

### Recommended workflows

- Trust the queue. Tap only if impatient.

### What to do if something looks wrong

- **Count stuck high:** flush failed silently. Open dev tools, inspect `rhozly_queue` in localStorage.
- **Badge missing despite queued writes:** queue API broken. Hard refresh.

---

## Related reference files

- [Offline Badge](./03-offline-badge.md)
- [Sync Indicator](./05-sync-indicator.md)
- [Offline Queue (cross-cutting)](../99-cross-cutting/16-offline-queue.md)

## Code references for ongoing maintenance

- `src/components/QueuedActionsBadge.tsx`
- `src/hooks/useOfflineQueue.ts`
