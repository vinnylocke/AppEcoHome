# Quick Access Home

> The mobile shortcut home. A customisable launcher tuned for one-thumb operation in the garden — by default **Plant Lens** (the full `/doctor` Plant Doctor, rebranded), **Today** (Localized Task Calendar), **Capture** (deep-links into the full Journal with the Add Entry sheet open), and **Plants** (jumps straight to The Shed). Users can swap in any of the catalogue's destinations and reorder them from Account Settings. Phone users land here on app open instead of the full dashboard.

> **Retired:** the `/quick/lens` route (and its `QuickAccessLens` wrapper), the `/quick/journal` route (with `QuickCapture`), and the entire `/library/*` UI tree — their tiles now route to `/doctor`, `/journal?open=add-entry`, and `/shed` respectively. Plant search lives inside Add-to-Shed, Shopping, Multi-ID, and the Nursery picker; the `plant_library` DB table is unchanged. The historical body below still references those routes for context but should be read with that in mind.

**Route:** `/quick`
**Source files (entry points):**
- `src/components/QuickAccessHome.tsx`
- `src/components/quick/QuickTile.tsx`
- `src/components/quick/QuickLauncherPicker.tsx` (the Account-Settings picker for the customisable launcher)
- `src/lib/quickLauncherCatalogue.ts` (catalogue of pinnable destinations)
- `src/lib/quickLauncherPrefs.ts` (localStorage + Supabase pin storage)
- `src/hooks/useQuickLauncherPins.ts` (local-first hook)
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
│   ├── QuickAccessMenuButton (floating top-LEFT hamburger; first-visit "Menu" label)
│   ├── Floating UserProfileDropdown (top-right, same dropdown as the desktop header)
│   └── MobileNavDrawer (slide-in from left when the burger is tapped)
├── Desktop preview banner (visible when useIsMobile() === false)
│   └── "This is the mobile shortcut screen — your full dashboard is at /dashboard"
├── Brand stamp (logo + RHOZLY wordmark, centred — small, restrained)
├── Hero card → navigate("/dashboard") (was /gardener pre-22.0015)
├── QuickTile × n (customisable launcher — 2 cols, 1-3 rows)
│   └── Renders from `useQuickLauncherPins()` against `QUICK_LAUNCHER_CATALOGUE`.
│       Default pins: lens / today / capture / library. User can swap in
│       any catalogue entry (plants / planner / walk / doctor / shopping)
│       up to QUICK_LAUNCHER_MAX (6) total. Tiles render in the user's
│       chosen order; tap fires the destination's optional `onTap` hook
│       (e.g. Today prefetches the calendar) then navigate(route).
├── "Customise" link → navigate("/gardener?section=quick-launcher")
└── WalkStartTile (wide tile under the grid) → navigate("/walk")

(The "Open full dashboard →" footer pill was removed in 22.0015 — the
 hero card now does the same job.)

QuickLauncherPicker (mounted inside GardenerProfile AccountTab)
├── Pinned list (count of MAX) — ↑↓ reorder + ✕ remove per row
├── Available list — ➕ add per row
└── Reset to defaults

QuickAccessLens (mounted at /quick/lens)
├── Back chrome (chevron-left "Quick" + "Visual Lens" label)
└── PlantDoctor compact   ← the existing /doctor screen, in compact mode
```

### Quick Launcher catalogue & pins

The launcher is data-driven. Every pinnable destination has a stable id, label, description, icon, accent and route in `QUICK_LAUNCHER_CATALOGUE` (`src/lib/quickLauncherCatalogue.ts`). User preference is `string[]` of ids stored in two places:

> **Shared with the Home dashboard (new-home-dashboard Phase 1):** the [Home view](./17-home-main.md)'s quick-actions row (`src/components/home/QuickActionsRow.tsx`) renders from this same catalogue + saved pins — customising in one place changes both surfaces. One difference for **never-customised** users: the Home row applies **persona-aware defaults** via `defaultQuickLauncherPins(persona)` (`quickLauncherCatalogue.ts`) — `experienced` → `walk / today / journal / light-sensor`, everything else → the classic `doctor / today / capture / shed`. "Never customised" is detected via `hasStoredPins()` (`quickLauncherPrefs.ts`), a new export that checks whether the raw `rhozly_quick_launcher_v1` key exists — `readLocalPins()` can't distinguish "never customised" from "customised to exactly the defaults" since it returns the default set for both. **A saved pin preference always wins** on both surfaces; `/quick` itself still uses the classic defaults via `readLocalPins()`.

Current catalogue (16 destinations): `lens`, `today`, `capture`, `library`, `shed`, `planner`, `walk`, `doctor`, `shopping`, plus the Journal + Tools Hub additions — `journal` (`/journal`), `guides` (`/guides`), `garden-layout`, `visualiser`, `light-sensor`, `sun-tracker`, and `weekly` (`/weekly`, the Wave 21 Weekly Overview page). Adding a pinnable destination = appending one catalogue entry; the picker auto-renders it.

| Layer | Key | Role |
|-------|-----|------|
| localStorage | `rhozly_quick_launcher_v1` | Source-of-truth for the first paint on `/quick` (synchronous read) |
| Supabase | `user_profiles.quick_launcher_pins jsonb` | Cross-device sync — read in the background on mount, written on save |

`useQuickLauncherPins(userId)` orchestrates: synchronous local read, async remote revalidation that overwrites local when they diverge, `save(next)` that writes both stores (local always succeeds — toast on remote failure). Same local-first + revalidate pattern as the dashboard cache.

Constraints:
- **Min**: 1 pinned destination (picker disables `✕` on the last item).
- **Max**: 6 pinned destinations (picker disables `➕` once at max).
- **Order**: explicit, set via `↑↓` buttons in the picker.

Catalogue entries have an optional `isAvailable(ctx)` predicate (tier / beta / aiEnabled / homeId). The picker filters out unavailable entries; the launcher's render-time `resolvePins` filters them out silently too — so pinning a Sage-only destination then downgrading hides the tile without breaking the layout, and re-upgrading makes it reappear.

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

- **Missing the side nav on small phones.** It collapses to icon-only; tap the hamburger to expand.
- **Thinking Quick Access replaces the dashboard.** It doesn't — it's just the new front door for phones. Everything you already had is one nav tap away.

### Recommended workflows

- **In the garden, weird leaf:** Quick Access → Visual Lens → photo → Analyse → add suggested tasks. Done.
- **At the kitchen table, planning for the week:** Quick Access → "Open full dashboard →".
- **Coming back from a holiday, lots to catch up on:** Open full dashboard from here, then dive into Plants / Planner.

### What to do if something looks wrong

- **Quick Access showed up on my desktop browser:** that's fine — the redirect from `/` only fires for narrow viewports + native. You can bookmark `/dashboard` if you don't want to see it.
- **"Quick" missing from side nav on desktop:** intentional — it's only shown on mobile.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md) — the desktop Home view's quick-actions row shares this launcher's catalogue + pins (persona-aware defaults when never customised)
- [Plant Doctor](../05-tools/02-plant-doctor.md) — the underlying Analyse flow; `/quick/lens` mounts it in `compact` mode
- [Home Dashboard](./01-home-dashboard.md) — the desktop home; reachable from Quick Access via "Open full dashboard"
- [Routing](../99-cross-cutting/21-routing.md) — `/`, `/quick`, `/quick/lens` route definitions; documents the Wave 6 focus-mode exclusion of the persistent chrome
- [Capacitor](../99-cross-cutting/23-capacitor.md) — `Capacitor.isNativePlatform()` usage in `useIsMobile`

**Focus-mode components (Wave 6):**
- `src/components/MobileNavDrawer.tsx` — slide-in nav drawer, reuses `navLinks`
- `src/components/QuickAccessMenuButton.tsx` — floating hamburger top-right with first-visit "Menu" label

## Code references for ongoing maintenance

- `src/components/QuickAccessHome.tsx` — the customisable launcher home
- `src/components/quick/QuickTile.tsx` — reusable tile (live / coming-soon variants); 7 launcher accents (green / amber / red / blue / purple / teal / slate) + 3 legacy row accents
- `src/components/quick/QuickLauncherPicker.tsx` — the Account-Settings picker (pinned / available / reset)
- `src/lib/quickLauncherCatalogue.ts` — `QUICK_LAUNCHER_CATALOGUE`, `QUICK_LAUNCHER_BY_ID`, `resolvePins`, `partitionForPicker`, `DEFAULT_QUICK_LAUNCHER_PINS`, `defaultQuickLauncherPins(persona)` (Home-row persona defaults)
- `src/lib/quickLauncherPrefs.ts` — `readLocalPins` / `writeLocalPins` / `clearLocalPins` / `fetchRemotePins` / `saveRemotePins` / `hasStoredPins` (never-customised detection for the Home row)
- `src/components/home/QuickActionsRow.tsx` — the Home dashboard consumer of the shared pins
- `src/hooks/useQuickLauncherPins.ts` — local-first hook (pins / isRevalidating / save / resetToDefaults)
- `src/components/QuickAccessLens.tsx` — `/quick/lens` wrapper around PlantDoctor (compact mode)
- `src/components/PlantDoctor.tsx` — accepts a `compact?: boolean` prop; when true, hides the tab bar + secondary action row
- `src/components/GardenerProfile.tsx` — Account tab mounts `<QuickLauncherPicker>` below the existing account form
- `src/hooks/useIsMobile.ts` — `Capacitor.isNativePlatform() || viewport < 768px`
- `src/App.tsx` — conditional `/` redirect, `/quick` + `/quick/lens` routes, mobile-only "Quick" nav entry, sign-out clear via `clearLocalPins`
- `supabase/migrations/20260624000700_user_profiles_quick_launcher_pins.sql` — adds the jsonb column
- `tests/unit/hooks/useIsMobile.test.ts` — hook unit tests
- `tests/unit/lib/quickLauncherCatalogue.test.ts` — catalogue resolve + picker partition
- `tests/unit/lib/quickLauncherPrefs.test.ts` — local read/write/clear + sanitisation
- `tests/unit/components/QuickTile.test.ts` — tile unit tests
- `tests/unit/components/QuickAccessHome.test.ts` — home screen unit tests
- `tests/e2e/specs/quick-access.spec.ts` — routing + nav visibility E2E
