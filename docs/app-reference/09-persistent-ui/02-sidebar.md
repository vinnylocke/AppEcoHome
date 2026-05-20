# Sidebar Navigation

> Primary nav rail on the left of every authenticated screen. Lists every top-level route with icon + label + optional badge. Collapsible on desktop; slide-in drawer on mobile.

**Source file:** `src/App.tsx` (`<nav>` block, ~lines 910-958) + `NavItem` component (inline or in `src/components/`)

---

## Quick Summary

Vertical nav with one item per route: Dashboard, Garden Hub, Planner Hub, Tools Hub, Schedule, Watchlist, Visualiser, etc. Each NavItem shows an icon + label (when expanded) + optional badge count (e.g. tasks due today). Help Center, Privacy, Cookies links pinned at the bottom. Active route highlighted via `routerLocation.pathname` match against `matchPaths`.

---

## Role 1 — Technical Reference

### Component graph

```
nav (left rail)
├── NavItem × N (primary routes)
│   ├── Icon
│   ├── Label
│   └── Badge (optional)
└── Footer
    ├── Help Center button
    └── Privacy / Cookie policy links
```

### `navLinks` registry (in App.tsx)

Each link has:
```ts
{
  id, icon, label,
  matchPaths: string[],   // for active state
  badge?: number | string,
  badgeTone?: "primary" | "warning" | "danger",
}
```

### `TAB_URL` registry

Maps `link.id` → destination route. Used by `navigate(TAB_URL[link.id])`.

### Collapsed state

- Desktop: `isNavCollapsed` toggles via header hamburger.
- Mobile: separate `isMobileSidebarOpen` slide-over.

### Data flow — read paths

Active route from `useLocation()`. Badge counts from various hooks (e.g. `useTodaysTaskCount`).

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None directly. Badges may rely on parents that do.

### Tier gating

Some links may be hidden / disabled per tier (rare; most routes are universal).

### Beta gating

None.

### Permissions

Items requiring permissions may be hidden if the user lacks them.

### Error states

None — sidebar always renders.

### Performance

- Width transitions via CSS only.
- Active state computed per-render but lightweight.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use the sidebar

The map of the app. Tap any item → that screen. Active state shows where you are.

Mobile: hamburger → slide-over.
Desktop: always visible (collapsible icon-only).

### Every flow

#### 1. Navigate

- Tap an item.

#### 2. Collapse / expand (desktop)

- Hamburger in header toggles.

#### 3. Mobile drawer

- Hamburger opens; tap an item closes drawer + navigates.

### Tier-by-tier experience

Same layout. Some items may be hidden based on tier / permissions.

### Common mistakes / pitfalls

- **Looking for sub-tabs in the sidebar.** Sub-tabs (e.g. Planner vs Shopping) live within the parent screen, not in the sidebar.

### Recommended workflows

- Memorise the icon order — sidebar becomes muscle memory in days.

### What to do if something looks wrong

- **Active state wrong:** `matchPaths` in App.tsx may not include the current path. File a bug.
- **Sidebar won't collapse:** breakpoint flag stuck; resize window or refresh.

---

## Related reference files

- [Header / Top Bar](./01-header.md)
- [Help Center](../08-modals-and-overlays/24-help-center.md)
- [Routing (cross-cutting)](../99-cross-cutting/21-routing.md)

## Code references for ongoing maintenance

- `src/App.tsx` — nav block + `navLinks` + `TAB_URL`
- `NavItem` component (in App.tsx or extracted)
