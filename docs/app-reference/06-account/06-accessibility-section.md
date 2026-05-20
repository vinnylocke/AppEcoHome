# Accessibility Section

> The accessibility settings panel. Currently houses one toggle (high contrast) plus a note about OS-level Reduce Motion which Rhozly honours automatically.

**Trigger:** Rendered inside Account Tab (Account Settings).
**Source files:**
- `src/components/GardenerProfile.tsx` — `AccessibilitySection()` function (~lines 208–238)
- `src/hooks/useHighContrast.ts` — toggle implementation

---

## Quick Summary

Wraps a single `useHighContrast` hook into a labeled toggle row. The hook persists the choice in `localStorage` and applies a CSS class to `<html>` that swaps secondary text + chip colours to higher-contrast variants in `tailwind.config.ts`. Reduce Motion is honoured via `@media (prefers-reduced-motion)` in CSS — no separate toggle.

---

## Role 1 — Technical Reference

### Component graph

```
AccessibilitySection
├── Header (Eye icon, "Accessibility")
├── High contrast toggle row
│   ├── Label + description
│   └── Checkbox toggle
└── Reduce Motion note (informational only)
```

### Hook: `useHighContrast()`

Returns `[highContrast, setHighContrast]` tuple. On mount, reads `localStorage["rhozly_high_contrast"]`. On set, persists + toggles a `data-high-contrast` attribute / class on `<html>`.

### Data flow

- Read: `localStorage.getItem("rhozly_high_contrast")`.
- Write: `localStorage.setItem(...)`.

### CSS hook

Tailwind config likely has variant rules (e.g. `:where([data-high-contrast='true']) &`) that swap colour tokens. No server-side state.

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

Per-user / per-device (localStorage).

### Error states

None — toggle is purely visual.

### Performance

- Zero network.
- One DOM attribute flip on toggle.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this section

If you garden outdoors in bright sun, default text contrast can be hard to read. The high-contrast toggle forces solid colours for secondary text and chips so the UI stays legible.

Reduce Motion is automatic — Rhozly reads your OS preference and disables animations accordingly. No toggle needed here.

### Every flow on this section

#### 1. Toggle high contrast

- Tap → instant visual change across the whole app.
- Stored on this device only. If you use Rhozly on another device, toggle there too.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| High contrast | Toggle that increases UI contrast |
| Reduce Motion note | Reminder that Rhozly auto-respects this OS setting |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Expecting cross-device sync.** It's localStorage; per-device.
- **Wondering why animations are gone.** OS Reduce Motion may be on. Check OS settings.

### Recommended workflows

- **Outdoor users:** enable high contrast in spring; disable when working indoors at a screen.

### What to do if something looks wrong

- **Toggle does nothing visible:** Tailwind config may not have variants. Inspect `<html>` for `data-high-contrast="true"`.
- **Animations still play despite OS Reduce Motion on:** the CSS media query is broken — file a bug.

---

## Related reference files

- [Account Tab](./01-account-tab.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — AccessibilitySection
- `src/hooks/useHighContrast.ts` — hook + side-effects
- `tailwind.config.ts` — high-contrast colour variants
- CSS `@media (prefers-reduced-motion)` rules
