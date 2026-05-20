# PWA Install Prompt

> A small dashboard card prompting browser users to add Rhozly to their home screen (PWA install). Triggered by the browser's `beforeinstallprompt` event.

**Rendered on:** `/dashboard?view=dashboard`
**Source file:** `src/components/InstallPwaPrompt.tsx`

---

## Quick Summary

Listens for `beforeinstallprompt` from the browser. When it fires (only on supported browsers — Chrome / Edge / Safari iOS via different path), stashes the event and shows a card with an "Install Rhozly" button. Tapping the button calls the stashed `prompt()` method. The card self-hides on Capacitor native (already installed) or when previously dismissed.

---

## Role 1 — Technical Reference

### Component graph

```
InstallPwaPrompt
├── (early return) if Capacitor.isNativePlatform() — already a native app
├── (early return) if standalone display mode (already installed)
├── (early return) if LS `rhozly_pwa_install_dismissed` set
├── (early return) if no deferredPrompt event captured
└── Card
    ├── Icon + title "Install Rhozly"
    ├── Subtitle "Add to your home screen for faster access"
    ├── Install button → prompts native install dialog
    └── Dismiss link (LS-backed)
```

### Local state

| State | Type | Purpose |
|-------|------|---------|
| `deferredPrompt` | `BeforeInstallPromptEvent \| null` | The captured browser event |
| `dismissed` | `boolean` | LS-backed dismissal |

### Browser API integration

- `window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); setDeferredPrompt(e); })`
- `window.addEventListener("appinstalled", () => setLs("rhozly_pwa_installed", "1"))`
- Detect standalone mode: `window.matchMedia("(display-mode: standalone)").matches`

### Data flow — read paths

Browser-side only:
- `Capacitor.isNativePlatform()`
- `matchMedia("(display-mode: standalone)")`
- `localStorage.getItem("rhozly_pwa_install_dismissed")`
- `localStorage.getItem("rhozly_pwa_installed")`

### Data flow — write paths

- Install button: `await deferredPrompt.prompt()` then `await deferredPrompt.userChoice` — if accepted, the OS handles installation.
- Dismiss button: `localStorage.setItem("rhozly_pwa_install_dismissed", "1")`.

### Edge functions invoked

None.

### Cron / scheduled jobs that affect this surface

None.

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions / role-based UI

None.

### Error states

| State | Result |
|-------|--------|
| Browser doesn't support PWA install | `beforeinstallprompt` never fires; card stays hidden |
| User opens app while already installed | Standalone display mode detected → card hidden |
| User dismisses | LS flag stops future renders |

### Performance notes

- Lightweight — listens to one window event, renders nothing in most sessions (Capacitor + already-installed users).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this card

A PWA install gives Rhozly its own home-screen icon and (on supported browsers) faster startup and offline-friendlier behaviour. For users who use the web app daily, installing it is the difference between "an open tab" and "an app". The card prompts the install at the moment the browser is ready to allow it.

### Every flow on this card

#### 1. Install button

- Triggers the browser's native install dialog.
- Accept → the browser adds an icon to your home screen / app launcher.
- Reject → card stays visible (you can install later by tapping the button again).

#### 2. Dismiss link

- Hides the card permanently for this device / browser.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Title | "Install Rhozly" |
| Subtitle | Value statement — fast access, home-screen icon |
| Install button | Triggers `deferredPrompt.prompt()` |
| Dismiss link | LS dismissal |

### Tier-by-tier experience

Identical for every tier.

### New user vs returning user

- **Brand new user on Chrome / Edge**: card may appear on first or second dashboard visit (browser controls timing).
- **Returning user already on Capacitor native**: card never shows.
- **iOS Safari**: `beforeinstallprompt` is not supported; users have to use Safari's Share → Add to Home Screen manually.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **"I don't see the install button."** Browser hasn't fired the event yet. Visit Rhozly a few times and it should trigger. Or your browser doesn't support PWA install.
- **iOS users:** Safari requires manual install via the Share menu — there's no programmatic prompt. We could add an iOS-specific instruction; currently not in the card.
- **Confusing PWA install with the native app.** Different paths: PWA = browser shortcut with offline cache; native = Capacitor wrapper. Either works.

### Recommended workflows

- **Web users on Chrome / Edge:** install when prompted. Better experience.
- **iOS Safari users:** Share → Add to Home Screen manually.
- **Native users (App Store / Play Store):** ignore the card — you've already got the native app.

### What to do if something looks wrong

- **Card disappeared mid-install:** browser may have crashed the prompt. Reload and try again.
- **Installed but the icon points to web:** that's expected. PWA is a shortcut to a service-worker-cached version of the web app.

---

## Related reference files

- [Dashboard Tab](../02-dashboard/01-dashboard-tab.md)
- [PWA (cross-cutting)](../99-cross-cutting/22-pwa.md)
- [Capacitor (cross-cutting)](../99-cross-cutting/23-capacitor.md)

## Code references for ongoing maintenance

- `src/components/InstallPwaPrompt.tsx` — component
- `src/main.tsx` — `registerSW` + service worker setup
- `vite.config.ts` — PWA plugin config (icons, manifest)
