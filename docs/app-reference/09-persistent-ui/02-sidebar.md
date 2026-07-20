# Sidebar Navigation

> Primary nav rail on the left of every authenticated, non-focus screen — **desktop-only since Phase 6a**. Grouped top-level routes with icon + label + optional badge, collapsible to an icon rail. On phones the rail does not render at all; phone navigation is the [Bottom Tab Bar](./11-bottom-tab-bar.md) (five core destinations) plus the **Shelf** — the `MobileNavDrawer` overflow drawer opened by the header hamburger.

**Source file:** `src/App.tsx` (`<nav>` block — `navLinks` + `NAV_GROUP_LABELS` + grouped render) + `src/components/NavItem.tsx`

---

## Quick Summary

**Desktop-only** vertical rail (Phase 6a — the render gate is `{!isFocusMode && isMdBreakpoint && (…)}`, so phones never see it) on the `bg-rhozly-primary-container` green, grouped under small uppercase labels — **Garden** (Dashboard, Plants), **Plan** (Planner, Journal), **AI & Tools** (Tools, Integrations, Head Gardener — Evergreen only). The rail's NavItems now always pass `isMobile={false}`. (The standalone **Notes** item was retired in the Phase 5 IA pass — Notes is now a tab inside the Journal hub.) The mobile-only **Quick** item still lives in `navLinks` but, since the rail is desktop-only, it now surfaces in the **Shelf** (the `MobileNavDrawer`) rather than the rail. The active item shows a calm left accent bar + white tint (the old white-pill + icon-zoom treatment was retired in the design overhaul). Help Center, Privacy, Cookies pinned at the bottom. Active route highlighted via `routerLocation.pathname` match against `matchPaths`. On phones, primary nav is the [Bottom Tab Bar](./11-bottom-tab-bar.md) plus the Shelf overflow drawer — see the collapsed-state note below.

---

## Role 1 — Technical Reference

### Component graph

```
nav (left rail, aria-label="Primary navigation")
├── per group: label row (expanded) | hairline divider (collapsed)
├── NavItem × N (primary routes)
│   ├── active left accent bar (white, 4px, rounded)
│   ├── Icon (lucide, w-6 h-6, no scale states)
│   ├── Label (text-sm; font-black when active)
│   └── Badge (optional count, amber | rose | primary tones)
└── Footer
    ├── Help Center button
    └── Privacy / Cookie policy links
```

### `navLinks` registry (in App.tsx)

```ts
{
  id, icon, label,
  matchPaths: string[],            // exact match or prefix + "/"
  badge?: number,
  badgeTone?: "amber" | "rose" | "primary",
  group?: "garden" | "plan" | "ai", // section label; Quick is ungrouped
}
```

Current entries (top → bottom): Quick (mobile only) · **Garden:** Dashboard (`/dashboard`, `/management`, `/home-management`, `/` on desktop — overdue badge, rose), Plants (`/shed`, `/watchlist`) · **Plan:** Planner (`/planner`, `/shopping`, `/schedule`), Journal (`/journal`, `/notes`) · **AI & Tools:** Tools (`/tools`, `/doctor`, `/visualiser`, `/lightsensor`, `/guides`, `/garden-layout`, `/sun-trajectory`, `/weekly` — icon `IconTools`/Wrench), Integrations, Head Gardener (`/manager` — **Evergreen only**, see below).

The **Notes** item was removed in the Phase 5 IA pass — Notes is now a tab inside the Journal hub, so the **Journal** item's `matchPaths` cover both `/journal` and `/notes`.

**Orphan-route reparenting (Phase 5 IA):** routes without their own nav item fold into a parent's `matchPaths` so the active-nav highlight resolves when you land on them — `/schedule` (Routines) → **Planner**, `/weekly` (Weekly Overview) → **Tools**, `/management` + `/home-management` (Location Manager / home management) → **Dashboard**, `/notes` → **Journal**.

**Conditional Head Gardener:** the Head Gardener item (`id: "manager"`, `/manager`) is only rendered when `tierAllowsFeature(profile.subscription_tier, "head_gardener")` is true — i.e. Evergreen tier (`head_gardener` is Evergreen-gated in `src/constants/tierFeatures.ts`). Lower tiers don't see the nav entry at all, but the `/manager` route still exists and renders its own `FeatureGate` upgrade wall for anyone who deep-links in. **Integrations is deliberately left visible for every tier** (first-run discoverability — hiding it would strand users trying to add their first device).

Group labels render only when a group differs from the previous link's group (`NAV_GROUP_LABELS`); the collapsed rail swaps labels for hairline dividers.

### `TAB_URL` registry

Maps `link.id` → destination route. Used by `navigate(TAB_URL[link.id])`.

### Render gate & collapsed state

- **Desktop only.** The rail renders solely at the `md` breakpoint and up — `{!isFocusMode && isMdBreakpoint && (<nav …>)}`. Phones never render it.
- **Desktop collapse:** `sidebarIsCollapsed` (now just `isNavCollapsed` — the old `isMobileSidebarOpen` branch was deleted) toggles via the header hamburger (w-72 ↔ w-20 icon rail) and persists to `localStorage` (`rhozly_nav`).
- **Mobile:** the rail does not render. Phones get the [Bottom Tab Bar](./11-bottom-tab-bar.md) for the core five, plus the **Shelf** — the app-level `MobileNavDrawer` overflow drawer — for everything else; the header hamburger opens the Shelf. The old `isMobileSidebarOpen` state, its matchMedia reset, and the w-20-rail-on-mobile treatment were **removed in Phase 6a**: they caused the sidebar to co-render with the bottom tab bar, stacking two nav bars on phones.

### Active treatment (NavItem + sliding marker)

`bg-white/10 text-white` tint on the active item; inactive is `text-white/60` with `can-hover:hover:` tint (hover gated to real pointers) and an `active:bg-white/15` press state. No layout shift between states (label stays `text-sm`; weight bold → black only).

**Phase 6d — the left accent is now ONE sliding marker**, not a per-item bar. It lives in the nav's scroll container (`navScrollRef` in App.tsx) and slides on `transform` (ease-spring) to the active item, measured from the live DOM (`querySelector('[aria-current="page"]')` → `offsetLeft`/`offsetTop`, so it hugs the button's left edge in both the expanded rail and the collapsed w-20 rail). A `ResizeObserver` re-measures on collapse/expand. Opacity 0 when nothing in the rail is active. This mirrors the Deck's marker (`BottomTabBar`) so the active indicator reads as the same element gliding across both platforms.

### Data flow — read paths

Active route from `useLocation()`. Badge counts from App-level state (e.g. `overdueTaskCount`).

### Edge functions / Cron / Realtime / Beta gating

None directly (badges may rely on parents that subscribe).

### Tier gating

The **Head Gardener** item is tier-gated at the nav level — it only renders when `tierAllowsFeature(profile.subscription_tier, "head_gardener")` is true (Evergreen). Lower tiers never see the entry; the `/manager` route itself remains reachable via deep-link and renders its own `FeatureGate` upgrade wall. **Integrations is intentionally NOT nav-gated** — it stays visible for all tiers so first-run users can find where to add a device. No other item is tier-gated in the rail.

### Permissions

Items requiring permissions may be hidden if the user lacks them.

### Error states

None — the rail renders only outside focus mode and at the `md` breakpoint and up; it has no data-fetching failure surface.

### Performance

- Width transitions via CSS only; active state is `transition-colors` (no transform/layout work).
- Active state computed per-render but lightweight.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use the sidebar

The full map of the app, now grouped the way you think: **Garden** is what's growing, **Plan** is what's next, **AI & Tools** is the clever kit. The quiet white bar on the left edge of an item shows where you are.

On a phone there is no sidebar at all (Phase 6a) — the rail is a desktop convenience. You live in the [bottom bar](./11-bottom-tab-bar.md) for the core five, and reach everything beyond it (Journal, Integrations, and — on Evergreen — Head Gardener) through the **Shelf**: the overflow drawer the header hamburger slides in. Notes now lives as a tab inside Journal rather than as its own item.

### Every flow

1. **Navigate (desktop)** — tap an item in the rail.
2. **Collapse / expand (desktop)** — the hamburger in the header toggles the wide rail down to icons (remembered between sessions).
3. **Mobile overflow (the Shelf)** — on a phone the rail is gone; the header hamburger opens the Shelf drawer, which lists the same grouped items. Tap one to navigate and the drawer closes.

### Tier-by-tier experience

Same layout, with one difference: **Head Gardener only appears on Evergreen**. Lower tiers don't see it in the rail (though the screen is still reachable by direct link, where it shows an upgrade wall). Integrations, by contrast, is shown to everyone so a first device is always easy to add. Other items may still be hidden by permissions.

### Common mistakes / pitfalls

- **Looking for sub-tabs in the sidebar.** Sub-tabs (e.g. Planner vs Shopping) live within the parent screen.
- **Expecting Plant Doctor under its own sidebar item.** It lives under Tools here — but it has its own tab in the mobile bottom bar.

### Recommended workflows

- Memorise the three groups — Garden / Plan / AI & Tools — and the rail becomes muscle memory in days.

### What to do if something looks wrong

- **Active state wrong:** `matchPaths` in App.tsx may not include the current path. File a bug.
- **Sidebar won't collapse:** breakpoint flag stuck; resize window or refresh.
- **Sidebar showing on a phone:** it shouldn't since Phase 6a (the rail is `md`-and-up only). If you see the rail and the bottom bar at once, that's the old two-nav-bar regression — file a bug.

---

## Related reference files

- [Bottom Tab Bar](./11-bottom-tab-bar.md)
- [Header / Top Bar](./01-header.md)
- [Help Center](../08-modals-and-overlays/24-help-center.md)
- [Design System](../99-cross-cutting/40-design-system.md)
- [Routing (cross-cutting)](../99-cross-cutting/21-routing.md)

## Code references for ongoing maintenance

- `src/App.tsx` — nav block + `navLinks` + `NAV_GROUP_LABELS` + `TAB_URL` + `bottomTabs`
- `src/components/NavItem.tsx`
- `src/components/BottomTabBar.tsx`
