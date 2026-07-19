# User Profile Dropdown

> The top-right menu opened from the user avatar in the persistent header. Contains links to Account Settings, Garden Quiz, Location/Home Management, Task Schedules, the Audit Log (admin), the Guide Studio (admin), Getting Started, Contact Support, and Sign Out. Also surfaces a "What's New" pill when a new app version has shipped recently.

**Trigger:** Tap the user avatar in the top-right of the header.
**Source file:** `src/components/UserProfileDropdown.tsx`

---

## Quick Summary

A multi-section dropdown:

- **Header** — name + email
- **Account** — Account Settings, Garden Quiz & Preferences
- **Management** — Location Management, Members & Permissions, Task Manager, Audit Log (if `canViewAudit`)
- **Admin** — Guide Studio, Content Feedback (`/admin/content-feedback`) (if `isAdmin`)
- **Help** — What's New (if recent version), Getting Started, Help & FAQ (deep-links to `/help` → `/guides?tab=help`), Contact Support, Image credits
- **Sign Out** — `supabase.auth.signOut()`
- **Footer** — app version label (tap to open release notes)

The avatar shows a yellow pulse dot when a "What's New" version is fresh (within 7 days of first sighting).

---

## Role 1 — Technical Reference

### Component graph

```
UserProfileDropdown
├── Trigger row — a real `<button aria-label="Account menu" aria-haspopup="menu" aria-expanded>` (avatar, name, tier; `data-testid="user-profile-trigger"`; converted from a div-onClick in the design overhaul per the a11y contract)
│   └── Pulse dot (if hasWhatsNew)
└── Dropdown (when open)
    ├── Header card (name + email)
    ├── Account section
    ├── Management section
    ├── Admin section (conditional)
    ├── Help section (What's New / Getting Started / Help & FAQ / Contact Support / Image credits)
    ├── Sign Out
    └── App version label
└── ContactSupportModal (when supportOpen)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `displayName` | `string \| null` | App.tsx | Shown in trigger + dropdown header |
| `firstName` | `string?` | App.tsx | Fallback for nameLabel |
| `email` | `string \| null` | App.tsx | Header + ContactSupportModal default |
| `subscriptionTier` | `SubscriptionTier?` | App.tsx | Tier label under name |
| `isAdmin` | `boolean?` | App.tsx | Gates Admin section |
| `canViewAudit` | `boolean?` | App.tsx | Gates Audit Log link |
| `appVersion` | `string?` | App.tsx (release-notes.json) | What's New + footer label |
| `onVersionClick` | `() => void?` | App.tsx | Open release notes modal |

### Local state

| State | Purpose |
|-------|---------|
| `open` | Dropdown visibility |
| `supportOpen` | ContactSupportModal visibility |
| `whatsNewVersion` | Tracks if pulse dot should show |

### What's New logic

Two localStorage keys:

| Key | Use |
|-----|-----|
| `rhozly_last_seen_version` | Set when user opens release notes |
| `rhozly_version_first_seen_at` | Timestamp when this version was first observed |

If `lastSeen === currentVersion` → hide pulse.
Else if first seen > 7 days ago → hide.
Else → show pulse + "What's New" button.

Dismissed by tapping the What's New button or app version label.

### Nav targets

| Item | Path |
|------|------|
| Account Settings | `/gardener` |
| Garden Quiz & Preferences | `/profile` |
| Location Management | `/management` |
| Members & Permissions | `/home-management` |
| Task Manager | `/schedule` |
| Audit Log | `/audit` |
| Guide Studio | `/admin/guides` |
| Content Feedback | `/admin/content-feedback` |
| Getting Started | `/dashboard` |

### Data flow

- No fetches at this level.
- Sign Out: `supabase.auth.signOut()` → app re-renders Auth screen via root guard.

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None at this dropdown — tier label is shown but every link is visible to every tier.

### Beta gating

None.

### Permissions

| Section | Gated by |
|---------|----------|
| Admin → Guide Studio | `isAdmin` |
| Admin → Content Feedback | `isAdmin` |
| Management → Audit Log | `canViewAudit` |

### Error states

| State | Result |
|-------|--------|
| LS unavailable | What's New silently hidden |

### Performance

- Pure render. One outside-click listener.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open the dropdown

This is the catch-all "settings + advanced" menu. Most casual users open it twice — once to find Account Settings, once to sign out. Power users use it as a shortcut hub for management screens.

### Every flow on this dropdown

#### 1. Account → Settings

- Opens the Account tab of GardenerProfile.

#### 2. Account → Garden Quiz & Preferences

- Opens `/profile` — re-take the quiz or swipe.

#### 3. Management

- Three (or four with audit) shortcuts to management screens. Live here so they're not cluttering main navigation.

#### 4. Admin (admin only)

- Guide Studio for AI-authored guides.
- Content Feedback — the 👍/👎 + comment reports users have left on guides, docs, help answers and workflows (`/admin/content-feedback`).

#### 5. What's New (pulse dot visible)

- Tap → opens release notes for the current version.
- Pulse dot only appears for 7 days after a new version first hits your device.
- Auto-dismisses once you've tapped it.

#### 6. Getting Started

- Returns you to the dashboard (which surfaces the onboarding checklist for new users).

#### 7. Contact Support

- Opens `ContactSupportModal` with your name + email pre-filled.

#### 8. Sign Out

- Red link at the bottom. Calls `supabase.auth.signOut()`.

#### 9. App version (footer)

- Tap → release notes (same as What's New).

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Avatar | Generic user icon (no profile photo support today) |
| Name + tier | Header summary |
| Email | In the dropdown |
| Pulse dot | Fresh release |
| App version | Build identifier |

### Tier-by-tier experience

Same layout. Tier label changes from Sprout/Botanist/Sage/Evergreen.

### Common mistakes / pitfalls

- **Treating Sign Out as Delete Account.** Sign Out is reversible; Delete is permanent.
- **Hunting for tier upgrade in the dropdown.** Tier switching lives inside Account Settings → Switch Tier.
- **Ignoring the pulse dot.** It's the only signal that release notes have changed.

### Recommended workflows

- **First visit:** check Account Settings → set name + tier.
- **Each release:** tap What's New to see what's changed.

### What to do if something looks wrong

- **Dropdown shows wrong name:** App.tsx `displayName` is stale. Refresh the page after editing name in Account.
- **Admin section missing despite being admin:** `isAdmin` flag in profile may be false. Verify in `user_profiles.is_admin`.
- **Sign Out doesn't redirect:** auth state listener in App.tsx may be stuck. Hard refresh.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Members & Permissions Tab](../07-management/02-members-permissions.md)
- [Audit Log](../07-management/08-audit-log.md)
- [Admin Guide Generator](../07-management/09-admin-guide-generator.md)
- [Release Notes Modal](../08-modals-and-overlays/19-release-notes.md)
- [Contact Support Modal](../08-modals-and-overlays/18-contact-support.md)
- [Header / Top Bar](../09-persistent-ui/01-header.md)

## Code references for ongoing maintenance

- `src/components/UserProfileDropdown.tsx`
- `src/components/ContactSupportModal.tsx`
- `release-notes.json` — drives `appVersion`
- `src/App.tsx` — passes `isAdmin`, `canViewAudit` from profile
