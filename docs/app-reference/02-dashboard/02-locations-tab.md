# Locations Tab — **RETIRED**

> **This surface has been removed (2026-07-20 — stats+locations redesign Stage 4a, `docs/plans/home-screen-redesign-2026-07.md` §C).** The standalone **Locations sub-tab (`?view=locations`) is gone.** The view-switcher is now **three tabs** — Dashboard / Calendar / Weather (`dashboard-view-switcher` testid + the `dashboard_tour` step-1 anchor survive). The **home garden grid IS the "what's growing where" surface now** — one card per location, every area, every plant's state — so a separate grid-of-tiles view was pure duplication.
>
> **What changed in App.tsx (Stage 4a):** `"locations"` was dropped from the `DashboardView` union (now `"home" | "calendar" | "weather"`), from the `?view=` parser allowlist, and from the `localStorage` restore allowlist (`["calendar","weather"]`). `?view=locations` therefore **falls through to home exactly like legacy `?view=overview` / `?view=dashboard`** — the URL param is harmless, and old `?view=locations` bookmarks still resolve (they render home). The `dashboardView === "locations"` render branch and the `LocationTile` import were deleted, and **`src/components/LocationTile.tsx` was deleted outright** (this view was its only consumer).
>
> **Where each piece went:**
> - **The grid of location cards + task-count badges** → the home's **Garden Overview grid** (`GardenOverviewGrid` / `LocationOverviewCard` / `AreaRow`). See [Home (Main Dashboard)](./17-home-main.md).
> - **Tapping a location → drill-in (`?locationId=`)** → **unchanged**, but now reached by tapping a **garden-grid location card** (`home-location-card-{id}`) instead of a `LocationTile`. See [Location Page (Drill-In)](./07-location-page.md).
> - **The "Add Location" empty-state CTA → `/management`** → **repointed in Stage 4b (2026-07-20).** The empty-garden CTA (`empty-garden-add-location`) now opens the inline `AddLocationSheet` on the home grid instead of navigating to `/management`. **Inline add + manage on the home grid is now DONE (Stage 4b):** the grid fully owns **add** (`home-add-location-btn` → `AddLocationSheet`), **rename**, **switch inside/outside**, and **delete** (each card's `location-manage-{id}` kebab → `LocationManageMenu`), all gated by the `locations.create/edit/delete` keys client-side and sharing `src/lib/locationMutations.ts` with LocationManager. `/management` (LocationManager) **remains the power-user bulk CRUD view** and now shares that same one DB path. See [Home (Main Dashboard) → Inline location management](./17-home-main.md).
>
> The historical body below is preserved for reference — read every statement as pre-Stage-4a history.

**Route:** ~~`/dashboard?view=locations`~~ — the tab is gone; `?view=locations` now falls through to home
**Source files (entry points):**
- ~~`src/App.tsx` — the `dashboardView === "locations"` render branch~~ *(deleted 2026-07-20 — Stage 4a)*
- ~~`src/components/LocationTile.tsx`~~ *(deleted 2026-07-20 — Stage 4a)*
- `src/components/LocationPage.tsx` — drill-in view when a location is tapped **(still live — now reached from the garden grid)**

---

## Quick Summary

**RETIRED (2026-07-20 — Stage 4a)** — read historically. A responsive grid of location cards (one per Location row), each showing today's open task count for that location. Tapping a tile drilled into `LocationPage` (rendered inline within the Dashboard route as `/dashboard?locationId=X`). The empty state nudged first-time users to add their first location. That job now belongs to the home **Garden Overview grid** in [Home (Main Dashboard)](./17-home-main.md); the drill-in it fed lives on unchanged at [Location Page (Drill-In)](./07-location-page.md).

---

## Role 1 — Technical Reference

### Component graph

```
/dashboard?view=locations (App.tsx)
├── (if dashboardError) Error card with Retry button
├── (loading) 3× skeleton tiles
├── (loaded, empty) "No locations yet" card with MapPin icon + Add Location CTA → /management
└── (loaded, has data) grid of LocationTile components
    ├── LocationTile.props.site             — the location record
    ├── LocationTile.props.index            — for stagger animation
    └── LocationTile.props.tasksCount       — today's task count from locationTaskCounts
```

### Props passed to LocationTile

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `site` | `Location` (id, name, is_outside, areas[], light_intensity_lux, etc.) | App.tsx state.locations | Display name, area count, etc. |
| `index` | `number` | enumerate index | Stagger fade-in animation |
| `tasksCount` | `number \| null` | `locationTaskCounts[loc.id] ?? null` | Today's task badge |

### State (App.tsx-level used here)

| State | Type | Purpose |
|-------|------|---------|
| `locations` | `Location[]` | All locations for the active home |
| `locationTaskCounts` | `Record<locationId, number>` | Today's open task count per location |
| `dashboardLoaded` | `boolean` | Has data finished loading at least once |
| `dashboardError` | `boolean` | Last fetch failed |
| `selectedLocationId` | `string \| null` | From `searchParams.get("locationId")` — drives LocationPage drill-in |

### Data flow — read paths

The Locations Tab is purely a render of in-memory state that `fetchDashboardData()` already produced. It makes no additional queries.

The state itself comes from:

- **`home-dashboard-stats` edge function** — returns `locations` array and `location_task_counts` map.
- **`locations_cache_<homeId>` sessionStorage** — fast first paint while the edge fn is loading.

### Data flow — write paths

None directly. Tapping a LocationTile calls `navigate('/dashboard?locationId=X')` which is read-only navigation.

### Edge functions invoked

None directly. Indirectly relies on `home-dashboard-stats` data already loaded by the parent Dashboard route.

### Cron / scheduled jobs that affect this surface

| Cron | Cadence | Affects |
|------|---------|---------|
| `generate-tasks` | Daily AM | `location_task_counts` go up when blueprints fire today |
| `run-automations` | Every 5 min | Automations may auto-complete tasks, decreasing counts |

### Realtime channels

Subscribes (via `DashboardRealtimeSubscriber` in App.tsx) to:
- `locations` table changes → refetch full dashboard
- `inventory_items` changes → light-weight refetch of counts only (`handleInventoryRealtime`)
- `tasks` changes → refresh counts

### Tier gating

Same content for every tier — no Locations Tab gating.

### Beta gating

None.

### Permissions / role-based UI

- The "Add Location" CTA only appears in the empty state — full add UI lives in Location Manager (`/management`). Permission gating happens there, not on this view.

### Error states

| State | Visible result |
|-------|----------------|
| `dashboardError = true` | Red error card with Retry button (`onClick={fetchDashboardData}`) at the top of the grid |
| Loading first time | 3 grey skeleton tiles |
| Loaded + empty | "No locations yet" empty state with Add Location button |
| Loaded + has data + filtered to nothing | Wouldn't apply — no filter on this surface |

### Performance notes

- Grid is `grid-cols-1 sm:grid-cols-2 gap-5` — single column on mobile, two columns on small+.
- Each LocationTile uses `loading="lazy"` on its image if applicable.
- No virtualisation — assumes < 50 locations per home, which holds in practice.

### Linked storage buckets

None directly.

---

## Role 2 — Expert Gardener's Guide

### Why open this view

The Locations Tab answers "what's happening where?" For a beginner with one location ("Back Garden") it's the table of contents — tap a location to see the plants inside and what they need. For a power user with separate outdoor beds, indoor windowsills, and a greenhouse, this view is the navigation hub. The task count badge on each tile is the single most useful piece of information — it lets you decide which location needs attention first this morning.

### Every flow on this view

#### 1. Glance the task counts

- **What you see:** each tile shows the location name, area count, and a number badge "3 tasks today" (or no badge if zero).
- **What you do:** read the numbers, decide where to start.
- **Why a gardener cares:** prioritisation. Three pending in the herb bed, zero in the greenhouse → start with herbs.

#### 2. Tap a location tile

- **What happens:** the URL updates to `/dashboard?locationId=X`, and the same Dashboard route renders `LocationPage` instead of the grid.
- **Why a gardener cares:** drill-in view shows the areas inside the location, plants in each area, and per-plant detail without leaving the Dashboard route.

#### 3. Empty-state CTA: "Add Location"

- **What you see (first run):** the centred empty state with the "Add Location" button.
- **What happens:** navigates to `/management` (Location Manager) where you can create your first location.
- **Why a gardener cares:** Rhozly's data model is Home → Locations → Areas → Plants. A location is a logical division of your garden — outdoor borders, polytunnel, conservatory. Areas are subdivisions inside (raised bed 1, herb circle, etc.).

#### 4. Refresh after a real-world change

- **What you see:** counts not matching reality (e.g. you watered everything but the count still says 3).
- **What you do:** pull down to refresh OR tap "Today" on the Dashboard nav button (resets the selected date) OR wait for realtime to catch up.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Location name | Free text you set when creating it |
| Areas count chip | Number of `areas` rows attached to this location |
| Task count badge | Today's pending tasks for tasks where `tasks.location_id = X` AND `status = 'Pending'` |
| `is_outside` flag (icon variant) | Drives weather-rule applicability — outdoor locations get frost / wind / rain alerts |
| Location image (if present) | Custom photo or default tile gradient |

### Tier-by-tier experience

Identical for every tier. No gating on this surface.

### New user vs returning user vs power user

- **Brand new user**: sees the empty state with "No locations yet". The CTA is the single visible action.
- **Returning user** (one location): a single tile fills the row. Tap to drill in.
- **Power user** (5+ locations across indoor / outdoor): the badge density tells you where the day's work concentrates. Multi-column layout shines.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Adding too many locations.** Locations are logical garden divisions. "Front garden", "Back garden", "Greenhouse" — not "Tomato bed", "Lavender hedge" (those are *areas* inside a location).
- **Expecting per-plant task counts here.** Counts are per-location. Per-plant is on `LocationPage` and `InstanceEditModal`.
- **Tile order isn't meaningful.** Order is creation order. There's no priority sort. Use the badge counts to decide what to do.

### Recommended workflows

- **Morning glance:** Locations Tab → which tile has the highest badge → tap → handle.
- **Add a new growing area:** open Location Manager from any tile or the empty state; create the location, add areas inside it.

### What to do if something looks wrong

- **A location's count is wrong:** pull-to-refresh. If still wrong, check `locations.id` ↔ `tasks.location_id` matches in the data — easy to verify in Supabase Studio.
- **A location you deleted still shows:** realtime should pick this up; if it doesn't, refresh. Confirm the delete actually committed.

---

## Related reference files

- [Home (Main Dashboard)](./17-home-main.md)
- [Location Page](./07-location-page.md)
- [Location Manager](../03-garden-hub/03-location-manager.md)
- [Area Details](../03-garden-hub/04-area-details.md)
- [Data Model — Locations, Areas, Layouts, Shapes](../99-cross-cutting/02-data-model-spatial.md)

## Code references for ongoing maintenance

- ~~`src/App.tsx` render block for `dashboardView === "locations"`~~ *(deleted 2026-07-20 — Stage 4a; `?view=locations` now falls through to home in the `DashboardView` parser, ~App.tsx:514)*
- ~~`src/components/LocationTile.tsx`~~ *(deleted 2026-07-20 — Stage 4a)*
- `src/components/home/GardenOverviewGrid.tsx` / `LocationOverviewCard.tsx` / `AreaRow.tsx` — the home grid that absorbed this view's job
- `src/components/LocationPage.tsx` — drill-in view (still live — reached from the garden grid's `home-location-card-{id}` cards)
- `src/components/LocationManager.tsx` (`/management`) — the power-user bulk locations/areas CRUD surface; **Stage 4b (2026-07-20): inline add/manage now lives on the home grid too, and both share `src/lib/locationMutations.ts` (one DB path)**
- `src/components/home/AddLocationSheet.tsx` / `LocationManageMenu.tsx` / `src/lib/locationMutations.ts` — the home grid's inline add + manage affordances that absorbed this view's add/edit CTAs (Stage 4b)
- `supabase/functions/home-dashboard-stats/index.ts` — supplies the locations + counts
