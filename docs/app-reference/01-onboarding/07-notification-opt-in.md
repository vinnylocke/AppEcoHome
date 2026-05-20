# Notification Opt-In Card

> A one-time card on the dashboard prompting users to grant browser notification permission, so Rhozly can send OS-level reminders for due tasks.

**Rendered on:** `/dashboard?view=dashboard`
**Source file:** `src/components/NotificationOptInCard.tsx`

---

## Quick Summary

Checks `Notification.permission`. If `"default"` (not yet asked) AND the user hasn't dismissed the card, renders a soft prompt with a single button: "Enable browser notifications". Tapping triggers `Notification.requestPermission()`. The card self-hides once permission is granted / denied / dismissed (any of the three terminal states).

---

## Role 1 — Technical Reference

### Component graph

```
NotificationOptInCard
├── Header with Bell icon
├── Title: "Get reminders when tasks are due"
├── Subtitle explaining what notifications enable
├── Permission state-specific button
│   ├── "default" → "Enable browser notifications" (triggers permission ask)
│   ├── "granted" → don't render
│   ├── "denied" → don't render (one-shot; can be re-enabled in browser settings)
│   └── "unsupported" → don't render
└── Dismiss link (LS-backed)
```

### Local state

| State | Type | Purpose |
|-------|------|---------|
| `permission` | `NotificationPermission \| "unsupported"` | Read from `Notification.permission` |
| `dismissed` | `boolean` | LS `rhozly_notif_opt_in_dismissed` |

### Data flow — read paths

- `Notification.permission` (browser API)
- `localStorage.getItem("rhozly_notif_opt_in_dismissed")`

### Data flow — write paths

#### Request permission

```ts
const result = await Notification.requestPermission();
setPermission(result);
```

Browser shows the native permission prompt. Result `"granted"` / `"denied"` is final per origin until the user changes it in browser settings.

#### Dismiss

```ts
localStorage.setItem("rhozly_notif_opt_in_dismissed", "1");
```

Card hides locally. Other devices the user is signed into still show the card.

### Edge functions invoked

None directly. After granting permission, the upstream `daily-batch-notifications` cron can now send pushes that surface as OS notifications.

### Cron / scheduled jobs that affect this surface

| Cron | Effect |
|------|--------|
| `daily-batch-notifications` | Daily — sends push notifications for due tasks. Needs `Notification.permission === "granted"` to surface. |

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
| Browser doesn't support Notifications | Card hides (`permission === "unsupported"`) |
| User taps Enable then dismisses the OS prompt | Permission stays `"default"`; card stays visible |

### Performance notes

- Pure render. No fetches.
- Permission check is synchronous.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this card

Notifications are the difference between "the app works when I open it" and "the app reminds me." Without browser permission, Rhozly can only nudge you when you're already inside the app — defeating the whole point of recurring reminders. The card asks once, politely, and gets out of the way.

### Every flow on this card

#### 1. Enable button

- Triggers the browser's native permission prompt.
- Grant → card disappears, the daily-batch-notifications cron starts surfacing OS pings for your tasks.
- Deny → card disappears. To re-enable later, you have to change browser settings manually (browsers don't allow re-prompting after deny).

#### 2. Dismiss link

- Hides the card without asking for permission. Permission stays `"default"`; if you later change your mind, the card will reappear on a different device or after clearing localStorage.

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Bell icon | Visual cue |
| Title | One-line value statement |
| Subtitle | Explains what categories trigger (watering / pruning / weather alerts) |
| Enable button | Triggers native prompt |
| Dismiss link | Soft dismiss |

### Tier-by-tier experience

Identical for every tier.

### New user vs returning user

- **Brand new user**: card shows on first dashboard visit.
- **Returning user (permission granted)**: never sees the card.
- **Returning user (dismissed without granting)**: sees card again if they switch devices / clear LS.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Denying once and never being able to re-enable easily.** Browsers treat "denied" as final for a domain. The only fix is the browser's site-settings UI.
- **Granting then never getting notifications.** Could be: (a) `daily-batch-notifications` cron hasn't run yet, (b) you have no due tasks, (c) the per-category toggle in Account Settings → Notifications is off.
- **Confusing browser permission with the app's notification preferences.** Browser permission is the gate; the in-app toggles in Account Settings filter what actually gets sent.

### Recommended workflows

- **Enable on first dashboard visit.** Worst case you mute later.
- **If you denied accidentally:** open browser site settings → reset Rhozly notifications → reload.

### What to do if something looks wrong

- **Notifications never arrive after granting:** check Account Settings → Notifications. The master toggle and per-category toggles must be on.
- **Card keeps reappearing:** the LS dismissal isn't sticking. Browser may be in private mode. Either grant or use a regular session.

---

## Related reference files

- [Dashboard Tab](../02-dashboard/01-dashboard-tab.md)
- [Notifications (Alerts) Tab](../06-account/02-notifications-tab.md)
- [Notifications (cross-cutting)](../99-cross-cutting/12-notifications.md)

## Code references for ongoing maintenance

- `src/components/NotificationOptInCard.tsx` — component
- `src/hooks/usePushNotifications.ts` — Firebase push token registration
- `supabase/functions/daily-batch-notifications/index.ts` — cron that sends them
