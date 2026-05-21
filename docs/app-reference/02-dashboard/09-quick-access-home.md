# Quick Access Home

> The mobile shortcut home. A four-tile screen tuned for one-thumb operation in the garden — Visual Lens (live), Today (live → Localized Task Calendar), Quick Capture (live → Quick Capture Journal), and The Library (live → /library/*). Phone users land here on app open instead of the full dashboard; the full dashboard is still a tap away.

**Route:** `/quick`
**Source files (entry points):**
- `src/components/QuickAccessHome.tsx`
- `src/components/quick/QuickTile.tsx`
- `src/components/QuickAccessLens.tsx` (the `/quick/lens` mounting wrapper)

---

## Quick Summary

A focused, opinionated mobile home page that surfaces the three in-the-garden tasks Rhozly handles best — analyse a plant, see today's tasks + rain, capture a note. Phone viewports (width < 768px OR `Capacitor.isNativePlatform()`) land here on `/`; desktop continues to `/dashboard`. The side nav and top bar stay so users can drop into any full screen at any time.

---

## Role 1 — Technical Reference

### Component graph

```
QuickAccessHome (mounted at /quick)
├── Focus-mode chrome (mobile only, Wave 6) — see App.tsx isFocusMode branch
│   ├── (no top bar / no persistent side nav — both hidden on /quick/*)
│   ├── QuickAccessMenuButton (floating top-right hamburger; first-visit "Menu" label)
│   └── MobileNavDrawer (slide-in from left when the button is tapped)
├── Desktop preview banner (visible when useIsMobile() === false)
│   └── "This is the mobile shortcut screen — your full dashboard is at /dashboard"
├── Hero ("What can I help with?" + subtitle)
├── QuickTile × 4
│   ├── Visual Lens (live)        → navigate("/quick/lens")
│   ├── Today (live)               → navigate("/quick/calendar") [LocalizedTaskCalendar]
│   ├── Quick Capture (live)       → navigate("/quick/journal") [QuickCapture]
│   └── The Library (live)         → navigate("/library/search") [LibraryHome — see ./12-the-library.md]
└── "Open full dashboard →" link  → navigate("/dashboard")

QuickAccessLens (mounted at /quick/lens)
├── Back chrome (chevron-left "Quick" + "Visual Lens" label)
└── PlantDoctor compact   ← the existing /doctor screen, in compact mode
```

### Props received

`QuickAccessHome` takes no props. `QuickAccessLens` receives the same props the desktop `/doctor` route passes to `PlantDoctor`:

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |
| `userId` | `string?` | App.tsx | History scoping |
| `aiEnabled` | `boolean` | App.tsx | Gates the Analyse action |
| `isPremium` | `boolean` | App.tsx | Some premium sub-flows |
| `perenualEnabled` | `boolean` | App.tsx | Plant DB lookups |
| `onTasksAdded` | `() => void` | App.tsx | Refresh dashboard after tasks commit |

### State (local)

None. `QuickAccessHome` is a stateless presentation component. `QuickAccessLens` defers all state to the underlying `PlantDoctor` in compact mode.

### Data flow — read paths

None directly. `QuickAccessLens` mounts `PlantDoctor` which makes its own reads ([Plant Doctor](../05-tools/02-plant-doctor.md)).

### Data flow — write paths

None directly. Tasks committed via the Analyse flow inside `/quick/lens` go through `TaskActionButtons` → `task_blueprints` / `tasks` / `task_dependencies` (the same path the chat uses).

### Edge functions invoked

None directly. The lens screen invokes `plant-doctor` (action `analyse_comprehensive`) — see [Plant Doctor](../05-tools/02-plant-doctor.md).

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None.

### Tier gating

- **Sprout / Botanist** — Visual Lens tile remains visible, but tapping into `/quick/lens` shows the AI-tier-required lock on the Analyse button (handled by the underlying `PlantDoctor` AI gate).
- **Sage / Evergreen** — Full access. Visual Lens fully usable.

### Beta gating

None. (Wave 2 ships to all users.)

### Permissions / role-based UI

None. The Quick Access Home and Lens screens read no per-permission data themselves; the underlying Plant Doctor enforces `inventory.write`, `planner.write`, etc. on its own actions.

### Error states

| State | Result |
|-------|--------|
| Profile not yet loaded | The route is mounted inside the standard `AppShell` auth/profile guard, so users never reach `/quick` without a loaded profile |
| `PlantDoctor` Suspense fallback | Spinner inside the lens wrapper while the lazy chunk loads |
| Toast on coming-soon tile fails to render | n/a — `react-hot-toast` failures are silent and the tap is non-destructive |

### Performance notes

- `QuickAccessHome` and `QuickAccessLens` are lazy-loaded via `lazy(() => import(...))` in `App.tsx`. Splits the Quick Access chunk from the dashboard/shed/planner chunks.
- `QuickAccessLens` uses `Suspense` to lazy-load `PlantDoctor` so the Quick Access bundle stays small.
- `useIsMobile()` uses `useSyncExternalStore` so it doesn't trigger unnecessary re-renders.

### Linked storage buckets

None directly. The lens screen writes to `doctor-sessions` and `plant-doctor-images` via the underlying `PlantDoctor`.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

You're outside, holding a phone, hands probably full or gloves on, with a question that wants an answer **now**: "What is this?" "What's wrong with it?" "When can I plant this?" "Let me jot this down before I forget." The Quick Access Home exists for that moment — it doesn't ask you to navigate, it asks one question: *what can I help with?* and gives you three big tap targets.

It's not a replacement for the full app — it's a fast path to the three things you'll actually do while standing in a bed of plants. Power users can ignore it and tap straight through to the dashboard. Beginners get pointed at the right tool without having to learn the menu.

### Every flow on this page

#### 1. Tap Visual Lens

- **What you see**: a green-accented tile with a camera icon, "Visual Lens", and the description.
- **What you do**: tap.
- **What happens next**: routes to `/quick/lens` — a slimmed-down Plant Doctor with only the Analyse action. Take a photo, hit Analyse, get the full report (identification, health, pruning, propagation, edibility, optional disease + pest) plus a list of pre-checked tasks you can add to your calendar in one tap.
- **Why a gardener cares**: this is the "snap a photo and tell me everything" moment — the heart of why someone holds their phone over a plant.
- **Beginner framing**: "I don't know what this is — tell me." **Expert framing**: "Quick second opinion on this leaf without scrolling through the full Plant Doctor."

#### 2. Tap "Today" tile (live in Wave 3)

- **What you see**: a tile with a calendar icon, "Today", and a description of what you'll find.
- **What you do**: tap.
- **What happens next**: routes to `/quick/calendar` — the [Localized Task Calendar](./10-localized-task-calendar.md). Frost-aware planting helper at the top, rain-vs-watering advice in the middle, today's pending tasks at the bottom.
- **Why a gardener cares**: this is the "what should I do today, and what's still time to plant?" screen, anchored to your home's actual climate.

#### 3. Tap "Quick Capture" tile (live in Wave 4)

- **What you see**: a tile with a notebook icon, "Quick Capture", and a description.
- **What you do**: tap.
- **What happens next**: routes to `/quick/journal` — the [Quick Capture Journal](./11-quick-capture-journal.md). Snap a photo + jot a note + Save. Captures land in `plant_journals` without an `inventory_item_id` and stay in the Recent Captures list until you assign them to a specific plant from any device.
- **Why a gardener cares**: removes the friction of finding the exact plant in your Shed when you spot something in the moment. Capture first, file later.

#### 4. "Open full dashboard →" link

- **What you see**: a quiet link at the bottom of the screen.
- **What you do**: tap.
- **What happens next**: lands on `/dashboard` with the full nav.
- **Why a gardener cares**: power-user escape hatch — sometimes you opened the app to do something specific and don't want a hub screen in between.

#### 5. Side nav

- The "Quick" entry in the side nav (mobile-only) returns you here from any other screen.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Hero title "What can I help with?" | The screen's question to you — pick a tile or open the dashboard |
| Visual Lens tile description | One-line summary of what Analyse does |
| "Coming soon" badge | This surface ships in a later wave; tap shows the closest equivalent today |
| Mobile shortcut banner | Shown only on desktop — explains this is the mobile home page and links back to `/dashboard` |
| "Open full dashboard →" link | Direct route to the full Dashboard |

### Tier-by-tier experience

| Tier | Differences |
|------|-------------|
| Sprout / Botanist | All tiles visible; tapping Visual Lens routes to `/quick/lens` where the Analyse button is AI-tier-gated and shows the same lock overlay as `/doctor` |
| Sage / Evergreen | Full functionality |

### New user vs returning user vs power user

- **Brand new user**: lands here on first phone open. Three big tiles, no overwhelm. Visual Lens tile is the obvious first tap.
- **Returning user**: glance at tiles → pick the one for the current moment.
- **Power user**: probably uses the side nav to skip Quick Access and go straight to the screen they want. The "Open full dashboard" link handles the case where they wanted the dashboard.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Tapping a "Coming soon" tile expecting it to do something.** The toast tells you where to find the closest equivalent today.
- **Missing the side nav on small phones.** It collapses to icon-only; tap the hamburger to expand.
- **Thinking Quick Access replaces the dashboard.** It doesn't — it's just the new front door for phones. Everything you already had is one nav tap away.

### Recommended workflows

- **In the garden, weird leaf:** Quick Access → Visual Lens → photo → Analyse → add suggested tasks. Done.
- **At the kitchen table, planning for the week:** Quick Access → "Open full dashboard →".
- **Coming back from a holiday, lots to catch up on:** Open full dashboard from here, then dive into Plants / Planner.

### What to do if something looks wrong

- **Quick Access showed up on my desktop browser:** that's fine — the redirect from `/` only fires for narrow viewports + native. You can bookmark `/dashboard` if you don't want to see it.
- **Toast on a "Coming soon" tile didn't appear:** check `react-hot-toast` is mounted globally (it is, in `App.tsx`).
- **"Quick" missing from side nav on desktop:** intentional — it's only shown on mobile.

---

## Related reference files

- [Plant Doctor](../05-tools/02-plant-doctor.md) — the underlying Analyse flow; `/quick/lens` mounts it in `compact` mode
- [Home Dashboard](./01-home-dashboard.md) — the desktop home; reachable from Quick Access via "Open full dashboard"
- [Routing](../99-cross-cutting/21-routing.md) — `/`, `/quick`, `/quick/lens` route definitions; documents the Wave 6 focus-mode exclusion of the persistent chrome
- [Capacitor](../99-cross-cutting/23-capacitor.md) — `Capacitor.isNativePlatform()` usage in `useIsMobile`

**Focus-mode components (Wave 6):**
- `src/components/MobileNavDrawer.tsx` — slide-in nav drawer, reuses `navLinks`
- `src/components/QuickAccessMenuButton.tsx` — floating hamburger top-right with first-visit "Menu" label

## Code references for ongoing maintenance

- `src/components/QuickAccessHome.tsx` — the three-tile home
- `src/components/quick/QuickTile.tsx` — reusable tile (live / coming-soon variants)
- `src/components/QuickAccessLens.tsx` — `/quick/lens` wrapper around PlantDoctor (compact mode)
- `src/components/PlantDoctor.tsx` — accepts a `compact?: boolean` prop; when true, hides the tab bar + secondary action row
- `src/hooks/useIsMobile.ts` — `Capacitor.isNativePlatform() || viewport < 768px`
- `src/App.tsx` — conditional `/` redirect, `/quick` + `/quick/lens` routes, mobile-only "Quick" nav entry
- `tests/unit/hooks/useIsMobile.test.ts` — hook unit tests
- `tests/unit/components/QuickTile.test.ts` — tile unit tests
- `tests/unit/components/QuickAccessHome.test.ts` — home screen unit tests
- `tests/e2e/specs/quick-access.spec.ts` — routing + nav visibility E2E
