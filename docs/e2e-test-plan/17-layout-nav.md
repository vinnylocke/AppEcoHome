# 17. Global Layout & Navigation

**Spec file:** `tests/e2e/specs/layout.spec.ts`
**Seed dependencies:** `00_bootstrap.sql`
**App-reference:** [09-persistent-ui/](../app-reference/09-persistent-ui/)

## Tests

> Table rewritten 2026-07-19 to match the actual spec contents — the previous rows described tests that no longer exist under those IDs (doc drift). Note the spec currently contains two tests labelled "NAV-004" (back-navigation and HomeDropdown) — distinguished below.

| ID | Type | Description | Mock | Status |
|---|---|---|---|---|
| NAV-001 | ✅ | All primary nav links present on dashboard (Dashboard, Plants, Planner, Journal, Tools) | — | ✅ Passing |
| NAV-002 | ✅ | Sidebar menu toggle (Lucide Menu icon) present | — | ✅ Passing |
| NAV-003 | ✅ | Desktop nav click updates URL — "Tools" → `/tools` (repointed 2026-07-19: no desktop button is named "Plant Doctor"; mobile Doctor nav is NAV-009) | — | ✅ Passing |
| NAV-004 (a) | ✅ | Back to `/dashboard` from `/doctor` via Dashboard nav button | — | ✅ Passing |
| NAV-004 (b) | ✅ | HomeDropdown — "Create New Home" button appears in dropdown | — | ✅ Passing |
| NAV-005 | ✅ | App renders at 1280×800 desktop viewport | — | ✅ Passing |
| NAV-006 | ✅ | Phone has exactly one primary nav — bottom bar, not the sidebar rail: at 375×812, `bottom-tab-bar` is visible and `<nav aria-label="Primary navigation">` count is 0 (the sidebar rail is desktop-only since Phase 6a — this guards the old "two nav bars on mobile" regression) | — | ✅ Passing |
| NAV-007 | ✅ | Sign Out reachable — profile trigger (now a real "Account menu" button) opens dropdown with Sign Out (test rewritten 2026-07-19 alongside the a11y fix) | — | ✅ Passing |
| NAV-008 | ✅ | HomeDropdown shows seeded home name "Test Garden Home" | — | ✅ Passing |
| NAV-009 | ✅ | The Deck navigates core screens + the Capture FAB opens the sheet (375×812): `bottom-tab-bar` visible; `bottom-tab-shed` → `/shed` and `bottom-tab-dashboard` → `/dashboard` (with `aria-current`); `bottom-tab-capture` opens `capture-sheet`, whose `capture-diagnose` hero navigates to `/doctor` (rewritten Phase 6b — Doctor lost its dedicated slot; it's now the Capture sheet's hero) | — | ✅ Passing |
| NAV-010 | ✅ | Bottom tab bar hidden at 1280×800 desktop viewport (`md:hidden`) | — | ✅ Passing |
| NAV-012 | ✅ | Mobile: the Deck's **Tasks** slot (`bottom-tab-tasks`, 2026-07-22) opens the Today's-Tasks tray; `bottom-tab-planner` is gone; the header trigger is hidden on phone; Planner reachable via More → Shelf | — | ✅ Passing |
| NAV-011 | ✅ | The Deck's More slot opens the Shelf drawer; Journal reachable via the overflow: at 375×812 the Deck's `bottom-tab-more` (`aria-label="More menu"`) opens the `mobile-nav-drawer` (`role="dialog"`), and the Journal item in the overflow navigates to `/journal` (retargeted Phase 6b — the mobile Shelf entry point moved from the header hamburger to the Deck's More slot) | — | ✅ Passing |

> The mobile bottom tab bar (`data-testid="bottom-tab-bar"`) shipped with the design overhaul Phase 4.1 — see [09-persistent-ui/11-bottom-tab-bar.md](../app-reference/09-persistent-ui/11-bottom-tab-bar.md). **Phase 6a** made it the *sole* primary nav on phones: the desktop sidebar rail is gated behind `isMdBreakpoint` and never co-renders on mobile (NAV-006). **Phase 6b** reshaped it into the **Deck** — slots `bottom-tab-{dashboard\|shed\|capture\|planner\|more}` (a raised centre **Capture** FAB replaces the old flat Doctor/Tools tabs). Plant Doctor is now reached via the Capture FAB → `capture-sheet` → `capture-diagnose` (NAV-009), and the long-tail destinations move to the **Shelf** — the app-level `MobileNavDrawer` (`data-testid="mobile-nav-drawer"`) the Deck's `bottom-tab-more` slot opens (NAV-011).
