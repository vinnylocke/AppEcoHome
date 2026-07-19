# Sidebar Navigation

> Primary nav rail on the left of every authenticated, non-focus screen. Grouped top-level routes with icon + label + optional badge. Collapsible on desktop; slide-in drawer on mobile (which also has the [Bottom Tab Bar](./11-bottom-tab-bar.md) for the five core destinations).

**Source file:** `src/App.tsx` (`<nav>` block — `navLinks` + `NAV_GROUP_LABELS` + grouped render) + `src/components/NavItem.tsx`

---

## Quick Summary

Vertical rail on the `bg-rhozly-primary-container` green, grouped under small uppercase labels — **Garden** (Dashboard, Plants), **Plan** (Planner, Journal, Notes), **AI & Tools** (Tools, Integrations, Head Gardener) — plus a mobile-only **Quick** item at the top. The active item shows a calm left accent bar + white tint (the old white-pill + icon-zoom treatment was retired in the design overhaul). Help Center, Privacy, Cookies pinned at the bottom. Active route highlighted via `routerLocation.pathname` match against `matchPaths`.

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

Current entries (top → bottom): Quick (mobile only) · **Garden:** Dashboard (overdue badge, rose), Plants (`/shed`, `/watchlist`) · **Plan:** Planner (`/planner`, `/shopping`), Journal, Notes · **AI & Tools:** Tools (`/tools`, `/doctor`, `/visualiser`, `/lightsensor`, `/guides`, `/garden-layout`, `/sun-trajectory` — icon `IconTools`/Wrench), Integrations, Head Gardener (`/manager`).

Group labels render only when a group differs from the previous link's group (`NAV_GROUP_LABELS`); the collapsed rail swaps labels for hairline dividers.

### `TAB_URL` registry

Maps `link.id` → destination route. Used by `navigate(TAB_URL[link.id])`.

### Collapsed state

- Desktop: `isNavCollapsed` toggles via header hamburger (w-72 ↔ w-20 icon rail).
- Mobile: `isMobileSidebarOpen` — closed shows the w-20 icon rail; the hamburger expands it.

### Active treatment (NavItem)

`bg-white/10 text-white` tint + absolute left accent bar; inactive is `text-white/60` with `can-hover:hover:` tint (hover gated to real pointers) and an `active:bg-white/15` press state. No layout shift between states (label stays `text-sm`; weight bold → black only).

### Data flow — read paths

Active route from `useLocation()`. Badge counts from App-level state (e.g. `overdueTaskCount`).

### Edge functions / Cron / Realtime / Tier gating / Beta gating

None directly (badges may rely on parents that subscribe).

### Permissions

Items requiring permissions may be hidden if the user lacks them.

### Error states

None — sidebar always renders outside focus mode.

### Performance

- Width transitions via CSS only; active state is `transition-colors` (no transform/layout work).
- Active state computed per-render but lightweight.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use the sidebar

The full map of the app, now grouped the way you think: **Garden** is what's growing, **Plan** is what's next, **AI & Tools** is the clever kit. The quiet white bar on the left edge of an item shows where you are.

On mobile you'll mostly live in the [bottom bar](./11-bottom-tab-bar.md) — the sidebar is for everything beyond the core five (Journal, Notes, Integrations, Head Gardener).

### Every flow

1. **Navigate** — tap an item.
2. **Collapse / expand (desktop)** — hamburger in the header toggles the wide rail down to icons.
3. **Mobile drawer** — hamburger expands the icon rail; tapping an item navigates and tucks it away.

### Tier-by-tier experience

Same layout. Some items may be hidden based on tier / permissions.

### Common mistakes / pitfalls

- **Looking for sub-tabs in the sidebar.** Sub-tabs (e.g. Planner vs Shopping) live within the parent screen.
- **Expecting Plant Doctor under its own sidebar item.** It lives under Tools here — but it has its own tab in the mobile bottom bar.

### Recommended workflows

- Memorise the three groups — Garden / Plan / AI & Tools — and the rail becomes muscle memory in days.

### What to do if something looks wrong

- **Active state wrong:** `matchPaths` in App.tsx may not include the current path. File a bug.
- **Sidebar won't collapse:** breakpoint flag stuck; resize window or refresh.

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
