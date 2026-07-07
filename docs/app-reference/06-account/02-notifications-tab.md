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
4. **Daily reminder time** (2026-06-19) — `<input type="time">` (`reminder-time-input`) writing `notification_prefs.reminderTime` (`"HH:MM"`, default `08:00`). `daily-batch-notifications` (now every 15 min) delivers the task digest at this **local** time instead of a fixed 08:00 UTC. See [Notifications](../99-cross-cutting/12-notifications.md).
5. **Weekly email layout** — when Weekly garden overview is on, choose between "one combined email" (default) and "one email per home" (legacy fan-out for users who explicitly want separate emails per home).
6. **Voice** (`voice-section`) — a **Read AI replies aloud** toggle + a **voice picker** (`voice-picker`, curated en-GB voices). Both write **straight to the server** (`user_profiles.voice_settings = { auto_read_assistant_replies, preferred_voice }`, keyed on `uid`, **merged** so neither field clobbers the other) with no `localStorage` mirror. See [Plant Doctor Chat](../05-tools/03-plant-doctor-chat.md).

Prefs are stored on `user_profiles.notification_prefs` (sparse jsonb) and mirrored to `localStorage` (key `rhozly_notif_prefs`) for instant first paint. The server reads the column when sending pushes / emails so the user's preferences apply on every device.

---

## Role 1 — Technical Reference

### Component graph

```
NotificationsTab
├── Browser permission section (Bell icon + status)
├── Master switch
├── Per-category section (greys out when master is off)
│   └── Toggle row × 7
├── Daily reminder time (reminder-time-input)
├── Weekly email layout (radios — combined / per-home)
└── VoiceSection (voice-section)
    ├── voice-auto-read-toggle → voice_settings.auto_read_assistant_replies
    └── voice-picker → voice_settings.preferred_voice
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

**Voice toggle (`VoiceSection` — separate from notification prefs):**

```ts
// Load + save both key on `uid` (the user_profiles PK). Filtering on
// `id`/`user_id` matches zero rows — the read resolves to "off" and the
// write silently no-ops. (That mismatch was the persistence bug fixed in 28.x.)
supabase.from("user_profiles").select("voice_settings").eq("uid", userId).maybeSingle();
// The toggle AND the voice picker share one writer that MERGES the patch into
// the existing jsonb (mergeVoiceSettings in src/lib/voiceSettings.ts) — a plain
// replace would wipe the other field.
supabase.from("user_profiles")
  .update({ voice_settings: { auto_read_assistant_replies, preferred_voice } })
  .eq("uid", userId);
```

The save inspects the returned `{ error }` and reverts the optimistic state (with a toast) on failure — `supabase-js` resolves rather than throws on RLS / DB errors, so an unchecked write looks like a success. The voice list is the curated, pre-verified `src/constants/voices.ts`; `tts-speak` caches per voice, so each voice synthesises independently.

### Edge functions invoked

None directly. Push delivery is handled by the `daily-batch-notifications` cron, which reads these prefs (via `_shared/notificationPrefs.ts`) to filter per-category delivery.

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

- Tick/untick. Persists immediately. Every category is wired to delivery.

#### 4. Read AI replies aloud (Voice)

- Toggle on to have Garden AI speak every chat reply automatically as it arrives. Prefer listening selectively? Leave it off and tap the 🔊 on any individual message instead.
- Pick the **voice** from the dropdown — premium (most natural), natural, or a lightweight (cheaper) option. Your choice applies to both auto-read and the per-message 🔊.
- These preferences are saved to your **account**, not just this device, so they follow you everywhere. If a save fails you'll see a toast and it reverts.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Browser permission pill | Status of OS-level notifications |
| Master switch | Global on/off |
| Category toggles | Per-type opt-in — all categories are wired to delivery |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Disabling notifications + complaining about missing reminders.** Re-enable master + the relevant category.
- **Granting browser permission but disabling master.** OS won't ping you. Both must be on.

### Recommended workflows

- **Setup:** grant permission once, leave master on, tweak categories to taste.
- **Quiet hours:** if you find Rhozly noisy, drop pruning/harvest reminders first — those are the most variable cadence.

### What to do if something looks wrong

- **No notifications at all:** master off, or browser denied, or you're on Capacitor native without push setup.
- **Reminder fired despite toggle off:** check the category filter in `daily-batch-notifications` (`_shared/notificationPrefs.ts`) against the toggle key.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Notification Opt-In Card](../01-onboarding/07-notification-opt-in.md)
- [Notifications (cross-cutting)](../99-cross-cutting/12-notifications.md)
- [Cron Jobs (cross-cutting)](../99-cross-cutting/11-cron-jobs.md)
- [Plant Doctor Chat (read-aloud consumer)](../05-tools/03-plant-doctor-chat.md)

## Code references for ongoing maintenance

- `src/components/GardenerProfile.tsx` — `NotificationsTab` (incl. `VoiceSection`)
- `supabase/functions/daily-batch-notifications/index.ts` — delivery
- `src/components/chat/ReadAloudButton.tsx` · `src/hooks/useTextToSpeech.ts` · `supabase/functions/tts-speak/index.ts` — read-aloud playback
- `src/constants/voices.ts` · `src/lib/voiceSettings.ts` (`mergeVoiceSettings`) — voice list + jsonb merge
- `supabase/migrations/20260708000000_voice_settings.sql` — `voice_settings` column
- `localStorage` key `rhozly_notif_prefs`
