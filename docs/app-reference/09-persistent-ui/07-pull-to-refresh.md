# Pull To Refresh

> Mobile-friendly pull-to-refresh wrapper. Drop any scrollable content inside and provide an `onRefresh` callback; when the user pulls down past 70px from the top of the scroll container, refresh fires.

**Source file:** `src/components/PullToRefresh.tsx`

---

## Quick Summary

Touch-event-driven. Only fires when the inner container is scrolled to the very top. Pull distance is friction-multiplied (0.4) so it feels weighted. Max pull 120px. Refresh threshold 70px. While refreshing, a spinner shows in the pull-handle area; otherwise the arrow indicates "pull more".

---

## Role 1 — Technical Reference

### Component graph

```
PullToRefresh (wrapper)
├── Pull indicator (Loader2 spinning during refresh, ArrowDown otherwise)
└── Scrollable content (children)
```

### Props

| Prop | Type | Purpose |
|------|------|---------|
| `onRefresh` | `() => Promise<void>` | Called when threshold met on release |
| `children` | `ReactNode` | The wrapped content |

### Constants

```ts
maxPull = 120         // px
refreshThreshold = 70 // px to trigger
friction = 0.4        // multiplier for pull distance
```

### Touch handlers

- `onTouchStart` — record startY if container is at scrollTop === 0.
- `onTouchMove` — compute dy, apply friction, prevent default overscroll.
- `onTouchEnd` — if pull ≥ threshold, call `onRefresh()`, set `isRefreshing`, reset on resolve.

### Data flow

- No fetches itself; delegates to `onRefresh` callback.

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

| State | Result |
|-------|--------|
| `onRefresh` throws | Toast "Couldn't refresh — try again" |

### Performance

- Touch events native; cheap on render.
- Indicator transforms only (no layout thrash).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this gesture

On mobile, the most natural way to "give me the latest" is to pull down. PullToRefresh wraps screens that benefit (Dashboard, Shopping Lists, Plant Doctor History, etc.).

### Every flow

#### 1. Pull down at top of screen

- Arrow appears.
- Pull past threshold → release → refresh fires.
- Spinner shows; resolves and snaps back.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Pull from middle of screen.** Only fires when scrolled to absolute top.
- **Pull on desktop.** Not implemented for mouse — desktop refresh via browser shortcut.

### Recommended workflows

- After making changes on another device, pull to sync.
- When realtime hiccups, pull to manually refetch.

### What to do if something looks wrong

- **Gesture not registering:** ensure your finger starts at the top of the scrollable area.
- **Refresh fires then nothing changes:** the upstream fetch may have cached. Force-restart the app.

---

## Related reference files

- [Sync Indicator](./05-sync-indicator.md)
- [Realtime (cross-cutting)](../99-cross-cutting/15-realtime.md)

## Code references for ongoing maintenance

- `src/components/PullToRefresh.tsx`
- Each consuming screen passes its own `onRefresh` callback
