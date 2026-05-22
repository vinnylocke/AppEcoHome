# Plan — Local-first Dashboard caching (stale-while-revalidate)

> **Status**: design only — no code in this plan. Implement after the loading-reliability retry work has settled.

## Goal

When the user opens the app, paint the Dashboard from a locally-cached snapshot **immediately**, then revalidate against the network in the background. The cache survives full app close + reopen (localStorage, not sessionStorage), persists for up to 24 hours, and self-heals if the network comes back with different data.

## Why

Two pain points the retry layer can't solve:

1. **Cold-open latency.** Even with retries, the dashboard's first paint waits for: auth → profile read → home + locations + weather query → 4 parallel children. On a phone with a slow connection that's 1.5-3s of empty skeleton. The cache makes the first paint ~0ms.

2. **Offline-tolerant viewing.** On the train, in a basement, mid-flight: the cache means yesterday's task list, plant counts, locations and weather are still readable. The user can still tap a plant, browse the Shed, etc.

This pairs with the existing `withRetry` work — the cache is the SHOW path; the network revalidation is the REFRESH path. Whichever finishes faster wins the first paint.

## Architecture

### 1. Cache shape

One blob per home, stored in `localStorage` under a versioned key:

```
rhozly:dashboard:v1:{home_id}  →  {
  cachedAt: string;            // ISO timestamp
  data: {
    home: { lat, lng, hardiness_zone, country, … };
    locations: Location[];     // including areas + inventory_items counts
    weather: { rawWeather, weather };
    alerts: WeatherAlert[];
    locationTaskCounts: Record<string, number>;
    overdueTaskCount: number;
  };
}
```

Bump the `:v1:` segment whenever the shape changes incompatibly — old caches get ignored automatically rather than crashing the app.

### 2. Hook — `useLocalFirstDashboard(homeId)`

Single React hook owning the cache lifecycle. Returns:

```ts
{
  data: DashboardData | null;       // best available — cache OR network
  isCacheHit: boolean;              // true on first paint from cache
  isRevalidating: boolean;          // true while the network catch-up runs
  error: Error | null;              // network error AFTER cache hit (non-fatal)
  refresh(): Promise<void>;         // imperative re-fetch
}
```

Behaviour:
1. On mount with `homeId`, synchronously read the cache key. If hit → return data immediately + set `isCacheHit = true`.
2. Fire `fetchDashboardData` in the background (via `withRetry`).
3. On success: update state with fresh data + overwrite the cache + set `isRevalidating = false`.
4. On failure after cache hit: surface `error` but keep showing the cached data — non-destructive. The retry layer already handles the case where the network eventually comes back.

### 3. Cache TTL

24 hours hard cap. After 24 h we still SHOW the cached data on cold open (better than nothing), but flag it as `isStale: true` so the UI can paint a thin "Last synced 2 days ago" banner. Inside the 24 h window, no banner — it's just live data.

### 4. Migration from current state

App.tsx currently uses ad-hoc sessionStorage caches (`weather_cache_{homeId}`, `locations_cache_{homeId}`) inside `fetchDashboardData`. We:
- Keep those as-is for one release (legacy users have data there).
- The new hook layers ON TOP — reads the new cache, falls back to the old ad-hoc caches, falls back to network.
- After one release we delete the ad-hoc caches.

### 5. Cache invalidation

The cache is overwritten by:
- Any successful network fetch (the revalidation path).
- Pull-to-refresh.
- A manual `refresh()` call.
- Realtime channel events (`useHomeRealtime("homes" | "locations" | "inventory_items")` already triggers `fetchDashboardData`).

The cache is cleared by:
- Sign-out (defensive — different account, different data).
- A version bump of the `:v1:` key (schema migration).

## Files we'd add / change

| File | Purpose |
|------|---------|
| `src/lib/dashboardCache.ts` | Pure cache I/O: `read(homeId)`, `write(homeId, data)`, `clear(homeId)`, `clearAll()`. localStorage wrapped in try/catch with the usual quota / private-mode guards. |
| `src/hooks/useLocalFirstDashboard.ts` | The new hook orchestrating cache + network. |
| `src/App.tsx` | Swap inline `fetchDashboardData` + state for the hook. Removes the ad-hoc sessionStorage caches once stable. |
| `tests/unit/lib/dashboardCache.test.ts` | Read / write / clear / TTL / corrupt-blob handling. |
| `tests/unit/hooks/useLocalFirstDashboard.test.ts` | Cache-hit, cache-miss, revalidate-success, revalidate-fail-with-cache, TTL-staleness. |

## What to be careful about

- **Stale weather alerts.** Cached alerts may have expired since the user last opened the app. The render layer should already filter by `is_active = true`; double-check it does after this lands.
- **Schema drift.** Any time we add a new field to the dashboard payload, bump `:v1:` → `:v2:` so old caches don't return malformed shapes. Document this in the data-model app-reference.
- **Multi-home users.** The cache is keyed by home_id, so switching homes shows the right data instantly. Sign-out clears all keys to avoid leaking one user's data to another on shared devices.
- **localStorage size.** A heavy home (lots of locations + plants) might land at 50-100 KB. localStorage gives us ~5 MB per origin — comfortable.
- **PII / sensitivity.** The dashboard data is the user's own garden info. Caching it on disk is reasonable; we already do this for parts of it. No regulatory new ground.

## Risks

- **Showing stale data is a UX commitment.** Users might tap a card based on yesterday's state and be surprised when the revalidation lands and shifts numbers. Mitigate with a subtle "Last synced X mins ago" footer + a refresh affordance.
- **Cache corruption.** localStorage blobs survive forever; a malformed write can poison the next read. The read path should always try/catch + clear-on-parse-error.

## Sequencing (when we build it)

1. `dashboardCache.ts` + tests.
2. `useLocalFirstDashboard.ts` + tests.
3. Mount in `App.tsx`. Keep the legacy ad-hoc caches as a fallback read path for one release.
4. Add the "Last synced X" stale-banner UI to the Dashboard layout.
5. Realtime invalidation + sign-out clear.
6. Remove the legacy ad-hoc caches one release later.
7. App-reference doc: new section in `docs/app-reference/99-cross-cutting/14-caching.md`.

## Out of scope for this feature

- Caching The Shed, planner, library, etc. on the same pattern. Each is a separate hook; we can clone this design later.
- Service worker offline shell (caching the HTML / JS bundle for true offline). That's a separate concern owned by the PWA layer.
- IndexedDB instead of localStorage. localStorage is fine until we cross ~2 MB; IndexedDB adds complexity we don't need yet.
