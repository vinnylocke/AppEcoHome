# Header / Top Bar

> The sticky branded header at the top of every authenticated screen. Contains the logo, home dropdown, global search, user profile dropdown, offline/queue badges, and — **on desktop only (Phase 6b)** — the sidebar-collapse hamburger and the quick-add "+" menu. The beta feedback banner sits immediately below for beta users.

**Source file:** `src/App.tsx` (inline in the root layout, header block ~lines 1449-1506)

---

## Quick Summary

Branded green bar — the brand book's immersive header, `bg-brand-gradient` (deep green → primary, 135°) with a `border-white/10` hairline and green-tinted `shadow-raised`. **Phase 6b de-crowded the mobile header**: the hamburger and the GlobalQuickAdd "+" are now **desktop-only**, because on phones the [Deck](../09-persistent-ui/11-bottom-tab-bar.md)'s centre **Capture** FAB carries create and its **More** slot carries overflow. What's left on every viewport: Rhozly logo + name, HomeDropdown, QueuedActionsBadge, GlobalSearch. Desktop additionally shows the sidebar-collapse hamburger (leading) and GlobalQuickAdd (trailing). UserProfileDropdown (avatar) is always present. Sticky at top of viewport. BetaFeedbackBanner stacks immediately below for beta users.

---

## Role 1 — Technical Reference

### Component graph

```
header (sticky)
├── Hamburger / collapse toggle button   (hidden md:flex — DESKTOP ONLY)
├── Logo
├── "Rhozly" wordmark (hidden on small screens)
├── HomeDropdown
├── OfflineBadge
├── QueuedActionsBadge
├── GlobalSearch (Cmd+K trigger)
├── GlobalQuickAdd (+ menu)              (wrapped in hidden md:block — DESKTOP ONLY)
└── UserProfileDropdown (avatar)

(below header)
└── BetaFeedbackBanner (when isBeta)
```

### Hamburger — desktop-only sidebar collapse (Phase 6b)

The leading `Menu` button is now `hidden md:flex` — **it only exists on desktop**, where its single job is to collapse/expand the [sidebar](./02-sidebar.md) rail:

| Viewport | Rendered? | `onClick` | `aria-label` |
|---|---|---|---|
| Desktop (`md`+) | Yes | `setIsNavCollapsed(!isNavCollapsed)` — collapse/expand the sidebar rail (w-72 ↔ w-20) | `"Toggle navigation"` |
| Mobile (`< md`) | **No** — not rendered | — | — |

Phase 6a made the hamburger dual-purpose (desktop = collapse rail, mobile = open the Shelf). **Phase 6b removed the mobile branch entirely**: on phones the [Deck](../09-persistent-ui/11-bottom-tab-bar.md)'s **More** slot opens the **Shelf** (`MobileNavDrawer`) and its centre **Capture** FAB opens the [Capture sheet](../08-modals-and-overlays/41-capture-sheet.md), so the header sheds both the hamburger and the "+" and stays calm. In focus mode the header is hidden entirely; the floating `QuickAccessMenuButton` opens the same Shelf drawer.

### GlobalQuickAdd — desktop-only "+" (Phase 6b)

The GlobalQuickAdd "+" menu is wrapped in a `hidden md:block` span, so it appears **only on desktop**. On phones its role is folded into the Deck's Capture FAB → Capture sheet, which offers the same create verbs (add plant / add task / journal note / add task / garden walk) plus a Diagnose hero. The mobile header therefore carries only: logo, HomeDropdown, QueuedActionsBadge, GlobalSearch (icon), and the account avatar.

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

Universal navigation chrome. On a phone it's deliberately quiet — create and overflow moved down to the thumb-reachable [Deck](../09-persistent-ui/11-bottom-tab-bar.md) — so the header is just orientation + account:

- **Hamburger** *(desktop only)* — collapse/expand the sidebar rail. On phones this is gone; the Deck's **More** slot opens the **Shelf** instead (the phone's route to Journal, Integrations, Head Gardener, and Quick).
- **Home dropdown** — switch between homes (multi-home users).
- **Offline/Queue badges** — at-a-glance connection + pending work indicators.
- **Search (Cmd+K)** — universal lookup.
- **Quick Add (+)** *(desktop only)* — fastest path to create anything. On phones the Deck's centre **Capture** FAB carries this, with a Diagnose hero on top.
- **Avatar** — account + settings.

### Every flow

#### 1. Switch home

- Tap the home name → dropdown → pick.

#### 2. Global search

- Cmd/Ctrl+K or tap the search icon.

#### 3. Quick add *(desktop only)*

- Tap + → menu of "Add task / Add plant / etc." On a phone there's no "+" here — use the Deck's centre **Capture** FAB.

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
- [Bottom Tab Bar — "The Deck"](./11-bottom-tab-bar.md) — the phone nav that now carries create (Capture FAB) + overflow (More → Shelf)
- [Capture Sheet](../08-modals-and-overlays/41-capture-sheet.md) — the phone create/diagnose hub the desktop "+" folds into
- [Global Search](../08-modals-and-overlays/22-global-search.md)
- [Global Quick Add](../08-modals-and-overlays/23-global-quick-add.md) — the desktop-only "+" menu
- [User Profile Dropdown](../06-account/09-user-profile-dropdown.md)
- [Offline Badge](./03-offline-badge.md)
- [Queued Actions Badge](./04-queued-actions-badge.md)
- [Beta Feedback Banner](../08-modals-and-overlays/25-beta-feedback-banner.md)

## Code references for ongoing maintenance

- `src/App.tsx` — header block
- `src/components/HomeDropdown.tsx`
