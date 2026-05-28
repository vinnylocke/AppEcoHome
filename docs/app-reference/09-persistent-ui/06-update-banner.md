# Update Banner

> A green floating banner pinned to the bottom-right that appears when a new service-worker (PWA) version is available. **Mandatory and non-cancellable** — a 3-second countdown then auto-reload.

**Source file:** `src/components/UpdateBanner.tsx`

---

## Quick Summary

Listens for the custom `pwa-update-available` window event (dispatched by `src/main.tsx`'s `registerSW` callback when a new SW is detected, or by `useAppVersion` when a poll spots a version mismatch). Stashes the `reload()` function from the event detail. Renders a banner that counts down 3 seconds, then triggers the reload. There is no "Not now" and no dismiss — updates are non-negotiable.

---

## Role 1 — Technical Reference

### Component graph

```
UpdateBanner (renders null until event)
└── Floating banner (bottom-right)
    ├── "Updating Rhozly OS…" headline
    ├── "Applying the latest version in {n}s." subline
    └── Progress bar (linear fill over the countdown)
```

### Event contract

```ts
window.dispatchEvent(new CustomEvent("pwa-update-available", {
  detail: { reload: () => Promise<void> }
}));
```

Source: `vite-plugin-pwa`'s `registerSW({ onNeedRefresh })` in `src/main.tsx`.

### Data flow

- Event-driven.
- Reload fn calls `updateSW(true)` which activates the waiting service worker and reloads the page.

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
| Reload fails | Banner stays; manual reload via browser |

### Performance

- Pure event listener; renders nothing until triggered.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this banner

Rhozly auto-updates in the background as a PWA. When a new version is detected (either by the service worker or by the version-polling hook), this banner appears, counts down 3 seconds, then reloads — bringing you onto the new version. Updates are mandatory: there's no opt-out, no "later", no "Not now".

### Every flow

#### 1. Banner appears

- After a background update is detected.
- After resuming the app from minimised / background where a deploy landed in the meantime.

#### 2. Auto-reload

- The progress bar fills over 3 seconds.
- At zero, the page reloads onto the new bundle.
- No interaction required (or possible) on your part.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **In the middle of typing when the banner appears.** Don't worry — work-in-progress data is held by the offline queue + Supabase; the reload won't lose anything in normal flows. If you were mid-modal, finish quickly or accept that a reload will close it.

### Recommended workflows

- There isn't one — the banner self-resolves in 3 seconds.

### What to do if something looks wrong

- **Reload doesn't update version:** SW may be stuck. Open dev tools → Application → Service Workers → Skip Waiting.
- **Banner re-appears on every resume:** the new bundle isn't installing. Check service-worker status; force-quit the app and reopen.

---

## Related reference files

- [Release Notes Modal](../08-modals-and-overlays/19-release-notes.md)
- [PWA (cross-cutting)](../99-cross-cutting/22-pwa.md)

## Code references for ongoing maintenance

- `src/components/UpdateBanner.tsx`
- `src/main.tsx` — `registerSW` setup
- `vite.config.ts` — PWA plugin config
