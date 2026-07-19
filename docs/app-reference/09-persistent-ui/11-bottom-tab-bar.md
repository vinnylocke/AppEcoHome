# Bottom Tab Bar (Mobile)

> Thumb-reach navigation bar fixed to the bottom of every non-focus screen on mobile. Five core destinations, one tap each — previously every navigation was two taps via the hamburger drawer.

**Source file:** `src/components/BottomTabBar.tsx`, mounted from `src/App.tsx` (guarded `!isFocusMode`).

---

## Quick Summary

Mobile-only (`md:hidden`) fixed bar with five tabs: **Home** (`/dashboard`), **Plants** (`/shed`), **Doctor** (`/doctor`), **Planner** (`/planner`), **Tools** (`/tools`). Active tab is derived from the route; Home carries the overdue-task badge. Hidden entirely in focus mode (`/quick` routes own their chrome) and on desktop (the sidebar owns navigation there).

---

## Role 1 — Technical Reference

### Component graph

```
BottomTabBar (nav, aria-label="Quick navigation", data-testid="bottom-tab-bar")
└── button × 5 (data-testid="bottom-tab-{id}")
    ├── active indicator (top hairline pill)
    ├── icon (lucide, strokeWidth 1.75 / 2.2 when active)
    ├── badge (Home only — overdue count, bg-rhozly-error)
    └── label (text-3xs)
```

### Props

| Prop | Type | Notes |
|---|---|---|
| `tabs` | `BottomTab[]` | Built inline in App.tsx (`bottomTabs`) — id, label, icon, to, matchPaths, badge?, ariaLabel? |
| `currentPath` | `string` | `routerLocation.pathname` |
| `onNavigate` | `(to: string) => void` | `navigate(to)` |

### Active-state contract

Same semantics as the sidebar: exact path match or `path + "/"` prefix. The **Doctor tab owns `/doctor`**, so the Tools tab's `matchPaths` here deliberately exclude `/doctor` (unlike the sidebar's Tools entry, which still includes it) — both bars highlight exactly one tab on any route.

**Orphan-route folding (Phase 5 IA).** Routes without their own bottom tab fold into a core tab's `matchPaths` so exactly one tab stays lit. The five tabs themselves (Home / Plants / Doctor / Planner / Tools) are unchanged; only their `matchPaths` were widened:

| Tab | `matchPaths` |
|---|---|
| **Home** (`/dashboard`) | `/dashboard`, `/management`, `/home-management` |
| **Plants** (`/shed`) | `/shed`, `/watchlist` |
| **Doctor** (`/doctor`) | `/doctor` |
| **Planner** (`/planner`) | `/planner`, `/shopping`, `/schedule`, `/journal`, `/notes` |
| **Tools** (`/tools`) | `/tools`, `/visualiser`, `/lightsensor`, `/guides`, `/garden-layout`, `/sun-trajectory`, `/weekly` |

Note the mobile-specific behaviour: with no Journal tab on mobile, `/journal` and `/notes` fold under **Planner** (on desktop the sidebar has a dedicated Journal item). Likewise `/schedule` (Routines) → Planner, `/weekly` (Weekly Overview) → Tools, and `/management` + `/home-management` (Location Manager / home management) → Home.

### Visibility & layering

- `md:hidden` — desktop never sees it, so its `aria-label="Plant Doctor"` cannot collide with desktop nav assertions (display:none is excluded from the accessibility tree). E2E coverage: `layout.spec.ts` NAV-009 drives it under a forced 375×812 viewport; NAV-010 asserts it is hidden at desktop size.
- Suppressed in focus mode via the `!isFocusMode` guard in App.tsx.
- `z` from `Z.nav` (40) — below every modal (120+) and below the sticky header (z-50; the header's stacking context contains the account-menu dropdown, which must paint over the bar); above page content.
- Main content reserves the zone via `pb-28 md:pb-8`; the PlantDoctorChat FAB moved to `bottom-20 right-4` on mobile (`md:bottom-6 md:right-6` on desktop) to clear it.
- Safe area: `pb-[env(safe-area-inset-bottom)]` for gesture-nav phones.

### Performance

This is the screen's **one allowed backdrop-blur surface** (design-system budget): `bg-rhozly-surface-lowest/90 backdrop-blur-md` — 12px static blur, never animated, 90 %-opaque fallback tone so contrast holds outdoors. Press feedback is `active:scale-95` (compositor-only).

### Tier gating / Beta gating / Permissions / Edge functions / Cron / Realtime

None. The badge count is passed in from App.tsx's existing `overdueTaskCount`.

### Error states

None — pure presentational.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why this exists

With one hand on the phone and the other in the soil, the hamburger menu was a reach. The bar keeps the five places you actually live — your day (Home), your plants, the Doctor, your plans, and the toolbox — one thumb-tap away, always.

### Every flow

1. **Jump between core screens** — tap a tab; the green label and the little bar above the icon show where you are.
2. **See what's overdue at a glance** — the red count on Home is your overdue tasks; it clears as you complete them.
3. **Get help for a struggling plant fast** — Doctor is now a first-class destination, not buried in Tools.

### Information on display — what every field means

| Element | Meaning |
|---|---|
| Green tab + top bar | The screen you're on |
| Red count on Home | Overdue tasks across the home |
| Grey tabs | One tap away |

### Tier-by-tier experience

Identical for every tier.

### Common mistakes / pitfalls

- **Looking for the bar on `/quick` screens** — focus-mode screens (Quick Access, Garden Walk) intentionally hide it; use their own corner buttons.
- **Looking for Journal/Notes/Integrations here** — only the top five live in the bar; everything else stays in the sidebar (hamburger). When you open one of those, the nearest core tab stays lit — e.g. the Journal (and its Notes tab) keeps **Planner** highlighted.

### What to do if something looks wrong

- **Bar covers content:** that screen is missing the standard mobile bottom padding — report it; the shell reserves the space on every padded route.
- **Two tabs look active:** a route is matched by two tabs' `matchPaths` — file a bug with the URL.

---

## Related reference files

- [Sidebar Navigation](./02-sidebar.md) — the full nav (desktop + mobile drawer)
- [Header / Top Bar](./01-header.md)
- [Quick Access Home](../02-dashboard/09-quick-access-home.md) — the focus-mode world where the bar hides
- [Design System](../99-cross-cutting/40-design-system.md) — blur budget, press language, `Z` ladder
- [Routing](../99-cross-cutting/21-routing.md)

## Code references for ongoing maintenance

- `src/components/BottomTabBar.tsx`
- `src/App.tsx` — `bottomTabs` array + `!isFocusMode` mount
- `src/components/PlantDoctorChat.tsx` — FAB offset that clears the bar
