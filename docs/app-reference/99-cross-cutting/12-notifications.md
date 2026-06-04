# Notifications — Browser, Push, In-App

> Three notification channels: in-app toasts (`react-hot-toast`), browser-level `Notification` API for OS-style alerts, and Firebase push for native mobile.

---

## Quick Summary

```
in-app toast            ← react-hot-toast, see [Toaster](../09-persistent-ui/10-toaster.md)
browser notification    ← Notification API, gated by browser permission
push notification       ← Firebase Cloud Messaging via Capacitor on native
                        ← Service worker on web (web push)
```

`daily-batch-notifications` cron builds payloads per user; delivery channel chosen based on what's enabled.

---

## Role 1 — Technical Reference

### Permission states

- `Notification.permission`: `"default"` | `"granted"` | `"denied"`.
- iOS Safari requires installed PWA + user gesture to request.
- Capacitor native: requested via Firebase plugin on app start.

### Push token registration

| Platform | Token source |
|----------|-------------|
| Web | Service worker → FCM via `firebase/messaging` |
| Native | `@capacitor/push-notifications` → FCM token |

Tokens stored in `user_devices`:

```ts
{ user_id, platform, token, created_at, last_active_at }
```

### `daily-batch-notifications` cron

Pseudocode:

```ts
for each user:
  due_tasks = fetch today's pending tasks
  weather_alerts = fetch active alerts
  pattern_insights = fetch fresh user_insights
  if (any) push notification with grouped payload
```

### Notification categories (from [Notifications Tab](../06-account/02-notifications-tab.md))

- watering, harvesting, pruning, weatherAlerts (wired today)
- goldenHour (Wave 21.B — wired via the existing `daily-batch-notifications` cron with NOAA sunset calc per home)
- optimiseDigest (Wave 21.C — wired via the new `weekly-optimise-digest` cron; activity-aware headline + deep link to Optimise tab)
- weeklyOverview (Wave 21.A — wired via the new `generate-weekly-overviews` cron + `/weekly` route)
- betaPrompts (wired)

### In-app toast

`react-hot-toast` — see [Toaster](../09-persistent-ui/10-toaster.md).

### Notification opt-in flow

[NotificationOptInCard](../01-onboarding/07-notification-opt-in.md) appears on dashboard for new users.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `daily-batch-notifications` | Daily push delivery (Wave 21.B added Golden Hour wiring per home) |
| `weekly-digest` | Weekly summary EMAIL (Resend) — separate from in-app `weekly_overview` |
| `generate-weekly-overviews` | **Wave 21.A** — Sunday 06:00 UTC. Builds the jsonb payload on `weekly_overviews` per home + writes `weekly_overview` notification |
| `weekly-optimise-digest` | **Wave 21.C** — Sunday 07:00 UTC. Activity-aware digest pointing at Optimise tab |
| `fetch-pollen-daily` | **Wave 21.E** — daily 02:00 UTC. Pulls Open-Meteo pollen data into `pollen_snapshots` |
| `push-webhook` | External-source push triggers |

### Realtime channels

Not used for notifications today.

---

## Role 2 — Expert Gardener's Guide

### Why three channels

- **Toasts** — instant in-session feedback.
- **Browser notifications** — out-of-session reminders when the browser is open.
- **Push (native)** — out-of-session reminders even when the app is closed.

### Implications

- Grant browser permission on first visit for the best experience.
- Native users (Capacitor) get the most reliable delivery.

---

## Related reference files

- [Notifications Tab](../06-account/02-notifications-tab.md)
- [Notification Opt-In Card](../01-onboarding/07-notification-opt-in.md)
- [Toaster](../09-persistent-ui/10-toaster.md)

## Code references for ongoing maintenance

- `src/hooks/usePushNotifications.ts`
- `supabase/functions/daily-batch-notifications/index.ts`
- `supabase/functions/push-webhook/index.ts`
- `supabase/migrations/*_user_devices.sql`
