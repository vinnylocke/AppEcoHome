# Wave 6 — Focus-mode Quick Access shell

Parent plan: [mobile-quick-access-screen.md](./mobile-quick-access-screen.md) · prev: [Wave 5](./mobile-quick-access-wave-5.md) (shipped)

## Goal

Make the four mobile Quick Access routes (`/quick`, `/quick/lens`, `/quick/calendar`, `/quick/journal`) feel calm and full-bleed. Hide the top bar and the side nav by default; replace them with a single small hamburger button top-right that slides the existing nav in as an overlay drawer when needed.

```
Before (mobile /quick today):                After (focus mode):
┌──────────────────────────────────┐        ┌──────────────────────────────────┐
│ [🌿 Logo]  …          [Avatar]    │ ←hdr   │                            [☰]   │ ← floating
│┌──┐                               │        │                                   │
││🌿│  Quick Access                 │ ←nav   │     Quick Access                  │
││📋│                               │        │                                   │
││📷│  What can I help with?        │        │     What can I help with?         │
││…│  ┌────────────────────────┐   │        │     ┌────────────────────────┐   │
│└──┘  │ [📷] Visual Lens        │   │        │     │ [📷] Visual Lens        │   │
│      │ [📅] Today              │   │        │     │ [📅] Today              │   │
│      │ [📝] Quick Capture      │   │        │     │ [📝] Quick Capture      │   │
│      └────────────────────────┘   │        │     └────────────────────────┘   │
└──────────────────────────────────┘        └──────────────────────────────────┘
```

Tap the hamburger → side nav slides in as a slide-from-left drawer with a backdrop. Pick a link → navigate + close the drawer. Tap backdrop / Escape → close without navigating.

## App-reference files consulted

- [02-dashboard/09-quick-access-home.md](../app-reference/02-dashboard/09-quick-access-home.md) — the landing screen
- [02-dashboard/10-localized-task-calendar.md](../app-reference/02-dashboard/10-localized-task-calendar.md) — has its own back chrome ("← Quick"); the new hamburger goes top-**right**, not top-left
- [02-dashboard/11-quick-capture-journal.md](../app-reference/02-dashboard/11-quick-capture-journal.md) — same
- [09-persistent-ui](../app-reference/09-persistent-ui/) — current side-nav docs

Source files studied:
- [src/App.tsx](../../src/App.tsx) — owns the header (line ~890) + side nav (line ~920) + `isMobileSidebarOpen` state. Wave 6 lives mostly here.
- [src/components/QuickAccessHome.tsx](../../src/components/QuickAccessHome.tsx), [src/components/QuickAccessLens.tsx](../../src/components/QuickAccessLens.tsx), [src/components/quick/LocalizedTaskCalendar.tsx](../../src/components/quick/LocalizedTaskCalendar.tsx), [src/components/quick/QuickCapture.tsx](../../src/components/quick/QuickCapture.tsx) — confirm none of them reach into the surrounding chrome; safe to hide outer header + nav without affecting the screens themselves.
- [src/components/NavItem.tsx](../../src/components/NavItem.tsx) — already supports `isCollapsed` + `isMobile` props; drawer rendering needs no changes here.

## Decisions

### Decision 1 — Detect "focus mode" via route + viewport

A small derived boolean in `AppShell`:

```ts
const isFocusMode =
  isMobile &&
  routerLocation.pathname.startsWith("/quick");
```

Driven by [`useIsMobile()`](../../src/hooks/useIsMobile.ts) (`Capacitor.isNativePlatform() OR viewport < 768px`) — same hook the `/` redirect uses, so visual + routing decisions stay aligned.

### Decision 2 — Hide both the top bar AND the persistent side-nav-column in focus mode

When `isFocusMode === true`:
- The `<header>` (top bar) does not render at all.
- The `<nav>` column does not render in the layout flow at all (no 80px reservation, no border).
- The page content gets the full viewport width.

Existing non-mobile / non-quick routes are unchanged — they keep the header + side nav exactly as today.

### Decision 3 — Reuse the existing nav links via a small `MobileNavDrawer` portal

Rather than restyling the existing nav element into a drawer (which risks regressing the desktop layout), Wave 6 introduces a tiny new `MobileNavDrawer` component that:

- Portal-mounts to `document.body` when `quickDrawerOpen === true`.
- Slides in from the left with a backdrop click-to-close + Escape-to-close + focus trap.
- Renders the **same `navLinks` array** the existing nav uses, plus the same Help Center / Privacy / Cookies footer. No duplicated link list.
- Closes itself on `navigate()` so users see the screen they tapped to immediately, no lingering overlay.

```
<MobileNavDrawer
  open={quickDrawerOpen}
  onClose={() => setQuickDrawerOpen(false)}
  navLinks={navLinks}
  activePath={routerLocation.pathname}
  onNavigate={(path) => { setQuickDrawerOpen(false); navigate(path); }}
  appVersion={appVersion}
  onOpenHelp={() => { setQuickDrawerOpen(false); setHelpCenterOpen(true); }}
  onOpenPrivacy={() => { setQuickDrawerOpen(false); setShowPrivacy(true); }}
  onOpenCookies={() => { setQuickDrawerOpen(false); setShowCookies(true); }}
/>
```

### Decision 4 — Floating hamburger top-right, labelled "Menu" for the first visit

A small `QuickAccessMenuButton` component, absolutely positioned at the top-right of the viewport with safe-area padding for notches. Default state: hamburger icon only. **First visit only (per-device localStorage flag `rhozly_quick_menu_seen`)**: shows the word "Menu" alongside the icon for ~10 seconds or until the user taps it once — addresses the discoverability trade-off without permanent UI clutter.

Position: `fixed top-3 right-3` (plus `env(safe-area-inset-top)` for native). Doesn't conflict with:
- The existing back chrome on `/quick/lens`, `/quick/calendar`, `/quick/journal` (those are top-**left**).
- The PlantDoctorChat floating button (bottom-right).

### Decision 5 — Closing on navigation, Escape, backdrop, and route change

Five close triggers:
1. Tap a nav link → drawer closes + navigates.
2. Tap the backdrop → drawer closes, no navigation.
3. Press Escape → drawer closes.
4. Route changes via any other path (e.g. back button on a sub-screen) → drawer closes (effect listens to `routerLocation.pathname`).
5. Viewport resizes from mobile to desktop → drawer closes (defensive — shouldn't happen in normal use, but tests resize the viewport).

### Decision 6 — Focus mode does NOT change the bottom-area existing chrome

The PlantDoctorChat floating button (bottom-right) stays where it is. ReleaseNotesModal, BetaFeedbackBanner, Toaster, WelcomeModal — all unchanged. Wave 6 only touches the **top** chrome and the **left** side nav.

### Decision 7 — Permission + tier dependencies unchanged

Hamburger always visible (no permission gate). Drawer surfaces the same nav links visible elsewhere — items the user can't navigate to (e.g. tier-gated routes) get the same lock treatment they have today.

## File touch list

| File | Status | Change |
|---|---|---|
| `src/components/MobileNavDrawer.tsx` | **NEW** | Portal-mounted slide-from-left drawer; reuses `navLinks` props. |
| `src/components/QuickAccessMenuButton.tsx` | **NEW** | Floating hamburger top-right with first-visit "Menu" label. |
| `src/App.tsx` | edit | (a) derive `isFocusMode`; (b) wrap header + side-nav rendering in `!isFocusMode`; (c) mount `QuickAccessMenuButton` + `MobileNavDrawer` when `isFocusMode`. |
| `tests/unit/components/MobileNavDrawer.test.ts` | **NEW** | Render, close-on-backdrop, close-on-Escape, link click closes + navigates. |
| `tests/unit/components/QuickAccessMenuButton.test.ts` | **NEW** | Renders the button; first-visit label appears + persists via localStorage. |
| `tests/e2e/specs/quick-access.spec.ts` | edit | New cases: mobile `/quick` does NOT show the header; tap menu → drawer visible; tap a nav link → drawer closes + navigation; desktop `/quick` keeps the header. |

No DB changes. No edge functions. No new buckets.

## App-reference work

| File | Action |
|---|---|
| `docs/app-reference/02-dashboard/09-quick-access-home.md` | UPDATE — document the focus-mode chrome (no top bar / no persistent nav on mobile, hamburger top-right) |
| `docs/app-reference/02-dashboard/10-localized-task-calendar.md` | UPDATE — same |
| `docs/app-reference/02-dashboard/11-quick-capture-journal.md` | UPDATE — same |
| `docs/app-reference/05-tools/02-plant-doctor.md` | UPDATE — note that `/quick/lens` also enters focus mode on mobile (Quick Access wrapper) |
| `docs/app-reference/09-persistent-ui/01-top-bar.md` (if it exists) + `09-persistent-ui/02-side-nav.md` (if it exists) | UPDATE — document the focus-mode exclusion |
| `docs/app-reference/99-cross-cutting/21-routing.md` | UPDATE — note that `/quick/*` routes on mobile render without persistent chrome |
| `docs/app-reference/00-INDEX.md` | No new file row needed — both new components are scaffolding for an existing screen, not a new surface. |

## Tests

| Tier | What |
|---|---|
| Vitest | `MobileNavDrawer` — closed by default; rendering the open state shows backdrop + links; clicking the backdrop fires onClose; pressing Escape fires onClose; clicking a link fires onNavigate with the path |
| Vitest | `QuickAccessMenuButton` — renders the hamburger; first-visit shows "Menu" label; tapping fires onClick; localStorage flag is set after first interaction so subsequent renders hide the label |
| Playwright | `quick-access.spec.ts` adds: mobile viewport `/quick` → header is not in the DOM; menu button visible top-right; tap menu → drawer visible with nav links; tap "Plants" link → drawer closes + url is `/shed`; desktop viewport `/quick` → header IS still visible, no floating menu button |

## Data-safety audit

| Change | Risk |
|---|---|
| Hide header + side nav on /quick/* mobile | Pure conditional render. The components themselves still mount on non-Quick routes; no state machinery is removed. |
| New portal drawer | Mounted only when open. Backed by existing nav-links array — same source of truth. |
| New floating button | Pure presentation. localStorage flag is per-device, not synced to the user's profile. |
| Permission / tier behaviour unchanged | The drawer shows the same nav links the existing nav shows; tier locks are reused as-is. |
| No DB changes, no edge fns, no migrations | — |

## Implementation order

1. **`MobileNavDrawer.tsx`** — portal + slide animation + focus trap. Build with a stub array of links and assert it via Vitest in isolation.
2. **`QuickAccessMenuButton.tsx`** — small button + first-visit label via localStorage. Vitest covers the label-once behaviour.
3. **`App.tsx` wiring** — derive `isFocusMode`, conditionally hide header + side-nav-column, mount the new button + drawer when in focus mode. Pass `navLinks` and the existing handlers through.
4. **Playwright spec** — extend `quick-access.spec.ts` with the new mobile + desktop assertions.
5. **App-reference docs** — update the four screen refs + routing cross-cutting.
6. **Manual test on a phone viewport**:
   - `/quick`: header gone, side nav gone, hamburger top-right.
   - Tap hamburger → drawer slides in.
   - Tap a link → drawer closes + navigates.
   - On a sub-screen (`/quick/calendar`): hamburger top-right doesn't collide with the "← Quick" back arrow top-left.
   - On desktop viewport: nothing changes.
7. **Commit with `[skip ci]`** and `npm run deploy`.

## What this wave doesn't do

- **No new gestures** — edge-swipe-to-open is out of scope for Wave 6. Hamburger only. We can add gesture support in a follow-up if anyone asks.
- **No bottom-tab nav** — not building a phone-style bottom tab bar. The 3 tiles ON the Quick Access home are already the primary navigation.
- **No focus mode for the full Dashboard or any non-`/quick/*` route** — strictly scoped.
- **No pulse animation or onboarding tooltip overlay** — first-visit "Menu" label is the only discoverability aid.
- **No native gesture (back swipe)** changes — the existing browser/Capacitor back gesture continues to work.

## Locked decisions

| Question | Decision |
|---|---|
| Hide header on focus routes? | **Yes — entirely.** |
| Hide side nav on focus routes? | **Yes — entirely (no 80px reservation).** |
| Where does the hamburger go? | **Top-right.** Doesn't conflict with back chrome (top-left) or PlantDoctorChat (bottom-right). |
| Discoverability aid? | **Per-device localStorage flag drives a first-visit "Menu" label** alongside the hamburger. After first interaction it's icon-only forever. |
| Reuse existing nav element or build a new drawer? | **New portal drawer** — keeps the existing nav element untouched + avoids restyling regressions. |
| Scope | **All four `/quick/*` routes**, mobile viewports + Capacitor native only. |

## Open questions

None — the recommendation has been agreed in conversation. Ready to implement.
