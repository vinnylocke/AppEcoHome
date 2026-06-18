# Plan — Image-credit popover (the "i" source modal) can't be closed

## Problem

Tapping the ℹ️ badge on any image (photos, AI sources, API sources, etc.) opens the
`CreditPopover` with provider / licence / source info. Clicking its **✕** (or anything
inside it) doesn't close it — it stays open.

### Root cause

`CreditPopover` is rendered as a **React child of the trigger `<button>`**
(`ImageCredit.tsx:65, :82, :99` — `{open && <CreditPopover/>}` lives inside the button).
It portals to `document.body` in the DOM, but **React synthetic events bubble through the
React tree, not the DOM tree**. So a click on the popover's ✕ runs `onClose`
(`setAnchorRect(null)`) and then bubbles up to the trigger button's `onClick`, which
re-runs `setAnchorRect(rect)` and immediately **re-opens** it. Only a click on empty
space elsewhere closes it (via the `mousedown` outside-handler), which is why it feels
un-closable.

## App-reference consulted

- [`99-cross-cutting/24-image-sources.md`](../app-reference/99-cross-cutting/24-image-sources.md) —
  documents `<ImageCredit>` / `<CreditPopover>` ("Tap outside or Esc to dismiss"). The
  documented dismiss behaviour is correct; this fix just makes it actually work, so no
  doc change is needed.

## Approach

Add `onClick={(e) => e.stopPropagation()}` to the `CreditPopover` wrapper `<div>`
(the `role="dialog"` panel). This stops clicks inside the popover from bubbling through
the React tree to the trigger button, so:

- ✕ → `onClose` runs, bubbling halts at the popover → stays closed.
- Links ("View original", licence, "All image sources") still navigate (stopPropagation
  doesn't block default `<a>` navigation).
- Outside click / Esc still close via the existing document handlers (unchanged).

One-line, shared by every `ImageCredit` usage (overlay / inline / badge-only), so it
fixes the chat gallery, plant heroes, doctor results — everywhere the badge appears.

### Files changing

| File | Change |
|------|--------|
| `src/components/credit/CreditPopover.tsx` | `stopPropagation` on the panel's `onClick` |
| `tests/unit/components/ImageCredit.test.ts` (new) | Open badge → popover shows; click ✕ → popover closes (and does not re-open) |

## Tests

- New Vitest + Testing Library spec: render `<ImageCredit variant="badge-only" credit={…}/>`,
  click the badge (popover appears), click **Close credit** (✕), assert the popover is gone.
  Fails on the current code (re-opens), passes with the fix.
- `npm run test:unit` + `tsc` + `npm run build` green.

## Risks

- `stopPropagation` is scoped to the popover panel only; outside-click + Esc handlers are
  untouched, so dismissal paths all still work.
- No layout/positioning change.

## Deploy

Client-only (no function/migration change) → `scripts/deploy-app-only.mjs --bump 1`.
