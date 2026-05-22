# Caching — sessionStorage, localStorage, Supabase, Image Proxy

> Rhozly caches at several layers: in-memory React (hooks), `sessionStorage` (per-tab), `localStorage` (per-device), Supabase row caching (provider details in jsonb), and an image proxy for permissive caching of external photos.

---

## Quick Summary

| Layer | Lifetime | Use cases |
|-------|----------|-----------|
| In-memory (React state / hooks) | Per-render | Active screen data |
| `useCachedShed` etc. | Per session | Heavy lookup caches |
| `sessionStorage` | Per tab | One-shot navigation hints (e.g. plan filter) |
| `localStorage` | Per device | Preferences, dismissals, queue, recent searches |
| Supabase jsonb columns | Persistent | Provider plant details (`plants.data`), AI care guides |
| Edge function in-memory | Per cold start | Small lookup tables |
| Image proxy / CDN | Long | External image URLs proxied for CORS + cache headers |

---

## Role 1 — Technical Reference

### localStorage keys (notable)

| Key | Purpose |
|-----|---------|
| `rhozly_active_home` | Active home id |
| `rhozly_pwa_install_dismissed` | PWA prompt dismissal |
| `rhozly_pwa_installed` | Installation flag |
| `rhozly_lux_calibration` | Light Sensor calibration |
| `rhozly_exposure_offset` | Camera exposure offset |
| `rhozly_notif_prefs` | Notification preferences |
| `rhozly_last_seen_version` | Release notes seen-marker |
| `rhozly_version_first_seen_at` | What's-new pulse timing |
| `rhozly_high_contrast` | Accessibility |
| `rhozly_guides_visited` | First-visit banner dismissal |
| `rhozly_global_search_recent` | Recent search queries |
| `rhozly_queue` | Offline queue (see [Offline Queue](./16-offline-queue.md)) |
| `rhozly_shopping_plan_suggest_dismissed` | Shopping banner |
| `rhozly:dashboard:v1:{home_id}` | Local-first dashboard snapshot (see Dashboard snapshot below) |
| `ewelink_oauth_*` | eWeLink OAuth dance |

### Dashboard snapshot (`rhozly:dashboard:v1:{home_id}`)

Owned by `src/lib/dashboardCache.ts` and read/written by `src/App.tsx`'s `fetchDashboardData`. Lets the dashboard paint **immediately** from a local snapshot on cold open while the network revalidation runs in the background.

| Aspect | Value |
|--------|-------|
| Storage | `localStorage` (survives app close + reopen) |
| Key | `rhozly:dashboard:v1:{home_id}` — one entry per home, bump `:v1:` on schema change |
| TTL | 24 h — older entries still **paint** on cold open (better than empty), flagged `isStale: true` |
| Shape | `{ cachedAt: ISO, rawWeather, weather, locations, homeLatLng, hardinessZone, overdueTaskCount, alerts, locationTaskCounts }` |
| Size | ~10–100 KB per home depending on locations/plants count — comfortable inside the ~5 MB origin quota |

**Lifecycle:**

1. On mount with a `home_id`, `readDashboardCache(home_id)` is called synchronously. On hit, the snapshot hydrates state and the dashboard paints. `isStale` is set if the snapshot is older than 24 h.
2. `fetchDashboardData` runs in parallel via `withRetry`. On success, every state-setter also writes into a snapshot accumulator, and at the end `writeDashboardCache(home_id, snapshot)` overwrites the entry with fresh data.
3. On failure with a cache hit present, the cached data stays visible and the error surfaces non-destructively — the existing retry layer eventually catches up.

**Invalidation triggers (cache is overwritten):**

- Any successful `fetchDashboardData` run (the revalidation path).
- Pull-to-refresh (`handleManualRefresh`).
- Realtime channel events from `useHomeRealtime("homes" | "locations" | "inventory_items")` re-trigger the fetch.

**Cache is cleared by:**

- Sign-out — `clearAllDashboardCaches()` runs in the `onAuthStateChange` else branch to avoid leaking one user's data to another on shared devices.
- A version bump of `:v1:` → `:v2:` — old keys simply stop matching and are ignored (then evicted by quota when localStorage fills).
- Corrupt blob on read — the read path try/catches `JSON.parse` and `clearDashboardCache(home_id)` on parse failure, so a poisoned write can't permanently break the next read.

**Why localStorage, not sessionStorage:** the goal is offline-tolerant viewing across full app close (PWA + native Capacitor wrappers). sessionStorage dies on tab close and would not satisfy that.

### sessionStorage keys

| Key | Purpose |
|-----|---------|
| `rhozly:plan-filter` | Pre-apply a plan filter when navigating to Garden Layout from Planner |

### React-level caches

| Hook | What it caches |
|------|----------------|
| `useCachedShed` | Plants + inventory for the home (in-memory, refetch on mutate) |
| `useCommunityGuides` | Community guide list/single |
| `useHomeDashboardStats` | Dashboard stats |
| `usePlantDoctorSessions` | Plant Doctor history |
| `useReleaseNotes` | Release notes list |

### Supabase row caches

- `plants.data` — provider full payload (Perenual / Verdantly), avoids re-fetch.
- `plants.care_guide_data` (Wave 2+ of AI Plant Overhaul) — AI-generated structured care guide. Lives on the global AI catalogue row (`home_id IS NULL, source = 'ai'`). Replaces the legacy 30-day TTL string-keyed cache. Invalidation is freshness-version-based: `refresh-stale-ai-plants` cron (every 90 days) and `manual-refresh-ai-plant` edge fn re-check and bump `freshness_version` if content changed.
- `user_behaviour_summary` — weekly summary for AI grounding.

### Legacy `aiCache` string-keyed table (transitional)

The `plant-doctor` edge function still writes `getCached/setCached` entries for `generate_care_guide` results during the AI Plant Overhaul rollout. This is read-only fallback for paths not yet migrated to `plants.care_guide_data`. Removed in Wave 7 once backfill completes.

### Image proxy

`image-proxy` edge function fetches remote images and re-serves with permissive CORS + cache headers. Used when:
- External provider blocks hotlinking.
- Image needs long-cache headers.

### Cache invalidation

- Realtime channels (Supabase) re-trigger refetches on row changes.
- `mutate()` from cache hooks invalidates manually.
- Service worker handles `precache` + runtime caches per `vite-plugin-pwa` config.

---

## Role 2 — Expert Gardener's Guide

### Why this matters

The app feels instant for warm sessions because so much is cached, and on cold open the dashboard now paints from the local snapshot in under a frame — so the first thing you see is yesterday's tasks, plants and weather, not an empty skeleton. When something looks "stale", knowing where the cache lives helps:
- Recent search wrong? `rhozly_global_search_recent`.
- Layout filter unexpectedly set? `sessionStorage["rhozly:plan-filter"]`.
- High contrast toggle missing? `rhozly_high_contrast`.
- Dashboard showing yesterday's numbers on first paint? That's the local-first dashboard snapshot — the network revalidation will overwrite it in a beat. Pull-to-refresh forces it immediately.

### Common workflows

- **Hard refresh:** when stuck on stale data, pull-to-refresh or hard reload. Pull-to-refresh also overwrites the dashboard snapshot, so you're guaranteed fresh data after.
- **Cold open while offline:** the dashboard still paints — you can browse plants, see your task list, read locations. Actions that require the network will queue (see [Offline Queue](./16-offline-queue.md)) and replay when you're back online.
- **Nuclear:** Clear Cache button in [ErrorPage](../09-persistent-ui/08-error-page.md) wipes localStorage + service worker.

---

## Related reference files

- [Offline Queue](./16-offline-queue.md)
- [Realtime](./15-realtime.md)
- [PWA](./22-pwa.md)
- [Image Sources](./24-image-sources.md)

## Code references for ongoing maintenance

- `src/hooks/useCachedShed.ts`
- `src/lib/dashboardCache.ts` — local-first dashboard snapshot read/write/clear
- `src/App.tsx` — `fetchDashboardData` snapshot accumulator + read-on-mount wiring
- `tests/unit/lib/dashboardCache.test.ts`
- `vite.config.ts` — PWA runtime caching config
- `supabase/functions/image-proxy/index.ts`
