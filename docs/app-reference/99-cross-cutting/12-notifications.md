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

### Android notification small-icon (`ic_stat_rhozly`)

Android renders the status-bar / shade small icon from the **alpha channel only** — a full-colour icon becomes a solid white silhouette. The native project ships `ic_stat_rhozly` (a flat white **Rhozly-rose silhouette**, power symbol + petal lines as transparent negative space) at all five density buckets (`android/app/src/main/res/drawable-{mdpi…xxxhdpi}/ic_stat_rhozly.png`, generated from `public/logo_small_rhozly.png`), wired as the FCM default via two `<meta-data>` in `AndroidManifest.xml`:

```xml
<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_rhozly" />
<meta-data android:name="com.google.firebase.messaging.default_notification_color" android:resource="@color/rhozly_notification" />
```

`@color/rhozly_notification` = `#075737` (Rhozly green) tints the silhouette. **Without these, FCM falls back to the launcher icon and shows a solid white disc.** `push-webhook` sends no per-message `icon`/`color`, so the manifest defaults apply to every push. **Native-only + ships in the APK/AAB** — changing this needs a new Android build, not a web deploy. iOS is unaffected (shows the app icon). See [Capacitor](./23-capacitor.md).

### Push token registration

| Platform | Token source |
|----------|-------------|
| Web | Service worker → FCM via `firebase/messaging` |
| Native | `@capacitor/push-notifications` → FCM token |

Tokens stored in `user_devices`:

```ts
{ user_id, platform, token, created_at, last_used_at }
```

### Push delivery trigger — `"Trigger Push Notification"` (dashboard webhook)

Device push is fanned out by a **Supabase Database Webhook** named **`"Trigger Push Notification"`** — an `AFTER INSERT` trigger on `public.notifications` that calls the `push-webhook` edge function via `supabase_functions.http_request` (POST, `{ record: <row> }`, service_role Bearer, 5s timeout). `push-webhook` looks up the user's `user_devices` tokens and sends FCM (HIGH priority). So **any** `notifications` row insert (daily reminders, golden hour, weekly overview, automations) triggers a device push.

> ⚠️ **This webhook is dashboard-configured (Database → Webhooks), NOT in version control.** If it is deleted or disabled in the dashboard, every device push silently stops while the in-app bell keeps working — and nothing in the repo would reveal why. A 2026-06-19 attempt to codify it as a migration (`20260804000000`) was **reverted** (`20260805000000`) because it ran *alongside* the existing webhook and produced **duplicate** pushes. If you ever want it codified, first delete `"Trigger Push Notification"` in the dashboard, then add the trigger as a migration — never run both.

Debugging "no push" (verified 2026-06-19): confirm in order — (1) a `notifications` row was created (cron + filters OK), (2) `user_devices` has a token for the user, (3) the webhook fired (it can be invoked manually: `POST /functions/v1/push-webhook` with `{ record: { user_id, title, body, data, id } }`), (4) FCM/device delivery.

### `daily-batch-notifications` cron

Pseudocode (Wave 22.0044 — snooze + window + per-user mute aware):

```ts
// Fleet scans (home_members, homes, planner_preferences, user_profiles) are
// paged via _shared/pagedSelect.ts fetchAllPages — PostgREST silently
// truncates un-ranged selects at max_rows=1000, so user #1001 never got a
// digest.

// Pull tasks with the Wave 20+ snooze + window columns. Dueness is judged
// against each home's LOCAL calendar date (homes.timezone via localDateInTz
// in _shared/notificationTiming.ts), not UTC "today" — a UTC+10 user's
// 08:00 digest used to run at 22:00 UTC *yesterday* and exclude tasks due
// on their actual today.
pendingTasks = tasks where status='Pending' AND due_date <= maxLocalDate
            (selecting type, next_check_at, window_end_date, status)
prefsByUser = user_profiles.notification_prefs  // sparse jsonb

actionableTasks = pendingTasks.filter(t => isTaskActionableToday(t, localTodayForHome(t.home_id)))
//   - hides "Not yet → N days" snoozes (effective_due > today)
//   - hides harvest tasks past their window_end_date

for each user:
  if prefs.master === false: skip
  relevantTasks = actionableTasks.filter(t =>
    shouldNotify(prefs, categoryForTaskType(t.type))
  )
  // Untyped tasks (Fertilizing/Inspection/Maintenance/etc) always pass.
  // Watering / Harvesting / Pruning respect their per-category toggle.
  if (relevantTasks.length === 0) continue
  push notification with grouped payload

// Golden Hour pass is gated by prefs.goldenHour the same way.

// Before inserting: in-run dedupe by (user, kind) — a user in multiple
// homes deterministically gets ONE digest per day (first home wins) — then
// claim (user_id, kind, claim_date) in notification_claims. Only claim
// winners are inserted.
```

**Atomic send-once claims (`notification_claims`, migration `20260828000000`):** the per-user dedup used to be read-then-write on recent `notifications` rows — overlapping invocations (pg_net retry, a slow run overlapping the next 15-min tick) both saw "not sent" and double-pushed, and an ignored error on the dedup read failed *open* and re-notified everyone. Now each run claims `(user_id, kind, local claim_date)` rows via `ON CONFLICT DO NOTHING` (upsert with `ignoreDuplicates`) **before** inserting into `notifications`; whoever wins the insert sends, everyone else skips, and a claim error throws (fail closed — no duplicate spray). The rolling ~18 h recent-notifications read remains only as a cheap pre-filter — it is now paged and error-checked (fail closed). Claims older than 7 days are pruned each run. The table is service-role only (RLS enabled, no policies/grants).

**Delivery timing (2026-06-19):** `daily-batch-notifications` now runs **every 15 min** (not a single 08:00 UTC fire). The task digest is delivered at each user's chosen **local `reminderTime`** (`notification_prefs.reminderTime`, default `"08:00"` local — editable in the Notifications tab); golden hour fires **~45 min before each home's real sunset**; the **evening overdue nudge** (`overdue_evening`, 2026-07-08) fires at **20:00 local** when the user still has strictly-overdue actionable tasks — muted via the `overdueEvening` category, one per user per local day. Per-user dedup is a rolling ~18 h window. Pure timing helpers: `_shared/notificationTiming.ts` (`localMinutesOfDay`, `isReminderDue`, `isNearSunset`). See [Cron Jobs](./11-cron-jobs.md).

The shared helper `_shared/taskFilters.ts` is the SERVER-SIDE MIRROR of `src/lib/taskFilters.ts`. Both must agree — if the client says a task is hidden today, the server agrees and skips the push. Covered by `supabase/tests/notificationFilters.test.ts`.

### `analyse-weather` weather-alert notifications

`analyse-weather` now inserts **one `notifications` row per home member, with `user_id` set** — `push-webhook` drops any row without a `user_id`, so the old home-level rows (no `user_id`) were never delivered as push. Each member's `weatherAlerts` preference is honoured via `shouldNotify(prefs, "weatherAlerts")` (`_shared/notificationPrefs.ts`) before fan-out.

Cross-run dedup (per home, per day) is keyed on **`type:title`** — matching the intra-run `seen` set. It used to key on `type` alone, but every weather rule emits type `weather_alert`, so the first alert of the day suppressed every *different* same-day weather event (a frost alert would block a later wind alert).

### Notification categories (from [Notifications Tab](../06-account/02-notifications-tab.md))

- watering, harvesting, pruning, weatherAlerts (wired today)
- goldenHour (Wave 21.B — wired via the existing `daily-batch-notifications` cron with NOAA sunset calc per home)
- optimiseDigest (Wave 21.C — wired via the new `weekly-optimise-digest` cron; activity-aware headline + deep link to Optimise tab)
- weeklyOverview (Wave 21.A — wired via the new `generate-weekly-overviews` cron + `/weekly` route)
- overdueEvening (2026-07-08 — wired via the `overdue_evening` kind in `daily-batch-notifications`, 20:00 local)
- betaPrompts (wired)

### In-app toast

`react-hot-toast` — see [Toaster](../09-persistent-ui/10-toaster.md).

### Notification opt-in flow

[NotificationOptInCard](../01-onboarding/07-notification-opt-in.md) appears on dashboard for new users.

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `daily-batch-notifications` | Daily push delivery (Wave 21.B added Golden Hour wiring per home; Wave 22.0044 added snooze + window filtering + per-user category mute respect). Send-once via `notification_claims` (see section above); dueness per home-local date; fleet queries paged. |
| `analyse-weather` | Hourly weather-rule alerts → per-member `notifications` rows with `user_id` (push-deliverable), `weatherAlerts` pref honoured, `type:title` cross-run dedup — see section above |
| `weekly-digest` | Weekly summary EMAIL (Resend) — separate from in-app `weekly_overview`. Wave 22.0044: dedups recipients across multi-home members (one combined email by default; `digestStyle: per_home` opts back into the legacy fan-out). Vertical weather strip (mobile-readable) + clickable task rows linking to the Calendar agenda for that day. |
| `generate-weekly-overviews` | **Wave 21.A** — Sunday 06:00 UTC. Builds the jsonb payload on `weekly_overviews` per home + writes `weekly_overview` notification. Notify path claims `(user, 'weekly_overview', week-start)` in `notification_claims` before inserting — a duplicate cron fire no longer re-notifies every member. Manual `home_id` path requires the caller to be a signed-in member of that home (401/403 otherwise). |
| `weekly-optimise-digest` | **Wave 21.C** — Sunday 07:00 UTC. Activity-aware digest pointing at Optimise tab. Same `notification_claims` send-once claim (`(user, 'optimise_digest', past-week start)`) + same home-membership check on the manual `home_id` path. |
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
- `supabase/functions/_shared/notificationTiming.ts` — `localMinutesOfDay`, `localDateInTz`, `isReminderDue`, `isNearSunset`
- `supabase/functions/_shared/pagedSelect.ts` — `fetchAllPages` paged fleet scans
- `supabase/functions/push-webhook/index.ts`
- `supabase/migrations/*_user_devices.sql`
- `supabase/migrations/20260828000000_notification_claims.sql` — `notification_claims` send-once table
