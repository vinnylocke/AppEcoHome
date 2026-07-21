# Bottom Tab Bar — "The Deck" (Mobile)

> Thumb-reach navigation bar fixed to the bottom of every non-focus screen on mobile. **Since Phase 6b it is the "Deck"**: four flat destinations wrapped around a raised centre **Capture** FAB — **Home / Plants / [Capture] / Planner / More**. The old flat five-tab layout (with dedicated Doctor + Tools slots) is gone; Plant Doctor is now reached through the Capture FAB's hero action, and Tools + the long tail through the **More → Shelf** slot. **Since Phase 6a it is the SOLE primary nav on phones** — the desktop sidebar no longer co-renders on mobile, so nothing competes with it.

**Source file:** `src/components/BottomTabBar.tsx`, mounted from `src/App.tsx` (guarded `!isFocusMode`).

---

## Quick Summary

Mobile-only (`md:hidden`) fixed bar with five slots: **Home** (`/dashboard`), **Plants** (`/shed`), the raised **Capture** FAB (centre — opens the [Capture sheet](../08-modals-and-overlays/41-capture-sheet.md)), **Planner** (`/planner`), and **More** (opens the **Shelf** overflow drawer). Only the three destination tabs derive an active state from the route; the Capture FAB and More are **actions**, not destinations, so they never light. Home carries the overdue-task badge. Hidden entirely in focus mode (`/quick` routes own their chrome) and on desktop (the sidebar owns navigation there). On phones this is the **only** primary nav — the [sidebar](./02-sidebar.md) is gated behind `isMdBreakpoint` (Phase 6a) and never co-renders on mobile. **Plant Doctor and Tools no longer have dedicated slots**: Doctor is the Capture sheet's hero action; Tools and the long tail (Journal, Integrations, Head Gardener) live in the **Shelf** the More slot opens.

---

## Role 1 — Technical Reference

### Component graph

```
BottomTabBar (nav, aria-label="Quick navigation", data-testid="bottom-tab-bar")
├── sliding active marker (Phase 6d — ONE top hairline pill shared by all
│   slots; slides on `transform`/ease-spring to the active destination's
│   centre, opacity 0 when no destination is active, e.g. Capture/More
│   surfaces. Measured via refs + a ResizeObserver on the row, mirroring
│   SegmentedTabs — replaces the old per-tab fade-in underline.)
└── slot × 5 (data-testid="bottom-tab-{id}")
    ├── nav tab (variant "nav" — Home / Plants / Planner)
    │   ├── icon (lucide, strokeWidth 1.75 / 2.2 when active)
    │   ├── badge (Home only — overdue count, bg-rhozly-error)
    │   └── label (text-3xs)
    ├── Capture FAB (variant "fab" — id "capture")
    │   ├── raised green circle (Plus icon, w-7 h-7, strokeWidth 2.2)
    │   └── label ("Capture", text-3xs)
    └── More (variant "nav", id "more" — Menu icon; no matchPaths, so never lit)
```

### The `BottomTab` interface (Phase 6b)

The slot descriptor gained action + variant fields so a single array can express both destinations and actions:

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Slot id — drives `data-testid="bottom-tab-{id}"` |
| `label` | `string` | Short visible label (one word) |
| `icon` | `React.ReactElement` | lucide icon, cloned with size + strokeWidth |
| `to?` | `string` | **Now optional.** Destination for `variant: "nav"` slots; omitted on action slots |
| `onPress?` | `() => void` | **New.** Action handler for non-nav slots (the Capture FAB, the More/Shelf slot) |
| `matchPaths?` | `string[]` | **Now optional.** Active-state paths — exact match or `path + "/"` prefix. Absent on action slots |
| `badge?` | `number` | Count badge (e.g. overdue tasks); `0` hides it |
| `ariaLabel?` | `string` | Full accessible name when the label is a short form |
| `variant?` | `"nav" \| "fab"` | **New.** `"nav"` (default) = destination tab with active-state; `"fab"` = the raised centre Capture action |

**Press dispatch:** each slot's handler is `() => (tab.onPress ? tab.onPress() : tab.to && onNavigate(tab.to))` — `onPress` wins when present, otherwise a `nav` tab navigates to `to`.

### The five slots (built in `App.tsx` as `bottomTabs`)

| Slot | `id` | `variant` | Action | testid |
|---|---|---|---|---|
| **Home** | `dashboard` | nav | → `/dashboard` (carries `overdueTaskCount` badge) | `bottom-tab-dashboard` |
| **Plants** | `shed` | nav | → `/shed` | `bottom-tab-shed` |
| **Capture** | `capture` | **fab** | `onPress` → `setCaptureSheetOpen(true)` (opens the [Capture sheet](../08-modals-and-overlays/41-capture-sheet.md)) | `bottom-tab-capture` |
| **Planner** | `planner` | nav | → `/planner` | `bottom-tab-planner` |
| **More** | `more` | nav | `onPress` → `setQuickDrawerOpen(true)` (opens the **Shelf** / `MobileNavDrawer`) | `bottom-tab-more` |

### The Capture FAB

`variant: "fab"`, `id: "capture"`, `Plus` icon. Rendered as a raised green circle that breaks the bar's top edge (`-mt-5 w-14 h-14 rounded-full bg-rhozly-primary text-white shadow-raised ring-4 ring-rhozly-surface-lowest`), with `active:scale-95` press feedback on `ease-spring` and **no active state** (it's an action, never a destination). Tapping it fires `onPress` → the app-level [Capture sheet](../08-modals-and-overlays/41-capture-sheet.md). A "Capture" label sits below the circle.

### The More slot

`id: "more"`, `Menu` icon, `variant` defaults to `"nav"` but it carries **no `matchPaths`** (so `active` is always false — it never lights) and **no `to`**; its `onPress` → `setQuickDrawerOpen(true)` opens the **Shelf** — the same `MobileNavDrawer` the Phase 6a header hamburger used to open. This is where Tools, Journal, Notes, Integrations, Head Gardener, and every long-tail destination now live. **Since the dashboard-nav-tasks-tray Stage 4 (2026-07-21, B7) the Shelf is passed a FILTERED `navLinks` in normal mode** — App.tsx drops the three ids already on the Deck (`dashboard` / `shed` / `planner`) at the call site, so "More" shows only true overflow (Journal / Tools / Integrations / Head Gardener) instead of re-listing Home / Plants / Planner. **In focus mode the FULL `navLinks` is passed** (`isFocusMode ? navLinks : navLinks.filter(...)`) — there the Deck is hidden and the Shelf is the only nav surface, so Home/Plants/Planner must stay reachable. (The mobile-only **Quick** nav item was removed 2026-07-20 when the `/quick` launcher home was folded into the responsive dashboard.)

### Active-state contract

Same semantics as the sidebar: exact path match or `path + "/"` prefix, applied only to `variant: "nav"` slots that carry `matchPaths`. The FAB and the (matchPaths-less) More slot never light.

**Orphan-route folding.** Routes without their own slot fold into a destination tab's `matchPaths` so at most one tab stays lit. With Doctor and Tools no longer dedicated slots, **their routes light no tab** — they're reached via actions (Capture / More), not destinations.

| Slot | `matchPaths` |
|---|---|
| **Home** (`/dashboard`) | `/dashboard`, `/management`, `/home-management` |
| **Plants** (`/shed`) | `/shed`, `/watchlist` |
| **Planner** (`/planner`) | `/planner`, `/shopping`, `/schedule`, `/journal`, `/notes` |
| **Capture** (FAB) | — (action, never lit) |
| **More** (Shelf) | — (action, never lit) |

Note the mobile-specific behaviour: with no Journal tab on mobile, `/journal` and `/notes` fold under **Planner** (on desktop the sidebar has a dedicated Journal item). Likewise `/schedule` (Routines) → Planner, and `/management` + `/home-management` (Location Manager / home management) → Home. `/doctor`, `/tools`, `/visualiser`, `/lightsensor`, `/guides`, `/weekly` and the rest of the toolbox reach their surfaces through Capture or the Shelf and light no destination tab.

### Visibility & layering

- `md:hidden` — desktop never sees it (display:none is excluded from the accessibility tree). E2E coverage: `layout.spec.ts` NAV-009 drives the Deck (nav tabs + Capture FAB → sheet) under a forced 375×812 viewport; NAV-010 asserts it is hidden at desktop size; NAV-011 drives the More → Shelf slot.
- Suppressed in focus mode via the `!isFocusMode` guard in App.tsx.
- `z` from `Z.nav` (40) — below every modal (120+) and below the sticky header (z-50; the header's stacking context contains the account-menu dropdown, which must paint over the bar); above page content. The Capture sheet it opens sits at `Z.modal` (120), so it covers the bar.
- Main content reserves the zone via `pb-28 md:pb-8`; the PlantDoctorChat FAB moved to `bottom-20 right-4` on mobile (`md:bottom-6 md:right-6` on desktop) to clear it.
- Safe area: `pb-[env(safe-area-inset-bottom)]` for gesture-nav phones.

### Performance

This is the screen's **one allowed backdrop-blur surface** (design-system budget): `bg-rhozly-surface-lowest/90 backdrop-blur-md` — 12px static blur, never animated, 90 %-opaque fallback tone so contrast holds outdoors. Press feedback is `active:scale-95` (compositor-only) on every slot, on `ease-spring` for the FAB.

### Tier gating / Beta gating / Permissions / Edge functions / Cron / Realtime

None. The badge count is passed in from App.tsx's existing `overdueTaskCount`.

### Error states

None — pure presentational.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why this exists

With one hand on the phone and the other in the soil, the hamburger menu was a reach. The Deck keeps the places you actually live one thumb-tap away — your day (Home), your plants, your plans — and puts the **thing you came outside to do** dead centre: the big green **Capture** button. Everything else — the toolbox, your journal, integrations — is one tap away under **More**.

### Every flow

1. **Jump between core screens** — tap Home, Plants, or Planner; the green label and the little bar above the icon show where you are.
2. **Capture what's in front of you** — tap the raised green **+** in the centre. A sheet slides up with **Diagnose a plant** front and centre, plus quick verbs: add a plant, jot a journal note, add a task, start a garden walk. Each one drops you straight into that flow.
3. **Reach everything else** — tap **More** to open the **Shelf**: Plant Doctor's toolbox neighbours, Journal, Notes, Integrations, Head Gardener, and the rest.
4. **See what's overdue at a glance** — the red count on Home is your overdue tasks; it clears as you complete them.

### Information on display — what every field means

| Element | Meaning |
|---|---|
| Green tab + top bar | The destination screen you're on (Home / Plants / Planner) |
| Raised green **+** (centre) | Capture — opens the create/diagnose sheet; it never "lights", it's an action |
| **More** (right) | Opens the Shelf, the overflow drawer for everything not in the Deck |
| Red count on Home | Overdue tasks across the home |
| Grey tabs | One tap away |

### Tier-by-tier experience

Identical for every tier. (What the Capture sheet's Diagnose action leads to is AI-gated at the Plant Doctor, not here.)

### Common mistakes / pitfalls

- **Hunting for a "Doctor" tab.** Plant Doctor lost its dedicated slot in Phase 6b — it's now the hero action inside **Capture** (the green +). Tap +, then "Diagnose a plant".
- **Hunting for a "Tools" tab.** The toolbox, Journal, Notes, Integrations and Head Gardener all live under **More** → the **Shelf**. When you open one, the Deck's nearest destination tab stays neutral (Capture and More never light).
- **Looking for the bar on focus-mode screens** — Garden Walk (`/walk`) and the mobile planting helper (`/quick/calendar`) intentionally hide it; use their own corner buttons.

### What to do if something looks wrong

- **Bar covers content:** that screen is missing the standard mobile bottom padding — report it; the shell reserves the space on every padded route.
- **Two tabs look active:** a route is matched by two destination tabs' `matchPaths` — file a bug with the URL.
- **The + doesn't open the sheet:** the Capture sheet only mounts on phones / focus mode (`isFocusMode || !isMdBreakpoint`); if you're on a tablet-width viewport the desktop header "+" carries create instead.

---

## Related reference files

- [Capture Sheet](../08-modals-and-overlays/41-capture-sheet.md) — what the centre Capture FAB opens (Diagnose hero + create verbs)
- [Sidebar Navigation](./02-sidebar.md) — the full nav (desktop-only since Phase 6a; the Shelf drawer is the phone overflow)
- [Header / Top Bar](./01-header.md) — de-crowded on mobile (Phase 6b): the Deck's Capture FAB + More carry create + overflow
- [Global Quick Add](../08-modals-and-overlays/23-global-quick-add.md) — the desktop header "+" the Capture sheet folds in on phones
- [Garden Walk](../02-dashboard/13-garden-walk.md) — the focus-mode surface where the bar hides (with the mobile `/quick/calendar` planting helper)
- [Quick Access Home](../02-dashboard/09-quick-access-home.md) — **RETIRED (2026-07-20)**; the old phone landing that used to hide the bar, now folded into the dashboard
- [Design System](../99-cross-cutting/40-design-system.md) — blur budget, press language, `Z` ladder
- [Routing](../99-cross-cutting/21-routing.md)

## Code references for ongoing maintenance

- `src/components/BottomTabBar.tsx` — the `BottomTab` interface (`to?` / `onPress?` / `variant?`) + the FAB / nav render branches
- `src/App.tsx` — `bottomTabs` array (the five slots), `!isFocusMode` mount, `setCaptureSheetOpen` / `setQuickDrawerOpen` handlers
- `src/components/CaptureSheet.tsx` — the sheet the Capture FAB opens
- `src/components/MobileNavDrawer.tsx` — the Shelf the More slot opens
- `src/components/PlantDoctorChat.tsx` — FAB offset that clears the bar
