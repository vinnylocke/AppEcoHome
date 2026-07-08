# Offline Banner (was: Offline Badge)

> A full-width strip below the header (offline-first Phase 0, 2026-07-08) that replaced the tiny "Offline" chip. Tells the user in plain words they can keep working offline, shows how many changes are waiting to sync, and offers a manual "Sync now". Self-hides when online with an empty queue.

**Source file:** `src/components/OfflineBanner.tsx` (replaced `OfflineBadge.tsx`, deleted). Connectivity via the shared `useOnline()` hook (`src/hooks/useOnline.ts`); queue count/flush via `useOfflineQueue()`.

---

## Quick Summary

Three states: (1) **offline** — amber strip, "keep working; changes sync when you reconnect" (+ queued count); (2) **back online with pending items** — sky strip with a "Sync now" button (`flushQueue`); (3) **booted from cache** — slate strip "showing your last saved data — refreshing…". Renders `null` when online, synced, and not showing stale cache.

### Boot-offline keystone (Phase 0)

The app now **boots offline**. `src/lib/profileCache.ts` caches the (non-secret) `user_profiles` row per-user on every successful load; `App.tsx`'s boot chain paints from that cache IMMEDIATELY when present (then refreshes in the background), because `loadProfile` uses `withRetry` which *waits for online* rather than throwing — so a catch-based fallback would hang. Without the cache, a no-signal cold-open hit the 8s profile-load error screen. Cleared on sign-out alongside the other caches.

### Sync now

`App.tsx` `handleSyncNow` (wired to the banner button AND a "Sync now" item in `UserProfileDropdown`, modelled on "Check for update") flushes the write queue then refetches profile + dashboard. Reconnect (`online` event) auto-triggers the read refetch; the write queue already auto-flushes on `online` via `bootstrapOfflineQueue`.

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
