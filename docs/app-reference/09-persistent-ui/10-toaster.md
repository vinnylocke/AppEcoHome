# Toast / Toaster

> The global toast notification surface powered by `react-hot-toast`. Used throughout the app for success / error / loading / info feedback that doesn't deserve a modal.

**Source:** `react-hot-toast` library; `<Toaster />` mounted in `src/App.tsx`.

---

## Quick Summary

`<Toaster />` is mounted once at the root of the app. Anywhere in the app, `import toast from "react-hot-toast"` and call `toast.success(...)`, `toast.error(...)`, `toast.loading(...)`, or `toast(...)` (default) to surface a transient notification.

---

## Role 1 — Technical Reference

### API surface

```ts
toast.success("Saved");
toast.error("Failed to save");
toast.loading("Saving…");
toast("Custom",  { icon: "🌱" });
toast.dismiss(toastId);

// With JSX:
toast((t) => (
  <span>
    Saved <button onClick={() => toast.dismiss(t.id)}>OK</button>
  </span>
), { duration: 5000 });
```

### Configuration (typical)

`<Toaster />` is rendered with defaults; per-call `duration`, `position`, `style` overrides supported.

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

None — pure UI.

### Performance

- Stack of small DOM nodes.
- Each toast auto-dismisses by duration.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see toasts

Quick, non-blocking feedback. Save succeeded → green pill. Save failed → red pill with the reason. Pending action → blue spinner pill that resolves to success/failure.

### Every flow

#### 1. Read the toast

- Appears briefly at the bottom (or top — by config) of the screen.

#### 2. Action toasts

- Some toasts have inline buttons (Retry / Undo). Tap before they dismiss.

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Missing the action button.** Default duration is short — for important "Retry" CTAs, the duration is extended.
- **Multiple toasts pile up.** They stack in order; older ones dismiss first.

### Recommended workflows

- Watch for them after any save / delete / network action.

### What to do if something looks wrong

- **No toasts ever:** `<Toaster />` may not be mounted. Check `src/App.tsx`.
- **Toasts behind the modal:** z-index ordering bug — file.

---

## Related reference files

- All screens — used everywhere.

## Code references for ongoing maintenance

- `react-hot-toast` (npm)
- `<Toaster />` mount in `src/App.tsx`
- `src/lib/errorHandler.ts` — `Logger.error` often pairs with `toast.error`
