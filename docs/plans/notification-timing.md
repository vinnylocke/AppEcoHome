# Notification timing — golden hour near sunset + user-chosen reminder time

**Goal:** fix the two genuinely mis-timed notifications (analysis confirmed the rest are fine):
1. **Golden hour** fires in the 08:00 UTC batch as a morning heads-up — change it to fire **~45 min before each home's actual sunset**.
2. **Daily task digest** fires at a fixed 08:00 UTC — let each user pick a **reminder time** (delivered in their home's local timezone).

## App-reference consulted
- [99-cross-cutting/12-notifications.md](../app-reference/99-cross-cutting/12-notifications.md) — channels, `daily-batch-notifications`, push trigger.
- [06-account/02-notifications-tab.md](../app-reference/06-account/02-notifications-tab.md) — the prefs UI (`GardenerProfile.tsx`).
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `daily-batch-notifications` cadence.

## Design

### Cron cadence
Reschedule the `daily-8am-batch` cron (`0 8 * * *`) → **`*/15 * * * *`** (rename `daily-notifications-15min`). The function self-gates per user/home, so most ticks are cheap no-ops.

### `daily-batch-notifications/index.ts`
Restructure so the expensive task query only runs when someone is actually due:
1. Fetch homes (+ tz, lat/lng), members, prefs **first** (cheap).
2. **Digest gate (per member):** fire when the home's **local** time has reached the member's `reminderTime` (default `"08:00"` local) **and** they haven't had a `daily_batch` in the last ~18 h (rolling dedup — robust across timezones / arbitrary reminder times, replaces the UTC-midnight guard). Only fetch + group tasks for homes that have at least one due member.
3. **Golden-hour gate (per member):** fire when `now ∈ [sunset − 75 min, sunset − 30 min]` (≈45 min lead; 45-min window so a 15-min cron reliably lands one tick) **and** no `golden_hour` in the last ~18 h **and** `goldenHour` pref on. (Replaces the current "skip if sunset is within 2 h" logic, which is what made it a morning notification.)

Pure timing helpers in **`_shared/notificationTiming.ts`** (unit-tested): `isReminderDue(localMinutes, reminderTime)`, `isNearSunset(now, sunset, leadMinMin, leadMaxMin)`. The local-minutes-of-day calc reuses `localParts`-style `Intl` logic.

### Prefs
- **`_shared/notificationPrefs.ts`** + **`GardenerProfile.tsx`** `NotificationPrefs`: add `reminderTime?: string` (`"HH:MM"`, default `"08:00"`).
- **UI:** a time picker in the Notifications tab — *"Daily reminder time — when we send your task summary (your local time)."* `data-testid="reminder-time-input"`. Writes through the existing `update()` → localStorage + `user_profiles.notification_prefs` sync.

### Dedup change (note)
Switching the once-per-day guard from "created today (UTC)" to "within the last ~18 h" is what makes arbitrary local reminder times + golden-hour-at-sunset work without UTC-midnight edge cases. ~18 h comfortably prevents a second same-day fire while allowing the next day's.

## Files
| File | Change |
|------|--------|
| `supabase/migrations/<ts>_notification_timing_cron.sql` | Reschedule daily cron → every 15 min. |
| `supabase/functions/daily-batch-notifications/index.ts` | Per-user reminder-time gate + golden-hour-near-sunset + lazy task fetch + rolling dedup. |
| `supabase/functions/_shared/notificationTiming.ts` (new, pure) | `isReminderDue`, `isNearSunset`, local-minutes helper. |
| `supabase/functions/_shared/notificationPrefs.ts` | `reminderTime?` field. |
| `src/components/GardenerProfile.tsx` | `reminderTime` in `NotificationPrefs` + time-picker UI. |

## Tests
- **Deno** `notificationTiming.test.ts`: `isReminderDue` (before/at/after, tz), `isNearSunset` (in/before/after window).
- **Playwright**: reminder-time input renders + persists in the Notifications tab.

## Risks / edge cases
- **Behaviour change:** existing users move from 08:00 **UTC** to 08:00 **local** default — a minor, generally-better shift (timezone-correct). Golden hour moves from morning to ~45 min pre-sunset (the intended fix).
- **Cron load:** 96 runs/day vs 1; mitigated by the cheap pre-gate (only due homes fetch tasks). Fine at current scale; a `next_reminder_at` index is the future optimisation if needed.
- **Multi-home users:** digest delivered per home in that home's timezone at the user's `reminderTime`; rolling 18 h dedup is per-user, so a multi-home user still gets one digest per ~day (first home that hits their time). Acceptable.

## App-reference to update
- `12-notifications.md` (delivery timing + reminderTime pref), `02-notifications-tab.md` (the new picker), `11-cron-jobs.md` (cadence change).
