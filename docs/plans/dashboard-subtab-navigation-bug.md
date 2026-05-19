# Plan — Fix Dashboard sub-tab navigation getting stuck on saved view

## The bug

When a user clicks the **Locations** sub-tab on the dashboard (URL becomes `/dashboard?view=locations`) and then tries to click the **Dashboard** sub-tab to go back, the URL briefly updates to `/dashboard`, then immediately reverts to `/dashboard?view=locations`. The Dashboard sub-tab is unreachable until the user navigates to a different page entirely.

Reported by user: *"if you are on the dashboard and you navigate to the location tab, you can't navigate back to the dashboard tab — the url never updates it stays with the location tab url."*

## Root cause

`src/App.tsx` lines 339–357 contains a "persist last dashboard view" effect:

```tsx
useEffect(() => {
  if (routerLocation.pathname !== "/dashboard") return;
  if (selectedLocationId) return;
  const urlView = searchParams.get("view");
  if (urlView) {
    localStorage.setItem("rhozly_dashboard_view", urlView);
    return;
  }
  // No view param — restore last preference if any
  const saved = localStorage.getItem("rhozly_dashboard_view");
  if (saved && saved !== "dashboard" && ["locations", "calendar", "weather"].includes(saved)) {
    const next = new URLSearchParams(searchParams);
    next.set("view", saved);
    setSearchParamsForView(next, { replace: true });
  }
}, [routerLocation.pathname, searchParams.toString()]);
```

The effect's dependency on `searchParams.toString()` means it re-runs whenever the query string changes. When the user clicks "Dashboard" sub-tab from "Locations" sub-tab:

1. `navigate("/dashboard")` removes the `view=locations` param
2. The effect fires with `urlView === null`
3. localStorage still has `"locations"` saved
4. The effect re-adds `?view=locations` — undoing the user's click

This is a feedback loop: any attempt to navigate from a non-default view back to the default view is reverted.

## Fix

The "restore last view" behaviour should only run **once per mount**, on the user's *first* arrival at `/dashboard`. After that, the URL is the single source of truth — if the user explicitly navigates to `/dashboard` (no view param), they want the default Dashboard view.

Use a `useRef` flag `hasRestoredViewRef` that is set to `true` after the first restore (or first observed `urlView`) and short-circuits the effect on subsequent runs. The "save the current view to localStorage" half of the effect can stay running on every change (so the saved value stays fresh).

## Files changed

| File | Change |
|------|--------|
| `src/App.tsx` | Add `hasRestoredViewRef`; split the effect so "save current view" still runs every time, but "restore from localStorage" only runs once. |

## Risks

- Existing tests that expected the view to be restored after a hard navigation away and back will still pass — restore happens on mount, which covers that case.
- No DB or schema changes.

## Verification

1. Manual: from `/dashboard` → click "Locations" sub-tab → click "Dashboard" sub-tab → URL becomes `/dashboard` and stays there.
2. Manual: from `/dashboard?view=locations`, hard-reload → URL stays at `?view=locations` (saved value preserved across reloads).
3. Manual: clear localStorage → load `/dashboard` → defaults to Dashboard view.
4. `npx tsc --noEmit` clean.
