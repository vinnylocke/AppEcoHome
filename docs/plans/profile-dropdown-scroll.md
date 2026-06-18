# Profile dropdown — make it scrollable

## Problem
`UserProfileDropdown` panel clips its bottom options on short viewports — the
panel is `w-60 … overflow-hidden` with no height cap, so on small screens the
lower menu items (e.g. Sign out, Support) are cut off and unreachable.

## App-reference consulted
- [09-persistent-ui](../app-reference/09-persistent-ui/) — header / user menu (the
  dropdown is part of the persistent top nav).

## Approach
In `src/components/UserProfileDropdown.tsx` (the panel at ~line 218), replace
`overflow-hidden` with a height cap + vertical scroll:
`max-h-[80vh] overflow-y-auto overscroll-contain`. Keep the rounded corners +
`custom-scrollbar` styling already used elsewhere. The backdrop click-catcher
(`fixed inset-0`) stays. No behavioural change beyond enabling scroll.

## Files
| File | Change |
|------|--------|
| `src/components/UserProfileDropdown.tsx` | panel: `overflow-hidden` → `max-h-[80vh] overflow-y-auto` |

## Tests
- Playwright: extend any user-menu spec (or add a tiny one) asserting the menu
  panel has a bounded height + the bottom item (Sign out) is reachable. If no
  existing spec, this is optional given the change is CSS-only.

## Risks
- Minimal. Verify the `max-h` doesn't fight the open animation; `overflow-y-auto`
  is compatible with `slide-in-from-top-2`.

## Docs to update
- None (cosmetic). Optionally note in the persistent-ui reference.
