# PWA — Service Worker, Update Flow, Install

> Rhozly is a Progressive Web App. `vite-plugin-pwa` generates a service worker that precaches the app shell and runtime-caches static media only (Supabase public storage + external image hosts) — API responses are never cached. The browser can install it as a home-screen app on supported platforms (Chrome, Edge, Safari with manual flow).

---

## Quick Summary

```
vite-plugin-pwa
├── precaches: app shell (JS, CSS, fonts)
├── runtime cache: Workbox strategies per route
├── auto-update enabled
└── prompt-driven update via UpdateBanner
```

---

## Role 1 — Technical Reference

### `vite.config.ts` (PWA plugin)

Typical config:

```ts
VitePWA({
  registerType: "prompt",      // or "autoUpdate"
  workbox: {
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      // supabase-public-media — Supabase Storage public objects
      // remote-images — Unsplash / Wikimedia / Perenual
      // (nothing else — no catch-all route)
    ],
  },
  manifest: {
    name: "Rhozly",
    short_name: "Rhozly",
    icons: [...],
    theme_color: "#...",
    start_url: "/",
    display: "standalone",
  },
});
```

### `registerSW` callback

In `src/main.tsx`:

```ts
const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent("pwa-update-available", {
      detail: { reload: () => updateSW(true) },
    }));
  },
  onOfflineReady() { /* optional toast */ },
});
```

`UpdateBanner` listens for `pwa-update-available`. The banner is **mandatory and non-cancellable**: there's a 3-second countdown showing "Updating Rhozly OS… Applying the latest version in {n}s." then the reload fires unconditionally. No "Not now", no dismiss — the user is always brought onto the latest bundle.

### Resume / foreground detection

`useAppVersion` keeps the running bundle in sync with the deployed version by polling `app_config.app_version`. Refresh triggers:

- Initial mount.
- 30-second interval while the tab is visible (paused when hidden).
- `document.visibilitychange` → "visible" (tab/window foreground).
- `window.focus` (some platforms skip visibilitychange).
- `window.pageshow` (Safari BFCache restore).
- `window.online` (network return after offline).
- Capacitor `App.appStateChange` → `isActive=true` (native shell background→foreground; loaded via dynamic import so the web bundle stays clean).

An in-flight guard prevents pile-up when several triggers fire close together. Whenever a poll reveals `dbVersion > bundleVersion`, the hook dispatches the same `pwa-update-available` event the SW would have fired — that's the safety net for the case where the SW is asleep on iOS PWA / similar quirky hosts.

### Install detection

- `window.matchMedia("(display-mode: standalone)").matches` — already installed.
- `Capacitor.isNativePlatform()` — already a native app, not a PWA.

### Install prompt

`beforeinstallprompt` window event — stashed and used by [InstallPwaPrompt](../01-onboarding/08-pwa-install.md).

### Runtime cache strategies

The SW registers **exactly two** runtime routes; anything without a route is NetworkOnly by default:

| Cache name | Pattern | Strategy |
|------------|---------|----------|
| `supabase-public-media` | Supabase Storage public objects (`/storage/v1/object/public/`) | StaleWhileRevalidate, 500 entries / 30 days, purge on quota error |
| `remote-images` | `images.unsplash.com`, `upload.wikimedia.org`, `perenual.com` | StaleWhileRevalidate, 300 entries / 30 days, purge on quota error |

Everything else — Supabase REST / Auth / Edge Functions / Realtime, Open-Meteo, Firebase — has **no route = NetworkOnly** (live data, never cached). This replaced a `/^https:\/\//` NetworkFirst catch-all (`remote-resources` cache) that wrote every authenticated PostgREST response into Cache Storage: stale data replayed after mutations on flaky networks, another account's rows readable at rest on shared devices, and unbounded growth. Sign-out also deletes the legacy `remote-resources` cache on devices that still carry it.

### Background updates

Service worker installs in background; UpdateBanner prompts to reload + activate.

---

## Role 2 — Expert Gardener's Guide

### Why PWA

- Install to home screen → looks like a native app.
- Works offline-ish (cached shell + offline queue).
- Auto-updates in background.

### Install paths

- **Chrome / Edge:** native prompt. Tap the install button.
- **iOS Safari:** Share → Add to Home Screen (manual flow).
- **Capacitor native:** already an app, no PWA install needed.

---

## Related reference files

- [PWA Install Prompt](../01-onboarding/08-pwa-install.md)
- [Update Banner](../09-persistent-ui/06-update-banner.md)
- [Capacitor](./23-capacitor.md)

## Code references for ongoing maintenance

- `vite.config.ts` — PWA config
- `src/main.tsx` — registerSW
- `src/components/UpdateBanner.tsx`
- `src/components/InstallPwaPrompt.tsx`
