# PWA Install Prompt

> A small dashboard card prompting browser users to add Rhozly to their home screen (PWA install). Triggered by the browser's `beforeinstallprompt` event.

**Rendered on:** the merged home tab of `/dashboard` (the Dashboard sub-tab), **just below the home hero** (home redesign Stage 1 — the slot renders via `HomeMain`'s `promoSlot` prop, no longer above the page), inside the **single-slot onboarding system at priority 4 (lowest)** — it renders only when the Getting Started Checklist is gone, the Garden Quiz prompt is ineligible, AND the Notification Opt-In card is ineligible.
**Source file:** `src/components/InstallPwaPrompt.tsx`

---

## Quick Summary

Listens for `beforeinstallprompt` from the browser — **Chrome / Edge / Android only; Safari iOS never fires it, so the card never shows there** (avoiding a button that wouldn't work). When it fires, stashes the event and shows a card with an "Install" button that calls the stashed `prompt()`. Self-hides on Capacitor native, in standalone display mode, or when a previous dismissal / install is recorded. Persistence is **localStorage only** (`rhozly_pwa_install_dismissed`, `rhozly_pwa_installed`); there is **no `onboarding_state` key** for this card.

---

## Role 1 — Technical Reference

### Slot gating (App.tsx)

```ts
{!checklistSlotVisible && !quizPromptEligible && !notifOptInEligible && (
  <InstallPwaPrompt />
)}
```

Lowest priority in the single-slot cascade — even when mounted, the component still renders `null` unless a `beforeinstallprompt` event has actually been captured.

### Component graph

```
InstallPwaPrompt (testid pwa-install-prompt)
├── (effect bails) if Capacitor.isNativePlatform() — already a native app
├── (effect bails) if standalone display mode (already installed)
├── (effect bails) if LS rhozly_pwa_install_dismissed === "true"
├── (effect bails) if LS rhozly_pwa_installed === "true"
├── (render null) until a beforeinstallprompt event is captured
└── Card
    ├── Icon + title "Install Rhozly on this device"
    ├── Subtitle "Faster load, full-screen, and a home-screen icon — works offline for recent data."
    ├── Install button (testid pwa-install-accept) → prompts native install dialog
    └── Dismiss X (testid pwa-install-dismiss, LS-backed)
```

### Local state

| State | Type | Purpose |
|-------|------|---------|
| `deferred` | `BeforeInstallPromptEvent \| null` | The captured browser event |
| `visible` | `boolean` | True only once the event is captured (and pre-checks passed) |

### Browser API integration

- `window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); setDeferred(e); setVisible(true); })` — Chrome / Edge / Android only
- `window.addEventListener("appinstalled", () => { localStorage.setItem("rhozly_pwa_installed", "true"); hide(); })`
- Detect standalone mode: `window.matchMedia("(display-mode: standalone)").matches`
- Listeners are only attached when the pre-checks (native / standalone / LS flags) pass, and are removed on unmount.

### Data flow — read paths

Browser-side only:
- `Capacitor.isNativePlatform()`
- `matchMedia("(display-mode: standalone)")`
- `localStorage.getItem("rhozly_pwa_install_dismissed")` — value `"true"`
- `localStorage.getItem("rhozly_pwa_installed")` — value `"true"`

### Data flow — write paths

- Install button: `await deferred.prompt()` then `await deferred.userChoice` — **accepted** → `rhozly_pwa_installed = "true"`; **rejected** → `rhozly_pwa_install_dismissed = "true"`. Either way the card hides and the deferred event is cleared (one shot — declining the OS dialog counts as a dismissal).
- Dismiss X: `localStorage.setItem("rhozly_pwa_install_dismissed", "true")`.
- `appinstalled` event: `rhozly_pwa_installed = "true"`.

All persistence is localStorage — per-device, no `onboarding_state` involvement.

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
| Browser doesn't support PWA install (incl. all iOS Safari) | `beforeinstallprompt` never fires; card stays hidden |
| User opens app while already installed | Standalone display mode detected → card hidden |
| User dismisses, or rejects the OS install dialog | LS dismissed flag stops future renders |
| `prompt()` throws | Swallowed; card hides |

### Performance notes

- Lightweight — listens to two window events, renders nothing in most sessions (Capacitor + already-installed + iOS users).

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this card

A PWA install gives Rhozly its own home-screen icon and (on supported browsers) faster startup and offline-friendlier behaviour. For users who use the web app daily, installing it is the difference between "an open tab" and "an app". The card prompts the install at the moment the browser is ready to allow it — and only once every other onboarding card (checklist, quiz reminder, notification prompt) has had its say, since the dashboard shows one promo card at a time.

### Every flow on this card

#### 1. Install button

- Triggers the browser's native install dialog.
- Accept → the browser adds an icon to your home screen / app launcher; the card retires.
- Decline → the card also retires (declining the OS dialog is treated as a dismissal — it won't nag again on this device).

#### 2. Dismiss X

- Hides the card permanently for this device / browser.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Title | "Install Rhozly on this device" |
| Subtitle | Value statement — faster load, full-screen, home-screen icon, offline for recent data |
| Install button | Triggers `deferredPrompt.prompt()` |
| Dismiss X | localStorage dismissal |

### Tier-by-tier experience

Identical for every tier.

### New user vs returning user

- **Brand new user on Chrome / Edge / Android**: card may appear once the browser fires the event (browser controls timing) — and only when it's the highest-priority eligible card in the slot.
- **Returning user already on Capacitor native**: card never shows.
- **iOS Safari**: `beforeinstallprompt` is not supported, so the card never shows; use Safari's Share → Add to Home Screen manually.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **"I don't see the install button."** Either the browser hasn't fired the event yet (visit Rhozly a few times), your browser doesn't support PWA install (all iOS browsers), or a higher-priority onboarding card is occupying the slot.
- **Declining the OS dialog expecting to be asked again.** A decline is recorded as a dismissal — install later via the browser's own install icon in the address bar / menu.
- **Confusing PWA install with the native app.** Different paths: PWA = browser shortcut with offline cache; native = Capacitor wrapper. Either works.

### Recommended workflows

- **Web users on Chrome / Edge / Android:** install when prompted. Better experience.
- **iOS Safari users:** Share → Add to Home Screen manually.
- **Native users (App Store / Play Store):** you'll never see the card — you've already got the native app.

### What to do if something looks wrong

- **Card disappeared mid-install:** the prompt is one-shot per capture; reload and use the browser's own install control if the card doesn't return.
- **Installed but the icon points to web:** that's expected. PWA is a shortcut to a service-worker-cached version of the web app.

---

## Related reference files

- [Home (Main Dashboard)](../02-dashboard/17-home-main.md) — the host surface
- [Getting Started Checklist](./06-getting-started-checklist.md) — priority 1 in the slot
- [Garden Quiz](./05-garden-quiz.md) — its prompt card is priority 2
- [Notification Opt-In](./07-notification-opt-in.md) — priority 3
- [Onboarding State (cross-cutting)](../99-cross-cutting/30-onboarding-state.md) — single-slot cascade + which store each card uses
- [PWA (cross-cutting)](../99-cross-cutting/22-pwa.md)
- [Capacitor (cross-cutting)](../99-cross-cutting/23-capacitor.md)

## Code references for ongoing maintenance

- `src/components/InstallPwaPrompt.tsx` — component
- `src/App.tsx` — slot gating (lowest priority in the cascade)
- `src/main.tsx` — `registerSW` + service worker setup
- `vite.config.ts` — PWA plugin config (icons, manifest)
