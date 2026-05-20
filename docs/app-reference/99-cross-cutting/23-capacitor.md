# Capacitor — Native Wrapper, Native APIs

> The native mobile app wraps the same React build via Capacitor. The web code detects via `Capacitor.isNativePlatform()` and switches to native APIs where appropriate (camera, light sensor, push, device orientation, deep links).

---

## Quick Summary

```
Rhozly mobile app
├── Capacitor shell (iOS / Android)
│   ├── Camera plugin
│   ├── Push notifications (Firebase)
│   ├── App URL listener (deep links)
│   ├── Light Sensor plugin (@capgo/capacitor-light-sensor)
│   └── (Web build runs inside WebView)
└── Same React code as web, with platform branches
```

---

## Role 1 — Technical Reference

### `Capacitor.isNativePlatform()` checks

Used to branch:
- Camera capture (native plugin vs web `<input capture>`).
- Light sensor (native vs camera pixel analysis).
- Push notifications (Firebase plugin vs web push).
- PWA install prompt (hidden when native).
- **Mobile home routing** — `useIsMobile()` in `src/hooks/useIsMobile.ts` returns true when `Capacitor.isNativePlatform()` OR viewport width < 768px. App.tsx uses this to redirect `/` to `/quick` (mobile) vs `/dashboard` (desktop) and to surface the mobile-only "Quick" nav entry. See [Quick Access Home](../02-dashboard/09-quick-access-home.md).

### Plugins in use

| Plugin | Purpose |
|--------|---------|
| `@capacitor/camera` | Camera + library picker |
| `@capacitor/push-notifications` | FCM tokens |
| `@capacitor/app` | URL listener (deep links) |
| `@capacitor/device` | Device info |
| `@capgo/capacitor-light-sensor` | Native ambient light sensor |
| `@capacitor-community/screen-orientation` (or similar) | Orientation lock |

### Deep linking

Configured in `capacitor.config.ts` (URL schemes). `App.addListener("appUrlOpen", ...)` in `src/main.tsx` parses and navigates.

### Push notifications

`usePushNotifications` hook registers the token and persists to `user_devices`.

```ts
PushNotifications.register();
PushNotifications.addListener("registration", (token) => {
  // save to user_devices
});
```

### Native build pipeline

- `npx cap sync` after web build.
- Open in Xcode / Android Studio.
- Build + distribute via stores.

### Versioning

Native apps version separately from the web app. Display version in About / Settings (often pulled from `capacitor.config.ts` + `version.json`).

### Auto-update on web; manual on native

Web users auto-update via PWA + Vercel deploy. Native users update via the App Store / Play Store (or in-app update prompts).

---

## Role 2 — Expert Gardener's Guide

### Why native + web

Same app, two delivery channels:
- **Web** — fastest deploys, no store gatekeepers.
- **Native** — better integration (real push, sensors, deep links).

Most users will be on one or the other; some power users have both.

### Implications

- Native gets a richer Light Sensor (real ambient sensor vs camera estimate).
- Native gets reliable push.
- Web gets faster updates.

---

## Related reference files

- [PWA](./22-pwa.md)
- [Light Sensor](../03-garden-hub/09-light-sensor.md)
- [Notifications](./12-notifications.md)
- [Routing](./21-routing.md) — deep links

## Code references for ongoing maintenance

- `capacitor.config.ts`
- `src/main.tsx` — deep link wiring
- `src/hooks/usePushNotifications.ts`
- `src/hooks/useDeviceOrientation.ts`
