# Notification Opt-In Card

> A one-time card on the dashboard prompting users to grant browser notification permission, so Rhozly can send OS-level reminders for due tasks.

**Rendered on:** the merged home tab of `/dashboard` (the Dashboard sub-tab), inside the **single-slot onboarding system at priority 3** — it renders only when the Getting Started Checklist is gone (dismissed or complete) AND the Garden Quiz prompt is ineligible (quiz done, snoozed, or dismissed).
**Source file:** `src/components/NotificationOptInCard.tsx`

---

## Quick Summary

Checks `Notification.permission`. If `"default"` (not yet asked) AND the user hasn't dismissed the card, renders a soft prompt with an "Enable notifications" button and a "Customise first" link into Account Settings. Tapping Enable triggers `Notification.requestPermission()` and — either way — writes the localStorage dismissal so the card never re-asks. Persistence is **localStorage only** (`rhozly_notif_optin_dismissed`); there is **no `onboarding_state` key** for this card.

**Styling (Phase 6e — new-user calm):** the card is a **calm, green-first surface** (`bg-rhozly-surface-low` + hairline border, a `rhozly-primary/10` bell tile, on-surface text, one `rhozly-primary` pill + a quiet ghost link). It deliberately no longer uses the old full-bleed sky-blue gradient, which fought the brand and dominated a new user's first screen — "green leads, colour follows".

---

## Role 1 — Technical Reference

### Slot gating (App.tsx)

App.tsx only mounts the card when the higher-priority slot cards are out of the way:

```ts
{!checklistSlotVisible && !quizPromptEligible && notifOptInEligible && (
  <NotificationOptInCard />
)}
```

`notifOptInEligible` (computed in App.tsx) = `"Notification" in window` AND `Notification.permission === "default"` AND `localStorage.rhozly_notif_optin_dismissed !== "true"`. The component's own mount effect re-checks the same conditions.

### Component graph

```
NotificationOptInCard (testid notification-optin-card)
├── Bell icon
├── Title: "Want a daily watering reminder?"
├── Subtitle — tasks due today, weather alerts (frost · heat · wind), golden-hour reminders
├── "Enable notifications" button (testid notification-optin-enable) → permission ask
├── "Customise first" button → navigate("/gardener?tab=notifications")
└── Dismiss X (testid notification-optin-dismiss, LS-backed)
```

The component starts `hidden = true` and only reveals itself in a mount effect when: `Notification` is supported, `Notification.permission === "default"`, and the LS dismissal is not set. Granted / denied / unsupported → never renders.

### Local state

| State | Type | Purpose |
|-------|------|---------|
| `hidden` | `boolean` | Defaults true; flipped false only when all show-conditions pass |

### Data flow — read paths

- `Notification.permission` (browser API)
- `localStorage.getItem("rhozly_notif_optin_dismissed")` — the **only** persistence key; value `"true"`

### Data flow — write paths

#### Enable

```ts
const result = await Notification.requestPermission();
if (result === "granted") {
  new Notification("Rhozly notifications enabled 🌿", { ... }); // sample notification
}
// finally — regardless of outcome:
localStorage.setItem("rhozly_notif_optin_dismissed", "true");
setHidden(true);
```

The browser shows the native permission prompt; on grant a sample notification fires so the user sees what to expect. The LS dismissal is written in `finally`, so tapping Enable hides the card permanently on this device whatever the outcome. Result `"granted"` / `"denied"` is final per origin until the user changes it in browser settings.

#### Dismiss

```ts
localStorage.setItem("rhozly_notif_optin_dismissed", "true");
```

Card hides locally. **No `onboarding_state` write** — other devices the user is signed into still show the card (localStorage is per-device).

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
| Browser doesn't support Notifications | Card never reveals itself |
| `requestPermission()` throws | Swallowed; LS dismissal still written, card hides, in-app toasts continue |
| User taps Enable then dismisses the OS prompt | Permission stays `"default"`, but the LS dismissal was written — card won't re-ask on this device |

### Performance notes

- Pure render. No fetches.
- Permission check is synchronous, in a single mount effect.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why see this card

Notifications are the difference between "the app works when I open it" and "the app reminds me." Without browser permission, Rhozly can only nudge you when you're already inside the app — defeating the whole point of recurring reminders. The card asks once, politely, and gets out of the way. You'll only ever see it after you've finished (or dismissed) the Getting Started Checklist and the Garden Quiz reminder — the dashboard shows one onboarding card at a time.

### Every flow on this card

#### 1. Enable button

- Triggers the browser's native permission prompt.
- Grant → a sample "Rhozly notifications enabled" ping fires so you know it worked, and the daily-batch-notifications cron starts surfacing OS pings for your tasks.
- Deny → to re-enable later, you have to change browser settings manually (browsers don't allow re-prompting after deny).
- Either way, the card retires itself on this device.

#### 2. Customise first

- Jumps straight to Account Settings → Notifications so you can set per-category preferences before (or instead of) granting.

#### 3. Dismiss X

- Hides the card without asking for permission. Permission stays `"default"`; the card may reappear on a different device or after clearing localStorage (the dismissal is per-device).

### Information on display — what every field means

| Element | Meaning |
|---------|---------|
| Bell icon | Visual cue |
| Title | One-line value statement ("Want a daily watering reminder?") |
| Subtitle | Explains what triggers — tasks due today, weather alerts (frost / heat / wind), golden-hour reminders |
| Enable button | Triggers native prompt |
| Customise first | Opens notification preferences |
| Dismiss X | Soft dismiss (this device only) |

### Tier-by-tier experience

Identical for every tier.

### New user vs returning user

- **Brand new user**: won't see the card immediately — the Getting Started Checklist and quiz prompt come first in the slot.
- **Returning user (permission granted)**: never sees the card.
- **Returning user (dismissed without granting)**: sees the card again if they switch devices / clear localStorage.

### Beta user experience

No difference.

### Common mistakes / pitfalls

- **Denying once and never being able to re-enable easily.** Browsers treat "denied" as final for a domain. The only fix is the browser's site-settings UI.
- **Granting then never getting notifications.** Could be: (a) `daily-batch-notifications` cron hasn't run yet, (b) you have no due tasks, (c) the per-category toggle in Account Settings → Notifications is off.
- **Confusing browser permission with the app's notification preferences.** Browser permission is the gate; the in-app toggles in Account Settings filter what actually gets sent.
- **Wondering where the card went.** If the checklist or quiz prompt is on screen, this card is deliberately waiting its turn.

### Recommended workflows

- **Enable when offered.** Worst case you mute later.
- **If you denied accidentally:** open browser site settings → reset Rhozly notifications → reload.

### What to do if something looks wrong

- **Notifications never arrive after granting:** check Account Settings → Notifications. The master toggle and per-category toggles must be on.
- **Card keeps reappearing:** the localStorage dismissal isn't sticking. Browser may be in private mode. Either grant or use a regular session.

---

## Related reference files

- [Home (Main Dashboard)](../02-dashboard/17-home-main.md) — the host surface
- [Getting Started Checklist](./06-getting-started-checklist.md) — priority 1 in the slot
- [Garden Quiz](./05-garden-quiz.md) — its prompt card is priority 2
- [PWA Install Prompt](./08-pwa-install.md) — priority 4
- [Onboarding State (cross-cutting)](../99-cross-cutting/30-onboarding-state.md) — single-slot cascade + which store each card uses
- [Notifications (Alerts) Tab](../06-account/02-notifications-tab.md)
- [Notifications (cross-cutting)](../99-cross-cutting/12-notifications.md)

## Code references for ongoing maintenance

- `src/components/NotificationOptInCard.tsx` — component
- `src/App.tsx` — slot gating (`notifOptInEligible`)
- `src/hooks/usePushNotifications.ts` — Firebase push token registration
- `supabase/functions/daily-batch-notifications/index.ts` — cron that sends them
