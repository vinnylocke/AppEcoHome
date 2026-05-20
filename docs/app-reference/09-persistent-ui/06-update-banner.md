# Update Banner

> A green floating banner pinned to the bottom-right that appears when a new service-worker (PWA) version is available. Tap "Reload" to activate the new version immediately.

**Source file:** `src/components/UpdateBanner.tsx`

---

## Quick Summary

Listens for the custom `pwa-update-available` window event (dispatched by `src/main.tsx`'s `registerSW` callback when a new SW is detected). Stashes the `reload()` function from the event detail. Renders a banner with Reload + Dismiss buttons.

---

## Role 1 — Technical Reference

### Component graph

```
UpdateBanner (renders null until event)
└── Floating banner (bottom-right)
    ├── "Update available" text
    ├── Reload button (calls stashed reload fn)
    └── Dismiss (X)
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

Rhozly auto-updates in the background as a PWA. When a new version is downloaded but not yet active, this banner asks you to reload to activate it.

### Every flow

#### 1. Banner appears

- After a background update.

#### 2. Reload

- Click → applies the update, page reloads with the new version.

#### 3. Dismiss

- X → banner closes. Update applies on next page reload.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Dismissing then forgetting.** Update activates on next reload anyway, but until then you're on the old version.
- **Dismissing mid-task.** Safe — your work is in the queue / DB. Reload when ready.

### Recommended workflows

- Reload when convenient. Old version stays functional.

### What to do if something looks wrong

- **Reload doesn't update version:** SW may be stuck. Open dev tools → Application → Service Workers → Skip Waiting.

---

## Related reference files

- [Release Notes Modal](../08-modals-and-overlays/19-release-notes.md)
- [PWA (cross-cutting)](../99-cross-cutting/22-pwa.md)

## Code references for ongoing maintenance

- `src/components/UpdateBanner.tsx`
- `src/main.tsx` — `registerSW` setup
- `vite.config.ts` — PWA plugin config
