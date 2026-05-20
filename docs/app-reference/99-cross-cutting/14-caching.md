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
| `ewelink_oauth_*` | eWeLink OAuth dance |

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

The app feels instant for warm sessions because so much is cached. When something looks "stale", knowing where the cache lives helps:
- Recent search wrong? `rhozly_global_search_recent`.
- Layout filter unexpectedly set? `sessionStorage["rhozly:plan-filter"]`.
- High contrast toggle missing? `rhozly_high_contrast`.

### Common workflows

- **Hard refresh:** when stuck on stale data, pull-to-refresh or hard reload.
- **Nuclear:** Clear Cache button in [ErrorPage](../09-persistent-ui/08-error-page.md) wipes localStorage + service worker.

---

## Related reference files

- [Offline Queue](./16-offline-queue.md)
- [Realtime](./15-realtime.md)
- [PWA](./22-pwa.md)
- [Image Sources](./24-image-sources.md)

## Code references for ongoing maintenance

- `src/hooks/useCachedShed.ts`
- `vite.config.ts` — PWA runtime caching config
- `supabase/functions/image-proxy/index.ts`
