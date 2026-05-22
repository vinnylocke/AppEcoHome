# Plan — Brand stamp on Quick Access

## Goal

Add a small, restrained "logo + RHOZLY wordmark" brand row at the top of `/quick` so the screen reads as a Rhozly surface instead of an unbranded launcher. (Earlier waves had this inside the hero and dropped it for space; this version places it ABOVE the hero so the hero stays unaffected and the brand is visible at a glance.)

## App-reference consulted

- [docs/app-reference/02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — confirmed the screen's component graph + that the floating menu button sits top-right (`z-[105]`), so a centred row above the hero won't collide.
- [docs/app-reference/99-cross-cutting/14-caching.md](../app-reference/99-cross-cutting/14-caching.md) — n/a (no preferences).

## Change

`src/components/QuickAccessHome.tsx` — insert a brand row between the desktop-preview banner and the hero card:

```tsx
{/* Brand stamp — small, centred, sits above the hero card so the
    screen reads as a Rhozly surface at a glance. Stays clear of the
    floating menu button (which is top-right). */}
<div
  data-testid="quick-access-brand-stamp"
  className="shrink-0 flex items-center justify-center gap-2 mb-3"
>
  <img
    src="/images/logo_small_rhozly.png"
    alt=""
    className="h-5 w-auto"
    aria-hidden
  />
  <span className="font-display font-black text-xs uppercase tracking-[0.2em] text-rhozly-on-surface/55">
    Rhozly
  </span>
</div>
```

- Image is decorative (`aria-hidden` + empty `alt`) since the visible "Rhozly" text already conveys the meaning.
- Uses the same `logo_small_rhozly.png` already loaded by the desktop header — no new asset.
- `text-rhozly-on-surface/55` keeps it muted so it doesn't compete with the hero's named greeting below.
- `shrink-0` matches the rest of the column children so flex pressure doesn't squash it.

## Test update

`tests/unit/components/QuickAccessHome.test.ts` — add one assertion that `quick-access-brand-stamp` is present on render.

## Docs

`docs/app-reference/02-dashboard/09-quick-access-home.md` — append a line to the component graph showing the brand stamp position:

```
├── Brand stamp (logo + RHOZLY wordmark, centred)
├── Hero card → navigate("/gardener")
```

## Risk

Vertical space — the row is ~28px including margin. Adding to the existing top safe-area padding could push the "Open full dashboard" pill closer to the home indicator on shorter phones. Mitigation: the recent layout-polish wave bumped `paddingBottom` to `2rem + safe-area` and added `mt-auto + pb-2` to the footer, which gives plenty of headroom. If it crowds anything we'll trim the row to logo-only (no wordmark) in a follow-up.

## Sequencing

1. Edit `QuickAccessHome.tsx`.
2. Update the test.
3. Update the app-reference.
4. Release notes + deploy.
