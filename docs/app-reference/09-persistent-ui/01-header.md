# Header / Top Bar

> The sticky branded header at the top of every authenticated screen. Contains the logo, nav toggle, home dropdown, global search, quick-add menu, user profile dropdown, offline/queue badges, and (for beta users) the feedback banner immediately below.

**Source file:** `src/App.tsx` (inline in the root layout, ~lines 860-905)

---

## Quick Summary

Branded green bar — the brand book's immersive header, `bg-brand-gradient` (deep green → primary, 135°) with a `border-white/10` hairline and green-tinted `shadow-raised` — with: hamburger (mobile) / collapse toggle (desktop), Rhozly logo + name, HomeDropdown, OfflineBadge, QueuedActionsBadge, GlobalSearch, GlobalQuickAdd, UserProfileDropdown. Sticky at top of viewport. BetaFeedbackBanner stacks immediately below for beta users.

---

## Role 1 — Technical Reference

### Component graph

```
header (sticky)
├── Hamburger / collapse toggle button
├── Logo
├── "Rhozly" wordmark (hidden on small screens)
├── HomeDropdown
├── OfflineBadge
├── QueuedActionsBadge
├── GlobalSearch (Cmd+K trigger)
├── GlobalQuickAdd (+ menu)
└── UserProfileDropdown (avatar)

(below header)
└── BetaFeedbackBanner (when isBeta)
```

### Data flow — read paths

Reads from App.tsx state: `profile`, `session`, `appVersion`, breakpoint flags.

### Edge functions invoked

None directly (sub-components do their own).

### Cron / scheduled jobs

None.

### Realtime channels

None directly. Sub-components (OfflineBadge, HomeDropdown) may.

### Tier gating

None at the header — sub-components handle their own.

### Beta gating

BetaFeedbackBanner below header is `is_beta` gated.

### Permissions

UserProfileDropdown gates Admin section by `is_admin`; Audit link by `can_view_audit`.

### Error states

| State | Result |
|-------|--------|
| Profile load fails | Header still renders; sub-components fall back |

### Performance

- Sticky positioning; minimal repaints.

---

## Role 2 — Expert Gardener's Guide

### Why use the header

Universal navigation chrome:

- **Hamburger** — open/close the sidebar (especially mobile).
- **Home dropdown** — switch between homes (multi-home users).
- **Offline/Queue badges** — at-a-glance connection + pending work indicators.
- **Search (Cmd+K)** — universal lookup.
- **Quick Add (+)** — fastest path to create anything.
- **Avatar** — account + settings.

### Every flow

#### 1. Switch home

- Tap the home name → dropdown → pick.

#### 2. Global search

- Cmd/Ctrl+K or tap the search icon.

#### 3. Quick add

- Tap + → menu of "Add task / Add plant / etc."

#### 4. Profile menu

- Tap avatar → settings, support, sign out.

### Tier-by-tier experience

Same layout. Tier badge under avatar name reflects current tier.

### Common mistakes / pitfalls

- **Trying to multi-tap the home name to refresh.** Just opens the dropdown — switch from there.

### Recommended workflows

- Keyboard shortcut Cmd+K is the fastest way to navigate.

### What to do if something looks wrong

- **Header missing:** auth state broken — refresh.
- **Logo broken:** asset path issue.

---

## Related reference files

- [Sidebar Navigation](./02-sidebar.md)
- [Global Search](../08-modals-and-overlays/22-global-search.md)
- [Global Quick Add](../08-modals-and-overlays/23-global-quick-add.md)
- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md)
- [Offline Badge](./03-offline-badge.md)
- [Queued Actions Badge](./04-queued-actions-badge.md)
- [Beta Feedback Banner](../08-modals-and-overlays/25-beta-feedback-banner.md)

## Code references for ongoing maintenance

- `src/App.tsx` — header block
- `src/components/HomeDropdown.tsx`
