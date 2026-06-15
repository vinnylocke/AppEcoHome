# Notifications (Alerts) Tab

> Per-category notification preferences plus a browser-permission status panel. Wave 22.0044 wired the toggles to the server — `user_profiles.notification_prefs` is the source of truth, with `localStorage` as a fast-paint fallback.

**Route:** Account Settings, `?tab=notifications` (label: "Alerts").
**Source file:** `src/components/GardenerProfile.tsx` — `NotificationsTab()` function (~lines 100–290)

---

## Quick Summary

Four stacked sections:

1. **Browser permission** — status pill (Granted / Denied / Default / Unsupported) + "Enable" button.
2. **Master switch** — turn everything off in one tap.
3. **Per-category toggles** — Watering, Harvest, Pruning, Weather alerts, Golden hour, Optimise digest, Weekly garden overview, Beta feedback prompts. **All wired** — both the in-app delivery (browser notifications) and the server-side push + email pipelines honour these.
4. **Weekly email layout** — when Weekly garden overview is on, choose between "one combined email" (default) and "one email per home" (legacy fan-out for users who explicitly want separate emails per home).

Prefs are stored on `user_profiles.notification_prefs` (sparse jsonb) and mirrored to `localStorage` (key `rhozly_notif_prefs`) for instant first paint. The server reads the column when sending pushes / emails so the user's preferences apply on every device.

---

## Role 1 — Technical Reference

### Component graph

```
NotificationsTab
├── Browser permission section (Bell icon + status)
├── Master switch
└── Per-category section (greys out when master is off)
    └── Toggle row × 7
```

### Local state

| State | Purpose |
|-------|---------|
| `prefs` | `NotificationPrefs` struct (localStorage) |
| `permission` | `NotificationPermission \| "unsupported"` |

### `NotificationPrefs` shape

```ts
{
  master:        boolean,
  watering:      boolean,
  harvesting:    boolean,
  pruning:       boolean,
  weatherAlerts: boolean,
  goldenHour:    boolean,
  optimiseDigest:boolean,
  betaPrompts:   boolean,
}
```

### Category metadata

| Key | Wired today? |
|-----|--------------|
| `watering` | yes |
| `harvesting` | yes |
| `pruning` | yes |
| `weatherAlerts` | yes |
| `goldenHour` | no |
| `optimiseDigest` | no |
| `betaPrompts` | yes |

### Data flow

- Read: `localStorage.getItem("rhozly_notif_prefs")` parsed JSON, merged with defaults.
- Write: `localStorage.setItem(...)` on every toggle change.
- Browser permission: `Notification.requestPermission()` and `Notification.permission`.

### Edge functions invoked

None directly. Push delivery is handled by `daily-batch-notifications` cron which (in the wired-up future) will read these prefs.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `daily-batch-notifications` | Reads task data, builds push payloads (currently doesn't honour per-category toggles yet) |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- Browser notification permission required for OS-level notifications. Without it, in-app toasts still appear.

### Error states

| State | Result |
|-------|--------|
| Browser doesn't support | "This browser doesn't support notifications" + in-app toasts only |
| Permission denied | Pill shows "Denied — enable in your browser settings" |

### Performance

- Pure localStorage; no fetches.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this tab

If you're tired of every notification or want to silence specific categories (water reminders are useful; golden hour pings are not), this is the dial. Master switch is the one-tap "leave me alone".

### Every flow on this tab

#### 1. Browser permission

- If pill says "Default": tap "Enable browser notifications" → OS prompt.
- If "Denied": you'll need to change it in your browser settings — Rhozly can't re-prompt.

#### 2. Master switch

- Turns every category off at once. Re-enable any time.

#### 3. Per-category toggles

- Tick/untick. Persists immediately.
- Some categories are marked "Coming soon" — they save your preference but don't actually filter delivery yet.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Browser permission pill | Status of OS-level notifications |
| Master switch | Global on/off |
| Category toggles | Per-type opt-in |
| Coming soon badge | Toggle persists but isn't wired to delivery yet |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Disabling notifications + complaining about missing reminders.** Re-enable master + the relevant category.
- **Granting browser permission but disabling master.** OS won't ping you. Both must be on.
- **Toggling "Coming soon" categories thinking they're live.** They'll save but not influence delivery yet.

### Recommended workflows

- **Setup:** grant permission once, leave master on, tweak categories to taste.
- **Quiet hours:** if you find Rhozly noisy, drop pruning/harvest reminders first — those are the most variable cadence.

### What to do if something looks wrong

- **No notifications at all:** master off, or browser denied, or you're on Capacitor native without push setup.
- **Reminder fired despite toggle off:** check `daily-batch-notifications` — wired filters may not include this category yet.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Notification Opt-In Card](../01-onboarding/07-notification-opt-in.md)
- [Notifications (cross-cutting)](../99-cross-cutting/12-notifications.md)
- [Cron Jobs (cross-cutting)](../99-cross-cutting/11-cron-jobs.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — `NotificationsTab` function
- `supabase/functions/daily-batch-notifications/index.ts` — delivery
- `localStorage` key `rhozly_notif_prefs`
