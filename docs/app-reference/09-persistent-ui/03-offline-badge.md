# Offline Badge

> A small amber chip in the header that shows when the browser is offline. Listens to `online` / `offline` events and self-hides when connectivity returns.

**Source file:** `src/components/OfflineBadge.tsx`

---

## Quick Summary

`navigator.onLine` + window `online`/`offline` events drive the visibility. When offline, a `<WifiOff>` icon + "Offline" pill appears. When connectivity comes back, hides automatically.

---

## Role 1 — Technical Reference

### Component graph

```
OfflineBadge (renders null when online)
└── Pill (amber chip)
    ├── WifiOff icon
    └── "Offline" text
```

### Data flow

- Listens to `window.addEventListener("online" / "offline")`.
- Initial state from `navigator.onLine`.

### Edge functions invoked

None.

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

None — purely indicator.

### Performance

- Two event listeners; zero re-renders when online.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this badge

So you know to expect "queued" behaviour — anything you do while offline waits in the local queue and syncs when you're back online. The amber pill makes the state obvious.

### Every flow

#### 1. See it appear

- Lost Wi-Fi or mobile data. Badge appears.

#### 2. Continue working

- Most actions still work (offline queue). See [Offline Queue](../99-cross-cutting/16-offline-queue.md).

#### 3. See it disappear

- Connection returns. Queue drains automatically.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Refreshing while offline.** Some screens require a fresh fetch; the offline queue saves *writes*, not page loads.

### Recommended workflows

- Carry on. Trust the queue.

### What to do if something looks wrong

- **Badge stuck on:** the browser may have wrong `navigator.onLine` state. Disconnect/reconnect Wi-Fi.

---

## Related reference files

- [Queued Actions Badge](./04-queued-actions-badge.md)
- [Sync Indicator](./05-sync-indicator.md)
- [Offline Queue (cross-cutting)](../99-cross-cutting/16-offline-queue.md)

## Code references for ongoing maintenance

- `src/components/OfflineBadge.tsx`
