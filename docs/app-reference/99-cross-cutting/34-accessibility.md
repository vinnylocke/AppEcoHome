# Accessibility (cross-cutting)

> **One-line summary**: the platform-wide accessibility contract every Rhozly surface inherits — focus visibility, reduced motion, high contrast, skip-link, and modal aria semantics.

**Where it lives:** mostly in `src/index.css` (global CSS) and individual modal components (aria attributes). Toggled per-user through the Account Settings → Accessibility section.

---

## Quick Summary

Accessibility in Rhozly is a baseline contract, not a feature flag. Anything new must inherit it — every interactive control receives a keyboard focus ring, every animation respects the OS reduce-motion preference, and every modal is announceable to a screen reader. A high-contrast mode is opt-in for low-vision users in bright outdoor conditions (gardening surfaces are often used outside).

---

## Role 1 — Technical Reference

### Global CSS layer (`src/index.css`)

Three blocks own the platform-wide a11y contract:

1. **`:focus-visible` ring** — every `button`, `a`, `[role="button"]`, `input`, `textarea`, `select`, `[tabindex]` element receives a `2px solid var(--color-rhozly-primary)` outline with 2px offset when keyboard-focused. Mouse clicks do not trigger focus-visible, so the ring is only visible to keyboard / switch users (exactly the WCAG intent).
2. **`prefers-reduced-motion`** — under `@media (prefers-reduced-motion: reduce)`, all `animation-duration` and `transition-duration` are forced to `0.01ms`, scroll-behavior becomes `auto`, and animation-iteration-count is capped at 1. Loading spinners (`.animate-spin`) are explicitly exempt — motion **is** the message for a loader. The entrance utilities (`animate-in fade-in …`, defined natively in the same file — see [40-design-system.md](./40-design-system.md)) are zeroed by this block automatically; **decorative JS-driven effects** must additionally consult `motionTier()` (`src/lib/motionTier.ts`) and render their final state when it returns `"off"`.
3. **`html.high-contrast`** — when the user toggles "Accessibility → High contrast" in Gardener Profile, `html` receives this class. The block bumps secondary text from low opacities (`/20`–`/65`) up to fully solid `var(--color-rhozly-on-surface)`, and pushes outline opacities from `/10`–`/30` up to `/50`. White overlays in the dark header (`/40`–`/60`) get the same treatment with `#ffffff`. **Status chips** (`.text-status-{family}-ink` — soil / valve / attention / hazard) bump to their darker `-ink-strong` variant here too (added home-redesign Stage 1). This is *why* status surfaces must use the `status-*` token families and never raw Tailwind palette (`text-red-700` etc.): the raw palette has no entry in this block, so a raw-palette chip silently ignores High Contrast mode.

### Skip-to-content link (`src/App.tsx`)

```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] ..."
>
  Skip to main content
</a>
```

The skip-link is the first focusable element in the document. Hidden via `sr-only` until tabbed to, then revealed with a fixed-position chip in the top-left corner. Activating it jumps to `#main-content`, which is set on the primary `<main>` container in `App.tsx`.

### Modal accessible semantics

Every modal in Rhozly is built on the same a11y contract:

| Attribute | Required | Notes |
|---|---|---|
| `role="dialog"` (or `role="alertdialog"`) | Yes | `alertdialog` is reserved for destructive-confirmation flows (`ConfirmModal`); regular modals use `dialog`. |
| `aria-modal="true"` | Yes | Tells screen readers everything outside the dialog is inert while it's open. |
| Accessible name (one of) | Yes | Either `aria-label="<verb + noun>"` on the dialog root, or `aria-labelledby="<modal>-title"` paired with a matching `id` on the heading. `aria-labelledby` is preferred when there's a visible title; `aria-label` is fine for short dialogs without a heading. |
| Escape-to-dismiss | Yes | Standard pattern is a global `keydown` listener that calls `onClose()` when `event.key === "Escape"`. |
| Focus trap | Recommended | Most modals use a `trapRef` pattern (see `ConfirmModal.tsx`) that cycles Tab focus within the dialog. |

The platform owns 29 dialog-tagged modals as of Wave 9. All meet the first three rows. Escape-dismiss is universal on portal-based modals. Focus traps are present on confirmation flows and full-screen wizards; smaller sheet modals rely on the body scroll lock + outer click handler instead.

### Body scroll lock during modals (`src/index.css`)

```css
body:has(.fixed.inset-0.justify-center.items-center) {
  overflow: hidden !important;
  touch-action: none !important;
}
```

This CSS-only mechanism kicks in whenever a flex-centered overlay is mounted. Touch scroll on iOS/Android is suppressed so the modal doesn't scroll the page underneath when the user drags.

### Print mode

`@media print` is used by two surfaces — Microclimate Report and Audit Log — to render their content full-bleed on paper / PDF. Everything else in the document is hidden via `visibility: hidden`, then specific `#audit-print-root` / `#microclimate-print-root` regions are revealed.

### Storage / persistence

- **High-contrast preference**: written to `localStorage` (key handled inside the Gardener Profile Account Settings tab) and applied at mount by toggling `html.high-contrast`. Persists across sessions, device-local.
- All other a11y behaviours are derived from OS-level settings (`prefers-reduced-motion`) or transient (`:focus-visible`, modal lock) — no Supabase persistence.

### What new surfaces must inherit

Adding a new modal, drawer, sheet, or wizard? The contract is:

1. Wrap the dialog body in an element with `role="dialog"` (or `alertdialog` for destructive confirmation) + `aria-modal="true"`.
2. Provide an accessible name — `aria-labelledby` pointing to a heading, or `aria-label="<short verb + noun>"` if there's no visible heading.
3. Register an Escape key listener that calls the close handler.
4. Use semantic `<button>` / `<a>` / `<input>` for every interactive control. Avoid `<div onClick>` — it bypasses keyboard focus + the global ring.
5. For icon-only buttons, add `aria-label="<verb + noun>"` (e.g. `aria-label="Close"`, `aria-label="Clear selected dependency"`).
6. Trust the global focus-visible rule; don't suppress it with `outline: none`.

### Known gaps (deferred)

| Gap | Why deferred |
|---|---|
| Live-region wiring for form inline errors | Most error feedback is toast-based (handled by `Toaster`'s polite region). Inline errors in forms are read once focus returns to the field, which is acceptable for sighted SR users but suboptimal for blind users — needs a dedicated sweep. |
| Tap-target audit (≥44×44px) | Wave 1–8 pushed `min-h-[40px]` on most action buttons. A Lighthouse-driven re-pass is the right cadence — separate workstream. |
| Bulk opacity → contrast audit | Low-opacity `text-rhozly-on-surface/20`–`/30` is used for decorative secondary text. The high-contrast toggle already provides the escape hatch for users who need it. Bulk swaps would be a palette refresh, not a wave. |
| Shared `useModalFocusTrap` hook | Each modal currently re-implements focus trap inline. Consolidation would be cleaner but is a refactor, not an a11y gap. |
| Screen-reader announcements for live data updates | Realtime task/plant updates don't push announcements. Out of scope; rare enough that the page refresh is the recovery. |

---

## Role 2 — Expert Gardener's Guide

### Why this matters

You won't ever "open" the accessibility layer — it's the contract that keeps Rhozly usable for everyone. But here's what it means in practice:

- **You can drive Rhozly entirely from a keyboard.** Press `Tab` and you'll see a focus ring jump from element to element. The first stop is a "Skip to main content" chip that lets you bypass the nav when revisiting a page.
- **If you've enabled "Reduce motion" in your OS settings, Rhozly respects it.** Cards stop sliding, transitions snap, the dashboard stops shimmying when you scroll. Loading spinners stay spinning — that's how you know something's working.
- **High-contrast mode is one tap away.** Gardener Profile → Account → Accessibility → High contrast. The whole UI bumps every faded text colour up to fully solid. Use it in bright sunlight or if your vision needs more punch.
- **Every modal can be dismissed with `Esc`.** Closing instinct of every keyboard / power user — Rhozly always honours it.

### Where you'd notice it

- **Bright sunny garden** → flip high-contrast on. The faded "/40" greys on the dashboard become legible.
- **Driving the app from a phone with voice control** → the modal titles (e.g. "Edit Plant", "New Task", "Confirm archive") are spoken aloud when the modal opens. Without that, voice users would only hear "dialog" with no clue what just opened.
- **Vestibular sensitivity** → flip on Reduce Motion at the OS level and the app stops sliding around when you scroll or switch tabs.

### Common pitfalls

- **High-contrast looks different, not broken** — outlines get darker, faded labels become solid black. That's intentional. Toggle it back if the calmer default works for you.
- **Tab order follows the DOM, not the visual layout.** If you tab into a modal, focus enters the dialog body (not the close button) so you can start interacting immediately. To leave: `Esc`.

### What to do if something looks wrong

- Focus ring not visible? Check you're using a keyboard (`:focus-visible` doesn't trigger for mouse clicks — by design).
- Reduce-motion not honoured? Make sure it's enabled at OS level (Settings → Accessibility → Reduce motion on macOS / iOS; Settings → Ease of Access → Display → "Show animations in Windows" off).
- High contrast not sticking between sessions? It's stored in `localStorage` — clearing browser data resets it. Re-toggle in Account Settings.

---

## Related reference files

- [Gardener's Profile — Account](../06-profile-help/02-gardeners-profile.md) — where the high-contrast toggle lives.
- [Routing](21-routing.md) — skip-link target `#main-content` is set on the primary `<main>` in `App.tsx`.
- [Error Handling](20-error-handling.md) — toast/live-region pattern referenced under deferred gaps.

## Code references for ongoing maintenance

- `src/index.css:30-67` — `:focus-visible` baseline + reduced-motion block.
- `src/index.css:89-124` — `html.high-contrast` overrides.
- `src/index.css:133-158` — print mode rules for Microclimate / Audit.
- `src/index.css:164-179` — body scroll lock during modal display.
- `src/App.tsx:1060-1065` — skip-to-content link.
- `src/components/ConfirmModal.tsx:95` — canonical `role="alertdialog"` + focus trap example.
- `src/components/PlantEditModal.tsx:526` — canonical `role="dialog"` + `aria-label` example.
- `src/components/AddTaskModal.tsx:670-674` — canonical `role="dialog"` + `aria-labelledby` example.
