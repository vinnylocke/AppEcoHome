# User Profile Dropdown

> The top-right menu opened from the user avatar in the persistent header. Contains links to Account Settings, Garden Preferences, Location/Home Management, an **Admin & Oversight** section (Audit Log plus the platform-admin tools — Guide Studio, Plant Library, AI Calls, Content Feedback), a **System** section (Sync now, Check for update), Contact Support, and Sign Out. Also surfaces a "What's New" pill when a new app version has shipped recently. (The no-op "Getting Started" item was removed in the dashboard-nav-tasks-tray Stage 4, 2026-07-21, B8. The 2026-07-23 IA reorg removed "Task Manager"/Routines from Management — it's already primary under the Planner "Routines" tab — and moved Sync now / Check for update out of Help into their own System section.)

**Trigger:** Tap the user avatar in the top-right of the header.
**Source file:** `src/components/UserProfileDropdown.tsx`

---

## Quick Summary

A multi-section dropdown:

- **Header** — name + email
- **Account** — Account Settings, Garden Preferences
- **Management** — Location Management, Members & Permissions (opens the all-homes settings page). Holds home-structure CRUD only — "Routines" (Task Manager) was removed 2026-07-23; it's already primary under the Planner "Routines" tab and a copy here just duplicated feature nav
- **Admin & Oversight** *(renders when `canViewAudit || isAdmin`)* — Audit Log (if `canViewAudit`, independent of `isAdmin`), then Guide Studio, Plant Library, AI Calls, Content Feedback (each if `isAdmin`) — 4 admin tools, read-only inspection surfaces
- **Help** — What's New (if recent version), Help & FAQ (deep-links to `/help` → `/guides?tab=help`), Contact Support, Credits & sources
- **System** *(renders when `onSyncNow` or `onCheckForUpdate` is passed)* — Sync now (offline-first push+pull), Check for update (forces a fresh SW/version probe)
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
    ├── Admin & Oversight section (conditional — canViewAudit || isAdmin)
    ├── Help section (What's New / Help & FAQ / Contact Support / Credits & sources)
    ├── System section (conditional — onSyncNow || onCheckForUpdate)
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
| `isAdmin` | `boolean?` | App.tsx | Gates the 4 platform-admin tools in Admin & Oversight (Guide Studio, Plant Library, AI Calls, Content Feedback) |
| `canViewAudit` | `boolean?` | App.tsx | Gates the Audit Log link in Admin & Oversight |
| `appVersion` | `string?` | App.tsx (release-notes.json) | What's New + footer label |
| `onVersionClick` | `() => void?` | App.tsx | Open release notes modal |
| `onCheckForUpdate` | `() => Promise<{ updateAvailable: boolean }>?` | App.tsx (`versionState.refresh`) | Powers the System section's "Check for update" — presence gates whether the System section renders |
| `onSyncNow` | `() => Promise<void>?` | App.tsx (`handleSyncNow`) | Powers the System section's "Sync now" (offline-first flush queue + refresh) — presence gates whether the System section renders |

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
| Garden Preferences | `/profile` |
| Location Management | `/management` |
| Members & Permissions | `/home-management` (the all-homes settings page) |
| Audit Log | `/audit` |
| Guide Studio | `/admin/guides` |
| Plant Library | `/admin/plant-library` |
| AI Calls | `/admin/ai-calls` |
| Content Feedback | `/admin/content-feedback` |

"Task Manager" (`/schedule`) was removed from Management in the 2026-07-23 IA reorg — Routines is already primary under the Planner tab.

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
| Admin & Oversight section (rendered at all) | `canViewAudit \|\| isAdmin` |
| Admin & Oversight → Audit Log | `canViewAudit` (a standalone boolean, independent of `isAdmin`) |
| Admin & Oversight → Guide Studio | `isAdmin` |
| Admin & Oversight → Plant Library | `isAdmin` |
| Admin & Oversight → AI Calls | `isAdmin` |
| Admin & Oversight → Content Feedback | `isAdmin` |
| System section (rendered at all) | `onSyncNow \|\| onCheckForUpdate` passed from App.tsx (both always passed today) |

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

#### 2. Account → Garden Preferences

- Opens `/profile` — re-take the quiz or swipe.

#### 3. Management

- Two shortcuts to home-structure screens (Location Management, Members & Permissions — the latter opens the all-homes settings page). Live here so they're not cluttering main navigation. "Task Manager" was removed 2026-07-23 — Routines is already primary under the Planner tab, so a copy here was a duplicate.

#### 4. Admin & Oversight (only if you have `canViewAudit` or `isAdmin`)

- Audit Log — the read-only activity + AI-usage timeline for this home. Visible to anyone with `canViewAudit`, even non-admin owners.
- Guide Studio for AI-authored guides. *(admin only)*
- Plant Library — the global plant-knowledge-base seed/verify dashboard. *(admin only)*
- AI Calls — every AI call across every home, with cost/token/status detail. *(admin only)*
- Content Feedback — the 👍/👎 + comment reports users have left on guides, docs, help answers and workflows (`/admin/content-feedback`). *(admin only)*

#### 5. What's New (pulse dot visible)

- Tap → opens release notes for the current version.
- Pulse dot only appears for 7 days after a new version first hits your device.
- Auto-dismisses once you've tapped it.

#### 6. Getting Started — REMOVED (Stage 4, 2026-07-21, B8)

- The item used to just navigate to `/dashboard` with no tour — a no-op sitting directly above the real Help & FAQ entry, so it was removed. Onboarding for new users is surfaced by the dashboard's Getting Started checklist and the Help & FAQ / What's New items that remain here.

#### 7. Contact Support

- Opens `ContactSupportModal` with your name + email pre-filled.

#### 8. System — Sync now / Check for update

- **Sync now** — pushes any offline-queued writes and pulls fresh data (profile + dashboard). Useful after a spell offline; shows a spinner and a "Synced with the server" toast.
- **Check for update** — forces a fresh DB-version fetch + service-worker update probe. If an update is pending, the app applies it (the same banner UpdateBanner would show); otherwise a "you're on the latest version" toast confirms.
- Moved out of Help into their own section 2026-07-23 — these are account/system actions, not help content.

#### 9. Sign Out

- Red link at the bottom. Calls `supabase.auth.signOut()`.

#### 10. App version (footer)

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
- **Admin & Oversight section missing despite being admin:** `isAdmin` flag in profile may be false. Verify in `user_profiles.is_admin`. (If only the admin tools are missing but Audit Log still shows, `canViewAudit` is true and `isAdmin` is false — that's correct, not a bug.)
- **Sign Out doesn't redirect:** auth state listener in App.tsx may be stuck. Hard refresh.

---

## Related reference files

- [Account Tab](./01-account-tab.md)
- [Members & Permissions Tab](../07-management/02-members-permissions.md)
- [Audit Log](../07-management/08-audit-log.md)
- [Admin Guide Generator](../07-management/09-admin-guide-generator.md)
- [Plant Library Admin](../07-management/10-plant-library-admin.md)
- [AI Calls Admin](../07-management/11-ai-calls-admin.md)
- [Content Feedback Admin](../07-management/12-content-feedback-admin.md)
- [Release Notes Modal](../08-modals-and-overlays/19-release-notes.md)
- [Contact Support Modal](../08-modals-and-overlays/18-contact-support.md)
- [Header / Top Bar](../09-persistent-ui/01-header.md)

## Code references for ongoing maintenance

- `src/components/UserProfileDropdown.tsx`
- `src/components/ContactSupportModal.tsx`
- `release-notes.json` — drives `appVersion`
- `src/App.tsx` — passes `isAdmin`, `canViewAudit` from profile
