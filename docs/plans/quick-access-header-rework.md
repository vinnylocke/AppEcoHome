# Plan — Quick Access Home (mobile dashboard) header rework

## What the user asked for

1. Hero "Good {time-of-day}, {name}" card currently navigates to `/gardener` (Account Settings) with subtitle "Tap to manage your account". Change destination to `/dashboard` and update subtitle accordingly.
2. Remove the "Open full dashboard" pill at the bottom of `QuickAccessHome` (it duplicates what the hero card will do).
3. Move the floating burger menu button from top-right to top-left.
4. Add a user avatar / profile dropdown in the top-right that opens the same dropdown menu as the main header `UserProfileDropdown`.

## App-reference files consulted

- [`docs/app-reference/02-dashboard/09-quick-access-home.md`](../app-reference/02-dashboard/09-quick-access-home.md) — Quick Access component graph + UX framing
- (No app-reference for `UserProfileDropdown` yet — drop-down behaviour is documented inline in the component file's JSDoc.)

## Files modified

| File | Change |
|------|--------|
| `src/components/QuickAccessHome.tsx` | Hero `onClick` → `/dashboard`; subtitle → "Tap to open your dashboard"; aria-label updated. Remove the "Open full dashboard" footer block (and the `mt-auto` flex anchor it relied on). |
| `src/components/QuickAccessMenuButton.tsx` | Swap `right-3` / `right: calc(...)` for `left-3` / `left: calc(...)`. No behaviour change. |
| `src/App.tsx` | When `isFocusMode`, render a fixed top-right floating `<UserProfileDropdown>` next to the burger button. Same prop wiring as the desktop header. |
| `docs/app-reference/02-dashboard/09-quick-access-home.md` | Reflect the new hero destination, removed footer pill, and new top-bar layout (burger left, profile right). |

## Tests

No existing unit test for `QuickAccessHome`. The two existing E2E touchpoints (`quick-access-hero-card`, `quick-access-menu-button`, `quick-access-open-dashboard`) need:
- `quick-access-hero-card` — selector stays; destination changes to `/dashboard`.
- `quick-access-menu-button` — position changes left, test still finds it by `data-testid`.
- `quick-access-open-dashboard` — selector removed (button deleted). Any test referencing it needs to be updated (the hero card now does the same job).

`docs/e2e-test-plan.md` row for the Quick Access bottom pill — mark removed.

## Deploy

Frontend only. Minor bump → 22.0015. Vercel deploy + DB version commit, no edge function or migration involved.

## Risks

- The floating profile dropdown sits at top-right where the burger used to be. Users who tap by muscle memory may briefly tap the wrong button — acceptable transient cost for the redesign.
- The dropdown's panel anchors right-aligned to the trigger (`absolute top-full right-0`). When mounted top-right of viewport, the panel stays on-screen. No re-anchoring needed.
- We're keeping the desktop preview banner that points users to `/dashboard` via inline button — still accurate.
