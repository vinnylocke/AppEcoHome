# Routing Migration Plan — Option B (Full React Router)

## Overview

Replace the `activeTab` state-based navigation in `App.tsx` with proper React Router
routes. Every tab gets a URL, refresh preserves your page, and the shed redirect bug
is fixed. Deep linking (task → plant → area) is Phase 2.

---

## Tab ID → URL Map

| Current `activeTab` ID | New URL        | Notes                    |
|------------------------|----------------|--------------------------|
| `dashboard`            | `/dashboard`   | Root `/` redirects here  |
| `task_management`      | `/schedule`    |                          |
| `shed`                 | `/shed`        |                          |
| `watchlist`            | `/watchlist`   |                          |
| `visualiser`           | `/visualiser`  |                          |
| `planner`              | `/planner`     |                          |
| `doctor`               | `/doctor`      |                          |
| `garden_profile`       | `/profile`     |                          |
| `lightsensor`          | `/lightsensor` |                          |
| `guides`               | `/guides`      |                          |
| `management`           | `/management`  |                          |
| `admin_guides`         | `/admin/guides`|                          |

---

## Phase 1 — File-by-File Changes

### Status Legend
- [ ] Not started
- [x] Complete

---

### 1. `src/components/RouteWatcher.tsx` — DELETE
- [x] Delete the entire file. Its only job was mapping the `/shed` URL back to `activeTab`.
  Once the URL IS the source of truth this file has no purpose.

---

### 2. `src/components/TheShed.tsx` — Fix returnTo bug
- [x] Change line ~372:

```typescript
// BEFORE:
navigate("/shed", { replace: true });

// AFTER:
navigate(location.state?.returnTo ?? "/dashboard", { replace: true });
```

`useLocation` is already imported. No other changes needed.

---

### 3. `src/components/AreaDetails.tsx` — Add returnTo to both shed navigations
- [x] Add `useLocation` alongside the existing `useNavigate` import.
- [x] Update both `navigate("/shed", { state: {...} })` calls (lines ~463 and ~473):

```typescript
// BEFORE:
navigate("/shed", {
  state: { autoImport: [...], source: "api" }
});

// AFTER:
navigate("/shed", {
  state: { autoImport: [...], source: "api", returnTo: location.pathname + location.search }
});
```

---

### 4. `src/components/PlanStaging.tsx` — Add returnTo to shed navigation
- [x] Add `useLocation` alongside the existing `useNavigate` import.
- [x] Update line ~475:

```typescript
// BEFORE:
navigate("/shed", { state: { autoImport: [...], source } });

// AFTER:
navigate("/shed", { state: { autoImport: [...], source, returnTo: location.pathname + location.search } });
```

---

### 5. `src/components/PlantActionButtons.tsx` — Add returnTo to shed navigation
- [x] Add `useLocation` alongside the existing `useNavigate` import.
- [x] Update line ~41:

```typescript
// BEFORE:
navigate("/shed", { state: { autoImport: selectedRecs, source } });

// AFTER:
navigate("/shed", { state: { autoImport: selectedRecs, source, returnTo: location.pathname + location.search } });
```

---

### 6. `src/components/TaskModal.tsx` — Fix /areas route
- [x] Line ~752: change `navigate("/areas")` → `navigate("/dashboard")`
- [x] The `/planner` navigation on line ~774 is already correct, no change needed.

---

### 7. `src/components/LocationPage.tsx` — Add navigate, make onBack optional
- [x] Add `useNavigate` import from react-router-dom.
- [x] Add `const navigate = useNavigate();` inside the component.
- [x] Made `onBack` optional in `LocationPageProps` (kept for App.tsx's selectedLocationId clear).
- [x] Replace `onClick={onBack}` with `onClick={() => onBack ? onBack() : navigate("/dashboard")}`.
- Note: App.tsx still passes `onBack={() => setSelectedLocationId(null)}` — Phase 2 will move selectedLocationId to URL params and remove this entirely.

---

### 8. `src/App.tsx` — Core routing refactor (do last)
- [x] **Remove:**
  - `const [activeTab, setActiveTab]` and its `useEffect` localStorage sync
  - The `localStorage.getItem("rhozly_tab")` initial value
  - `localStorage.setItem("rhozly_tab", ...)` useEffect
  - `import RouteWatcher` and `<RouteWatcher ... />` usage
  - `dashboardView` localStorage sync (keep the state itself for now — Phase 2 will move to URL)
  - `selectedLocationId` localStorage sync (same — keep state, remove persistence)

- [ ] **Add:**
  ```typescript
  import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
  // (BrowserRouter stays at the root — it's already there)

  const TAB_URL: Record<string, string> = {
    dashboard:       "/dashboard",
    task_management: "/schedule",
    shed:            "/shed",
    watchlist:       "/watchlist",
    visualiser:      "/visualiser",
    planner:         "/planner",
    doctor:          "/doctor",
    garden_profile:  "/profile",
    lightsensor:     "/lightsensor",
    guides:          "/guides",
    management:      "/management",
    admin_guides:    "/admin/guides",
  };

  const navigate = useNavigate();
  const location = useLocation();
  ```

- [ ] **Replace desktop nav link rendering** (lines ~500–512):
  ```typescript
  // active:
  active={location.pathname === TAB_URL[link.id] || (link.id === "dashboard" && location.pathname === "/")}
  // onClick:
  onClick={() => { navigate(TAB_URL[link.id]); setSelectedLocationId(null); }}
  ```

- [ ] **Replace mobile nav link rendering** (lines ~810–824):
  ```typescript
  // active: same as desktop
  // onClick:
  onClick={() => { navigate(TAB_URL[link.id]); setSelectedLocationId(null); setIsMobileMenuOpen(false); }}
  ```

- [ ] **Replace Garden Profile button** (line ~680):
  ```typescript
  // BEFORE: onClick={() => setActiveTab("garden_profile")}
  // AFTER:  onClick={() => navigate("/profile")}
  ```

- [ ] **Replace sidebar sub-nav active checks** (lines ~519–531 — the extra items that
  appear under Planner / Task Management in the sidebar):
  ```typescript
  // BEFORE: {activeTab === "planner" && ...}
  // AFTER:  {location.pathname === "/planner" && ...}
  // Same for "task_management" → "/schedule", "dashboard" → "/dashboard"
  ```

- [ ] **Replace main content area** — replace the entire block of `{activeTab === "x" && ...}`
  JSX with `<Routes>`. Preserve the `animate-in fade-in duration-500` wrappers.
  Keep the `profile?.home_id` guards inside the route elements:

  ```tsx
  <Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} />

    <Route path="/dashboard" element={
      <div className="h-full animate-in fade-in duration-500">
        {/* paste existing dashboard JSX — selectedLocationId, dashboardView etc stay as state */}
      </div>
    } />

    <Route path="/schedule" element={
      profile?.home_id ? (
        <div className="h-full animate-in fade-in duration-500">
          <BlueprintManager homeId={profile.home_id} />
        </div>
      ) : null
    } />

    <Route path="/shed" element={
      profile?.home_id ? (
        <div className="h-full animate-in fade-in duration-500">
          <TheShed homeId={profile.home_id} userId={session.user.id} />
        </div>
      ) : null
    } />

    <Route path="/watchlist" element={
      profile?.home_id ? (
        <div className="h-full animate-in fade-in duration-500">
          <AilmentWatchlist homeId={profile.home_id} />
        </div>
      ) : null
    } />

    <Route path="/visualiser" element={
      profile?.home_id ? (
        <div className="h-full animate-in fade-in duration-500">
          <PlantVisualiser homeId={profile.home_id} userId={session.user.id} />
        </div>
      ) : null
    } />

    <Route path="/planner" element={
      profile?.home_id ? (
        <div className="h-full animate-in fade-in duration-500">
          <PlannerDashboard homeId={profile.home_id} />
        </div>
      ) : null
    } />

    <Route path="/doctor" element={
      <div className="h-full animate-in fade-in duration-500">
        <PlantDoctor homeId={profile?.home_id} userId={session?.user?.id} />
      </div>
    } />

    <Route path="/profile" element={
      profile?.home_id && session?.user?.id ? (
        <div className="h-full animate-in fade-in duration-500">
          <GardenProfile homeId={profile.home_id} userId={session.user.id} />
        </div>
      ) : null
    } />

    <Route path="/lightsensor" element={
      <div className="h-full animate-in fade-in duration-500">
        <LightSensor locations={locations} homeId={profile?.home_id} />
      </div>
    } />

    <Route path="/guides" element={
      <div className="h-full animate-in fade-in duration-500">
        <GuideList />
      </div>
    } />

    <Route path="/management" element={
      <div className="h-full animate-in fade-in duration-500">
        <LocationManager homeId={profile?.home_id} onLocationChange={fetchDashboardData} />
      </div>
    } />

    {profile?.is_admin && (
      <Route path="/admin/guides" element={
        <div className="h-full animate-in fade-in duration-500">
          <AdminGuideGenerator />
        </div>
      } />
    )}

    <Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes>
  ```

- [ ] Remove `onBack` prop from `<LocationPage>` (handled in LocationPage.tsx step above).

---

## What NOT to Change

These components use a local `activeTab` variable for internal UI tabs — leave them alone:

- `src/components/BulkSearchModal.tsx` — local "api / ai / manual" search tabs
- `src/components/InstanceEditModal.tsx` — local "details / care_guide / routine / journal" tabs
- `src/components/PlannerDashboard.tsx` — local "Pending / Active / Completed" filter tabs
- `src/components/PlantEditModal.tsx` — local "care / ..." tabs
- `src/components/SpriteWizardModal.tsx` — local "pixabay / personal" tabs
- `src/components/LightSensor.tsx` — has its own internal `selectedLocationId` for location
  picking, unrelated to the App-level one

---

## Phase 2 — Deep Linking (follow-on task, after Phase 1 is stable)

Enables the task → plant → area deep link.

**URL structure:**
```
/dashboard?locationId=xxx
/dashboard?locationId=xxx&areaId=yyy
/dashboard?locationId=xxx&areaId=yyy&plantId=zzz
```

**Files involved:**
- [ ] `src/App.tsx` — read `locationId` from `useSearchParams` instead of state for
  `selectedLocationId`; same for `dashboardView` → `?view=x`
- [ ] `src/components/LocationPage.tsx` — read `areaId` from URL params to auto-open
  `focusedArea` on mount
- [ ] `src/components/AreaDetails.tsx` — read `plantId` from URL params to auto-open
  `editingInstance` on mount
- [ ] `src/components/TaskModal.tsx` — replace `navigate("/dashboard")` with
  `navigate("/dashboard?locationId=x&areaId=y&plantId=z")` when a linked plant is clicked

---

## Execution Order

1. `RouteWatcher.tsx` — delete
2. `TheShed.tsx` — one-line fix
3. `AreaDetails.tsx`, `PlanStaging.tsx`, `PlantActionButtons.tsx` — add returnTo (parallel)
4. `TaskModal.tsx` — one-line fix
5. `LocationPage.tsx` — remove onBack prop
6. `App.tsx` — core refactor (do last, after all dependencies are clear)
