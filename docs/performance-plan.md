# Rhozly Performance Improvement Plan

Audited: 2026-05-11. Prioritised by Impact / Effort. Work through in order — tick each checkbox when done.

---

## Quick Reference — Root Causes

| Symptom | Root Cause |
|---|---|
| Dashboard calendar/task list slow to load | `fetchTasksWithGhosts` makes 3 sequential DB calls; can be parallelised |
| Area details slow to open | `LocationPage` re-fetches on every open; no caching |
| Location tiles slow to populate | Each tile fires 2 independent queries (N+1) |
| Cold-start feels sluggish | Session → profile → home_id → data is a 3-step sequential waterfall |
| App JS parse slow on first load | Heavy components (Three.js, PlantDoctor, AR) bundled eagerly |
| Navigating back to dashboard re-spins | Cache is cleared on every `/dashboard` visit |

---

## Tier 1 — Do First (Low Effort, High Impact)

### ✅ F3 — Parallelise `fetchTasksWithGhosts` internal queries
**File:** `src/lib/taskEngine.ts`
**Problem:** Physical tasks, blueprints, and tombstones are fetched sequentially with `await`. On a 300 ms connection this is 900 ms of dead time before the task list can render.
**Fix:** Wrap the three opening fetches in `Promise.all`. Similarly parallelise the dependency check queries.
**Estimated saving:** 600–900 ms per TaskList render.
- [x] Wrap tasks + blueprints + tombstones fetch in `Promise.all`
- [x] Parallelise dependency check sub-queries

---

### ✅ F4 — Add DB indexes on `tasks` and `task_blueprints`
**File:** New migration `supabase/migrations/YYYYMMDD_performance_indexes.sql`
**Problem:** Every task query does a full table scan — no indexes on `home_id`, `due_date`, `location_id`, or `area_id`. Gets worse as skipped tombstones accumulate.
**Fix:** `CREATE INDEX IF NOT EXISTS` on the six hot columns. Safe to run on a live DB.
```sql
CREATE INDEX IF NOT EXISTS idx_tasks_home_date       ON public.tasks (home_id, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_home_status     ON public.tasks (home_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_location_date   ON public.tasks (location_id, due_date);
CREATE INDEX IF NOT EXISTS idx_task_blueprints_home  ON public.task_blueprints (home_id);
CREATE INDEX IF NOT EXISTS idx_task_blueprints_loc   ON public.task_blueprints (location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_home_area   ON public.inventory_items (home_id, area_id);
```
**Estimated saving:** 300–800 ms at scale; prevents degradation as data grows.
- [x] Write and apply migration locally
- [x] Push migration to Supabase live

---

### ✅ F2 — Eliminate N+1 per-tile task queries in `LocationTile`
**File:** `src/components/LocationTile.tsx`, `src/App.tsx`
**Problem:** Each `LocationTile` fires 2 independent Supabase queries for task counts. 3 tiles = 6 extra round trips after the dashboard loads.
**Fix:** Delete `fetchLocationTaskCount` from `LocationTile`. Extend `fetchDashboardData` in `App.tsx` to include a `tasks(id, status, due_date)` join per location, then pass the pre-aggregated count as a prop.
**Estimated saving:** Eliminates 2 round trips per tile.
- [x] Remove per-tile fetch from `LocationTile`
- [x] Extend dashboard query to include task counts
- [x] Pass count as prop to each tile

---

### ✅ F6 — Stop clearing cache on every `/dashboard` navigation
**File:** `src/App.tsx` (lines ~515–516)
**Problem:** Navigating back to the dashboard wipes both `sessionStorage` caches and triggers a full re-fetch — even if the user was just there 2 seconds ago.
**Fix:** Remove the `sessionStorage.removeItem` calls from the `/dashboard` navigation `useEffect`. The existing TTL-based cache in `clientCache.ts` already handles staleness; realtime subscriptions handle live updates.
**Estimated saving:** Instant tile render on back-navigation (eliminates spinner on return).
- [x] Remove `sessionStorage.removeItem` calls from dashboard nav effect
- [x] Verify realtime subscriptions still handle live data updates

---

### ✅ F8 — Narrow `select("*")` to explicit columns
**Files:** `src/App.tsx` (`refreshProfile`), `src/components/LocationPage.tsx` (`AreaDetails`)
**Problem:** `select("*")` fetches all columns including large JSONB blobs. Only a handful of fields are actually used.
**Fix:** Replace with explicit column lists.
```ts
// App.tsx refreshProfile:
.select("uid, home_id, display_name, subscription_tier, ai_enabled, enable_perenual, is_admin, onboarding_state")

// AreaDetails inventory fetch:
.select("id, name, quantity, unit, status, plant_id, area_id, image_url, notes")
```
**Estimated saving:** Smaller payloads on every profile refresh and area open.
- [x] Narrow `user_profiles` select in `refreshProfile`
- [x] Narrow `inventory_items` select in `AreaDetails`

---

## Tier 2 — Do Next (Medium Effort, High Impact)

### ✅ F5 — Lazy-load heavy route components
**File:** `src/App.tsx` (imports), `vite.config.ts`
**Problem:** PlantDoctor, PlantVisualiser, Three.js (3D garden), SunTrajectoryAR, GuideList, BlueprintManager all bundled eagerly. User landing on the dashboard parses all of this JS before the app is interactive.
**Fix:**
1. Convert to `React.lazy` + `Suspense` for all route-level components except Dashboard, TheShed, and TaskList (these are core and likely needed quickly).
2. Add `manualChunks` in `vite.config.ts` to split Three.js into its own chunk.
**Estimated saving:** 500 ms – 1.5 s on initial JS parse, especially on mobile.
- [x] Convert `PlantDoctor` to `lazy()`
- [x] Convert `PlantVisualiser` to `lazy()`
- [x] Convert `SunTrajectoryAR` to `lazy()`
- [x] Convert `GardenLayoutList` + `GardenLayoutEditor` to `lazy()`
- [x] Convert `BlueprintManager` to `lazy()`
- [x] Convert `GuideList` to `lazy()`
- [x] Wrap `<Routes>` in `<Suspense>`
- [x] Add Three.js `manualChunks` to `vite.config.ts`

---

### ✅ F1 — Parallelise auth/profile waterfall on cold start
**File:** `src/App.tsx`
**Problem:** On cold start: `getSession()` → (effect fires) → `refreshProfile()` → (effect fires) → `fetchDashboardData()`. Three sequential round trips before any content renders.
**Fix:**
1. Combine session + profile fetch into a single async call using `Promise.all` — start the `user_profiles` query the moment `session.user.id` is available from the JWT (no second effect tick needed).
2. Inside `refreshProfile`, run the `home_members` fallback in parallel with the primary profile query.
3. Seed profile from `localStorage` before the async chain resolves so the user sees stale-then-fresh instead of blank-then-content.
**Estimated saving:** 400–800 ms on cold start.
- [x] Merge session + profile fetch into single parallel call
- [x] Parallelise `home_members` fallback
- [ ] Seed UI from `localStorage` on mount (deferred — stale-then-fresh pattern requires careful session handling)

---

## Tier 3 — Later (Medium Effort, Medium Impact)

### ✅ F7 — Pass locations as props to `TaskCalendar` (avoid re-fetch)
**Files:** `src/components/TaskCalendar.tsx`, `src/App.tsx`
**Problem:** `TaskCalendar` independently fetches locations (with nested areas) and plans when it mounts — data the parent already has.
**Fix:** Pass `locations` as a prop from `App.tsx`. Accept a `plans` prop or lazy-load plans only when the filter panel opens. Prevent double `TaskEngine` invocation by passing the already-fetched month tasks to the child `<TaskList>`.
- [x] Pass locations prop to `TaskCalendar`
- [ ] Add `preloadedTasks` prop to `TaskList` to skip fetch when data is provided

---

### ✅ F10 — Cache `LocationPage` areas in sessionStorage
**File:** `src/components/LocationPage.tsx`
**Problem:** Every tap on a location tile re-fetches areas from Supabase and shows a spinner, even if the user was just on that location.
**Fix:** Cache areas in `sessionStorage` keyed by `location_id` with a 5-minute TTL. Serve cached areas immediately on mount, refresh in background.
- [x] Add sessionStorage cache to `LocationPage` with 5-min TTL
- [x] Render immediately from cache, refresh behind the scenes

---

### ✅ F9 — Surgical realtime updates instead of full re-fetch
**Files:** `src/App.tsx` (`DashboardRealtimeSubscriber`), `src/hooks/useCachedShed.ts`
**Problem:** Any DB change (e.g. archiving a plant) triggers three simultaneous full re-fetches: dashboard, task list, and shed. The 500 ms debounce helps with bursts but doesn't eliminate the redundant queries.
**Fix:** For the most common mutations (task completion, plant archiving, inventory updates) perform optimistic local state updates from the realtime payload rather than triggering a full re-fetch. Remove `inventory_items` from the dashboard realtime subscription (it only affects location tile plant counts, which can be updated surgically).
- [x] Remove `inventory_items` from dashboard realtime subscription
- [x] Update inventory state from realtime payload directly
- [ ] Explore surgical task state updates from realtime payload

---

## Acceptance Criteria

All Tier 1 items complete = dashboard should feel noticeably faster (task list and location tiles load significantly quicker).

All Tier 2 items complete = cold start and initial JS parse significantly faster; back-navigation is instant.

All Tier 3 items complete = realtime updates no longer cause visible re-fetch flashes; location detail opens instantly on repeat visits.

---

## Notes

- DB indexes (F4) require `supabase db push` to go live — confirm with user before pushing.
- Lazy loading (F5) should be tested to ensure the Suspense fallback doesn't flash on fast connections.
- The auth waterfall fix (F1) is the most complex change — requires careful testing of the session initialisation flow.
