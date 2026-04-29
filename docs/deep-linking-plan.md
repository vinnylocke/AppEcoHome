# Deep Linking Plan — Phase 2

## Overview

Replace `selectedLocationId`, `focusedArea`, `dashboardView`, and `editingInstance` state
with URL query params. Every panel, sub-view, and modal gets a bookmarkable URL.
Refresh lands you in exactly the same place.

---

## URL Structure

| URL | What renders |
|-----|-------------|
| `/dashboard` | Dashboard grid (locations view) |
| `/dashboard?view=calendar` | Dashboard — calendar tab |
| `/dashboard?view=weather` | Dashboard — weather tab |
| `/dashboard?locationId=xxx` | LocationPage for that location |
| `/dashboard?locationId=xxx&areaId=yyy` | LocationPage → AreaDetails open |
| `/dashboard?locationId=xxx&areaId=yyy&instanceId=zzz` | LocationPage → AreaDetails → plant instance modal open |
| `/shed?instanceId=zzz` | Shed with that instance's edit modal open |

**Rules:**
- `?view` uses `{ replace: true }` — tab switching should not pollute browser history.
- `?locationId` / `?areaId` / `?instanceId` navigations are push entries — back button steps back through them.
- Deeper params always include the parents: you cannot have `?areaId` without `?locationId`.

---

## State-to-URL Migration Map

| Current state | Replaced by | Lives in |
|---------------|-------------|----------|
| `selectedLocationId` | `?locationId` query param | App.tsx |
| `dashboardView` | `?view` query param | App.tsx |
| `focusedArea` | `?areaId` query param (auto-open on mount) | LocationPage.tsx |
| `editingInstance` | `?instanceId` query param (auto-open on mount) | AreaDetails.tsx |

`dashboardView` localStorage sync can be removed entirely (URL replaces it).
`selectedLocationId` localStorage sync is already removed (Phase 1).

---

## Phase 2 — File-by-File Changes

### Status Legend
- [ ] Not started
- [x] Complete

---

### 1. `src/App.tsx`

- [x] Add `useSearchParams` to the react-router-dom import.
- [ ] Replace `const [selectedLocationId, setSelectedLocationId] = useState(null)` with:
  ```typescript
  const [searchParams] = useSearchParams();
  const selectedLocationId = searchParams.get("locationId");
  const dashboardView = (searchParams.get("view") as "locations" | "calendar" | "weather") || "locations";
  ```
  Remove `setSelectedLocationId` and `setDashboardView` — callers use `navigate` instead.

- [x] Remove `const [dashboardView, setDashboardView]` state and its `localStorage` sync effect.

- [x] Update `LocationTile onClick`:
  ```typescript
  // BEFORE:
  onClick={() => setSelectedLocationId(loc.id)}
  // AFTER:
  onClick={() => navigate(`/dashboard?locationId=${loc.id}`)}
  ```

- [x] Update dashboard view tab buttons:
  ```typescript
  // BEFORE:
  onClick={() => setDashboardView(v as any)
  // AFTER:
  onClick={() => navigate(v === "locations" ? "/dashboard" : `/dashboard?view=${v}`, { replace: true })}
  ```
  Note: `locations` is the default — no param needed, keeps URL clean.

- [x] Update "Full Forecast" button:
  ```typescript
  // BEFORE:
  onClick={() => setDashboardView("weather")}
  // AFTER:
  onClick={() => navigate("/dashboard?view=weather", { replace: true })}
  ```

- [x] Update "View Calendar" button:
  ```typescript
  // BEFORE:
  onClick={() => setDashboardView("calendar")}
  // AFTER:
  onClick={() => navigate("/dashboard?view=calendar", { replace: true })}
  ```

- [x] Update the `dashboardView` active check on tab buttons:
  Already driven by `searchParams.get("view")` — no separate change needed.

- [x] Update `LocationPage` usage — remove `onBack` prop entirely (LocationPage now navigates itself):
  ```tsx
  // BEFORE:
  <LocationPage location={loc} onBack={() => setSelectedLocationId(null)} />
  // AFTER:
  <LocationPage location={loc} />
  ```

- [x] Remove the `dashboardView` localStorage `useEffect` (now in URL).

---

### 2. `src/components/LocationPage.tsx`

- [x] Add `useSearchParams` to the react-router-dom import (already has `useNavigate`).

- [x] Remove `onBack` prop from `LocationPageProps` interface and function params entirely.

- [x] Replace back button handler:
  ```typescript
  // BEFORE:
  onClick={() => onBack ? onBack() : navigate("/dashboard")}
  // AFTER:
  onClick={() => navigate("/dashboard")}
  ```
  (Navigating to `/dashboard` without `?locationId` naturally shows the dashboard grid.)

- [x] Keep `focusedArea` as local state, seed from URL via effect:
  ```typescript
  const [searchParams] = useSearchParams();
  const areaIdParam = searchParams.get("areaId");
  ```

- [x] Add a `useEffect` to auto-open the area when `?areaId` is present in the URL:
  ```typescript
  useEffect(() => {
    if (areaIdParam && areas.length > 0) {
      const target = areas.find((a) => String(a.id) === areaIdParam);
      if (target) setFocusedArea(target);
    }
  }, [areaIdParam, areas]);
  ```
  Keep `focusedArea` as local state for when users click areas directly — the URL param is
  only used on initial mount / external navigation. Both paths converge on `setFocusedArea`.

  **Wait — decision:** since `focusedArea` still needs to exist as local state for direct clicks,
  the cleanest model is: `focusedArea` is local state, URL param just seeds it on mount.
  When user closes an area, clear `focusedArea` AND update URL (remove `areaId`).
  When user opens an area directly, set `focusedArea` AND update URL to add `areaId`.

- [x] Update area-open handler (wherever `setFocusedArea(area)` is called):
  ```typescript
  // BEFORE:
  setFocusedArea(area)
  // AFTER:
  setFocusedArea(area);
  const locationId = searchParams.get("locationId");
  navigate(`/dashboard?locationId=${locationId}&areaId=${area.id}`);
  ```

- [x] Update area-close handler (wherever `setFocusedArea(null)` is called):
  ```typescript
  // BEFORE:
  setFocusedArea(null)
  // AFTER:
  setFocusedArea(null);
  const locationId = searchParams.get("locationId");
  navigate(`/dashboard?locationId=${locationId}`);
  ```

---

### 3. `src/components/AreaDetails.tsx`

- [x] Add `useSearchParams` to the react-router-dom import (already has `useNavigate`, `useLocation`).

- [x] Keep `editingInstance` as local state — URL param seeds it on mount, same pattern as `focusedArea`:
  ```typescript
  const [searchParams] = useSearchParams();
  const instanceIdParam = searchParams.get("instanceId");
  ```

- [x] Add a `useEffect` to auto-open the instance when `?instanceId` is present:
  ```typescript
  useEffect(() => {
    if (instanceIdParam && plants.length > 0) {
      const target = plants.find((p) => String(p.id) === instanceIdParam);
      if (target) setEditingInstance(target);
    }
  }, [instanceIdParam, plants]);
  ```

- [x] Update instance-open handler (wherever `setEditingInstance(plant)` is called):
  ```typescript
  // BEFORE:
  setEditingInstance(plant)
  // AFTER:
  setEditingInstance(plant);
  const locationId = searchParams.get("locationId");
  const areaId = searchParams.get("areaId");
  navigate(`/dashboard?locationId=${locationId}&areaId=${areaId}&instanceId=${plant.id}`);
  ```

- [x] Update instance-close handler (wherever `setEditingInstance(null)` is called):
  ```typescript
  // BEFORE:
  setEditingInstance(null)
  // AFTER:
  setEditingInstance(null);
  const locationId = searchParams.get("locationId");
  const areaId = searchParams.get("areaId");
  navigate(`/dashboard?locationId=${locationId}&areaId=${areaId}`);
  ```

---

### 4. `src/components/TaskModal.tsx`

- [x] Update the "Location • Area" context link (currently just navigates to `/dashboard`):
  ```typescript
  // BEFORE:
  onClick={() => { onClose(); navigate("/dashboard"); }}

  // AFTER — area-level link (always available when task.area_id exists):
  onClick={() => {
    onClose();
    navigate(`/dashboard?locationId=${task.location_id}&areaId=${task.area_id}`);
  }}
  ```

- [x] Add a secondary "View plant" context link when there is exactly one active inventory item:
  ```typescript
  const activeIds = (task.inventory_item_ids || []).filter(
    (id: any) => inventoryDict[id]?.status !== "Archived",
  );
  // If activeIds.length === 1, show a "View plant" link:
  // navigate(`/dashboard?locationId=${task.location_id}&areaId=${task.area_id}&instanceId=${activeIds[0]}`)
  ```
  Show the "View plant" row only when `activeIds.length === 1`. When there are multiple,
  the area-level link is the right landing point (AreaDetails shows all plants for that area).

- [x] The "Plan" context link (`navigate("/planner")`) stays as-is — no change needed.

---

### 5. `src/components/TheShed.tsx` *(lower priority — implement after 1–4 are stable)*

- [x] Add `useSearchParams` to the react-router-dom import.
- [ ] Read `?instanceId` on mount. TheShed's existing deep-link system (`useEffect` watching
  `location.pathname`) already handles `/shed/add/...` URLs — extend this to handle `?instanceId`.
- [ ] Find the inventory item by ID in the shed's plant list and open its `InstanceEditModal`.
- [ ] When `InstanceEditModal` closes, remove `?instanceId` from URL via `navigate("/shed", { replace: true })`.

---

## What NOT to Change

- `TheShed`'s existing `/shed/add/...` path-based deep-link (BulkSearch modal) — leave alone.
- `dashboardView === "locations"` is the default state — no URL param means locations view.
- `isNavCollapsed` localStorage sync — unrelated to routing, leave it.
- Any component that has local `activeTab` for internal sub-tabs (BulkSearchModal,
  InstanceEditModal, PlannerDashboard, etc.) — these are UI state, not navigation.

---

## Execution Order

1. `App.tsx` — migrate `selectedLocationId` + `dashboardView` to `useSearchParams` (core change, do first)
2. `LocationPage.tsx` — add area URL sync + remove `onBack`
3. `AreaDetails.tsx` — add instance URL sync
4. `TaskModal.tsx` — update context links to use deep URLs
5. `TheShed.tsx` — optional, implement last after 1–4 are stable

---

## Edge Cases to Handle

- **Data not yet loaded**: When deep-linking to a location/area/instance, the `useEffect` seeds
  from URL only after the relevant array (`areas`, `plants`) has loaded. Guard with `areas.length > 0`
  and `plants.length > 0` in the effect dependencies — the effect re-runs once data arrives.

- **Stale URL after deletion**: If a user deep-links to an area or instance that has been deleted,
  the `find()` returns undefined, the state stays null, and the panel simply doesn't open.
  No crash — graceful no-op.

- **`?view=locations` is implied**: We do NOT put `?view=locations` in the URL — the absence of
  `?view` means locations. This keeps dashboard links short.

- **`navigate` with `{ replace: true }` for view tabs only**: Location/area/instance navigation
  should be push entries so the back button works as expected. Only the sub-view switcher
  (locations/calendar/weather) uses replace.
