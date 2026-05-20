# Home Management — Overview

> The all-homes settings page. Lists every home you belong to with role chips, lets you switch active home, invite/leave/delete homes, and edit per-home settings via three sub-tabs: Settings (climate + identity), Insights (location stats), Members (people + permissions).

**Route:** `/home-management`
**Source file:** `src/components/HomeManagement.tsx` (~970 lines)

---

## Quick Summary

A vertical list of cards — one per home you belong to. Each card has a header (icon, name, role chip, switch button) and three sub-tabs:

- **Settings** — name, country, timezone, address, hardiness zone (auto + recalculate), climate zone.
- **Insights** — `HomeLocationInsights` rollup: location count, plant count, last activity etc.
- **Members** — members list with permission editor + Join-by-code + Leave/Delete buttons.

Plus footer actions: Join a home (by code), Create new home (calls `onAddNewHome` prop).

---

## Role 1 — Technical Reference

### Component graph

```
HomeManagement
├── For each home
│   └── Home card
│       ├── Header (icon, name, role, Switch button)
│       ├── Sub-tab bar (Settings / Insights / Members)
│       ├── Settings tab body
│       │   ├── Editable name / country / timezone / address
│       │   ├── Hardiness zone display + Recalculate button
│       │   └── Climate zone (read-only)
│       ├── Insights tab body
│       │   └── HomeLocationInsights
│       └── Members tab body
│           ├── Member rows (name, role, permissions config)
│           ├── Invite button + Join code copy
│           ├── Leave / Delete home actions
│           └── Permission editor (PERMISSION_GROUPS)
├── Join home form (by code)
├── Create new home button → onAddNewHome
└── ConfirmModal (per-action)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `currentHomeId` | `string` | App.tsx | To highlight the active home |
| `userId` | `string` | App.tsx | Scoping + member identification |
| `onSwitchHome` | `(homeId) => void` | App.tsx | Lift switch into App state |
| `onAddNewHome` | `() => void` | App.tsx | Trigger HomeSetup |
| `onHomeChanged` | `() => void` | App.tsx | Refresh after edits |

### Local state

| State | Purpose |
|-------|---------|
| `homes` | List of `HomeWithRole` rows incl. nested `members` |
| `loading` | Initial fetch |
| `copiedId` | "Copied!" feedback per home |
| `joinId`, `isJoining`, `joinError` | Join-by-code state |
| `modal` | Active ConfirmModal |
| `isProcessing` | Action in flight |
| `openConfigMemberId` | Inline permission editor open per member |
| `recalculatingZones` | Set of home IDs currently recalculating hardiness |
| `homeTabs` | Per-home sub-tab (`settings` / `insights` / `members`) |
| `editingForms` | Per-home edit form state |
| `savingHomeId` | Save in flight |

### `PERMISSION_GROUPS` — the master permission tree

10 groups covering: The Shed, Areas & Locations, Tasks, Ailments, Plans, Garden Layout, Shopping, Integrations, Automations, Audit & Usage. Each group has multiple permission keys (e.g. `shed.add`, `shed.edit`, `shed.delete`).

Default permissions per role come from `ROLE_DEFAULTS` in `src/lib/permissions.ts`.

### Data flow — read paths

```ts
// All homes I belong to + my role
supabase.from("home_members")
  .select("role, homes ( id, name, address, country, timezone, lat, lng, hardiness_zone, climate_zone )")
  .eq("user_id", userId);

// All members of those homes
supabase.from("home_members")
  .select("id, home_id, user_id, role, permissions")
  .in("home_id", homeIds);

// Profiles for member display names
supabase.from("user_profiles")
  .select("uid, display_name, email, can_view_audit")
  .in("uid", userIds);
```

### Data flow — write paths

| Action | DB |
|--------|----|
| Edit home settings | `homes.update({ name, address, country, timezone })` |
| Recalculate hardiness zone | `fetchUsdaZone(lat, lng)` → `homes.update({ hardiness_zone })` |
| Invite | Just shares the home `id` as the join code |
| Join by code | `home_members.insert({ home_id, user_id, role: "viewer" })` |
| Change role | `home_members.update({ role })` |
| Edit per-member permissions | `home_members.update({ permissions: {...} })` |
| Leave home | `home_members.delete().eq("home_id", id).eq("user_id", userId)` |
| Delete home | `homes.delete().eq("id", id)` (cascades) |

### Edge functions invoked

None directly. Hardiness zone lookup uses USGS endpoint client-side.

### Cron / scheduled jobs

None.

### Realtime channels

None — fetched on mount, refetched after writes.

### Tier gating

None.

### Beta gating

None.

### Permissions

Many self-referential — you need ownership to delete a home, owner/editor to invite, etc.

### Error states

| State | Result |
|-------|--------|
| Fetch fails | Loading spinner stays |
| Join with invalid code | Inline error |
| Save fails | Toast |
| Recalculate fails | Silent (button stays clickable) |

### Performance

- Three parallel queries on mount (homes, all members, profiles).
- Per-home edits are debounced.
- Permission editor lazy-renders when expanded.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why open this screen

When you live in more than one place (or share a garden with family), this is the screen that manages it. Most users have one home and rarely come here. Power users (e.g. someone managing an allotment + a backyard) use it constantly.

### Every flow on this screen

#### 1. Switch active home

- Tap "Switch" on any home card → `onSwitchHome` re-roots the entire app.

#### 2. Edit Settings tab

- Name, address, country, timezone — all editable inline.
- Hardiness zone — auto-fetches from USGS based on lat/lng. "Recalculate" if you've moved.

#### 3. Insights tab

- Read-only summary of the home's stats.

#### 4. Members tab

- See everyone who belongs.
- Tap a member → permission editor expands inline.
- Change role (Owner / Editor / Viewer) → permissions reset to role defaults.
- Tweak individual permissions to taste.

#### 5. Invite

- Copy the home's id (join code).
- Share via any channel (text, email).
- Invitee enters it in the Join field below.

#### 6. Join a home

- Paste join code → Join.
- Lands in `home_members` as a Viewer.

#### 7. Leave / Delete

- Leave = remove yourself from `home_members`; home survives.
- Delete = if you're the sole owner, the home + everything inside is deleted.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Role chip | Owner / Editor / Viewer |
| Hardiness zone | USDA zone (e.g. 8a) — drives plant suggestions |
| Climate zone | Köppen classification (e.g. "Cfb") |
| Join code | The home's UUID |
| Member permissions | Per-action gates |

### Tier-by-tier experience

Same for every tier. Multi-home + roles are universal.

### Common mistakes / pitfalls

- **Deleting the only home you co-own.** If others are members, you'll wipe them too. Use Leave instead.
- **Changing role to Viewer expecting permissions to stick.** Role change resets permissions to role defaults.
- **Hardiness zone wrong.** Recalculate after a move; check lat/lng.

### Recommended workflows

- **Family setup:** owner creates the home → invites partner as Editor → grandparents as Viewers.
- **Allotment:** create a second home for the allotment plot → switch when you're working there.
- **Audit:** check Members tab quarterly to remove anyone who no longer needs access.

### What to do if something looks wrong

- **Switch button does nothing:** `onSwitchHome` callback failed. Check App.tsx wiring.
- **Hardiness zone stays null:** USGS lookup failed silently. Retry — usually transient.
- **Can't see other members:** RLS issue — your role may not include `audit.view_all`.

---

## Related reference files

- [Members & Permissions Tab](./02-members-permissions.md)
- [Multiple Homes Tab](./03-multiple-homes.md)
- [Home Climate Settings Tab](./04-climate-settings.md)
- [Home Setup](../01-onboarding/03-home-setup.md)
- [Data Model — Homes (cross-cutting)](../99-cross-cutting/01-data-model-home.md)
- [RLS Patterns (cross-cutting)](../99-cross-cutting/19-rls-patterns.md)

## Code references for ongoing maintenance

- `src/components/HomeManagement.tsx` — entire screen
- `src/lib/permissions.ts` — Role + PermissionKey + ROLE_DEFAULTS
- `src/lib/hardinessZone.ts` — USGS lookup
- `src/components/HomeLocationInsights.tsx` — Insights tab body
- `src/constants/countries.ts` — country picker data
