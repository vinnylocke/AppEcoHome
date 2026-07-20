# Members & Permissions Tab

> The members sub-tab inside Home Management. Lists every user who belongs to this home, lets the owner/editor change roles, edit per-action permissions, kick members, and copy the join code.

**Trigger:** Sub-tab inside a home card on `/home-management`.
**Source files:**
- `src/components/HomeManagement.tsx` — members tab block + permission editor
- `src/lib/permissions.ts` — role/permission registry + `resolvePermissions()`

---

## Quick Summary

Per home, a list of members with role chip + display name + email. Tap a member → permission editor expands inline, organised by 10 functional groups (Shed, Areas & Locations, Tasks, Ailments, Plans, Garden Layout, Shopping, Integrations, Automations, Audit & Usage). Each permission is a checkbox. Change a role → permissions reset to that role's defaults from `ROLE_DEFAULTS`.

**Invite by email (Sprint 4b, 2026-06-15):** owners see an "Invite by email" form at the bottom of the Members tab. Enter an email + pick a role (editor / viewer) → the [`create-home-invite`](../../../supabase/functions/create-home-invite/index.ts) edge function inserts a row in `home_invite_tokens` and emails the invitee via Resend. The email links to `/join/<token>`, which is handled by [`JoinHomeViaToken`](../../../src/components/JoinHomeViaToken.tsx) and redeemed by [`redeem-home-invite`](../../../supabase/functions/redeem-home-invite/index.ts). Tokens are single-use, time-limited (7 days), and pinned to the invitee email — the redemption path requires the signed-in user's auth email to match (case-insensitive). **Role vocabulary bridge:** invites speak the invite-facing vocabulary (`owner` / `editor` / `viewer`), but the `home_members_role_check` constraint allows `owner` / `admin` / `member` / `viewer` — so `redeem-home-invite` maps `editor` → `member` when inserting the `home_members` row (inserting `editor` verbatim violated the constraint and the invitee could never join). The mismatch is bridged at redemption, not removed. The legacy "Join Home" UUID-paste card stays available below the home list for backwards compatibility.

---

## Role 1 — Technical Reference

### Roles

| Role | Default capabilities |
|------|----------------------|
| `owner` | All permissions, including deleting the home |
| `editor` | Add/edit most things; can't delete home or remove owner |
| `viewer` | Read-only across the app |

### `PermissionKey` enumeration

Defined in `src/lib/permissions.ts`. Examples:

- `shed.add`, `shed.edit`, `shed.delete`
- `areas.create`, `areas.edit`, `areas.delete`
- `locations.create`, `locations.edit`, `locations.delete`
- `tasks.create_home`, `tasks.create_personal`, `tasks.edit_own`, `tasks.edit_any`, `tasks.delete_own`, `tasks.delete_any`, `tasks.view_home`, `tasks.view_members`
- `ailments.add`, `ailments.edit`, `ailments.delete`
- `plans.create`, `plans.edit`, `plans.delete`
- `layout.edit`
- `shopping.create_list`, `shopping.add_items`, `shopping.edit_items`, `shopping.delete_items`, `shopping.delete_list`
- `integrations.manage`, `integrations.control`, `integrations.view`
- `automations.manage`, `automations.view`
- `audit.view_all`

### `resolvePermissions(role, overrides)` (lib)

```ts
function resolvePermissions(role, overrides): Record<PermissionKey, boolean> {
  // Returns ROLE_DEFAULTS[role] merged with per-member overrides.
}
```

Used everywhere via `usePermissions().can("shed.add")` etc.

### Where the `locations.*` keys are enforced (home grid inline manage, Stage 4b)

Since the stats+locations redesign Stage 4b (2026-07-20) the **home garden grid** is a second consumer of the `locations.create` / `locations.edit` / `locations.delete` keys, alongside LocationManager (`/management`). The grid's inline affordances gate on exactly these keys **client-side**:

| Affordance | Key |
|------------|-----|
| `home-add-location-btn` → the Add-a-location sheet | `locations.create` |
| Card ⋮ → Rename / Switch inside-outside | `locations.edit` |
| Card ⋮ → Delete | `locations.delete` |
| The card ⋮ menu itself | `locations.edit` OR `locations.delete` (hidden entirely otherwise) |

By the standard role matrix this means **owner/admin** get everything, a **member** can add + rename + re-flag but **cannot delete**, and a **viewer** sees **no add button and no ⋮ menu at all** on the grid. **Critically, this is a client-only guard.** RLS on `locations` gates only home *membership*, not these permission keys (only `tasks.view_members` + `audit.view_all` are RLS-enforced today — see [RLS Patterns § current enforcement reality](../99-cross-cutting/19-rls-patterns.md)), so `usePermissions().can(...)` in `LocationManageMenu` / `GardenOverviewGrid` is **the only thing standing between a viewer/member and a spatial write**. Change these keys and both the grid and LocationManager must move together. See [Home (Main Dashboard) → Inline location management](../02-dashboard/17-home-main.md).

### Data flow — read paths

Inherits from parent home fetch (see [01-home-management-overview.md](./01-home-management-overview.md#data-flow--read-paths)).

### Data flow — write paths

| Action | DB |
|--------|----|
| Change role | `home_members.update({ role: newRole, permissions: ROLE_DEFAULTS[newRole] })` |
| Toggle individual permission | `home_members.update({ permissions: {...prev, [key]: value} })` |
| Remove member | `home_members.delete().eq("id", memberId)` |

### Edge functions invoked

None.

### Cron / scheduled jobs

None.

### Realtime channels

None — refetches after each write.

### Tier gating

None.

### Beta gating

None.

### Permissions

- Owner: full edit on every member except themselves' role.
- Editor: limited (typically can edit viewer permissions only).
- Viewer: read-only.

### Error states

| State | Result |
|-------|--------|
| Role change fails | Toast |
| Permission update fails | Toast; UI reverts |
| Remove fails | Toast |

### Performance

- Permission editor lazy-renders on expand.
- Profile names resolved client-side via `profileMap`.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use this tab

Sharing a Rhozly home with family / housemates / fellow allotment-holders. Each person has a role; you can fine-tune what they can do beyond the role defaults.

### Every flow on this tab

#### 1. Invite

- Copy the join code (UUID).
- Share it with the person.
- They paste it in the "Join a home" field at the bottom of `/home-management`.

#### 2. Change role

- Tap the role chip on a member → pick Owner / Editor / Viewer.
- Permissions snap to that role's defaults.

#### 3. Edit specific permissions

- Tap "Settings" on a member → permission editor opens.
- Tick / untick individual permissions to override role defaults.

#### 4. Remove

- Trash icon → confirm. Removes from `home_members`. Their personal data (own tasks, journals) stays attached to their user account but is no longer visible to this home.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Display name | What they set in Account Settings |
| Email | Their login email |
| Role chip | Owner / Editor / Viewer |
| Permission checkboxes | What they can do |
| canViewAudit | Whether they see the Audit Log link |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Granting Owner to too many people.** Owner = can delete the home + everything in it. Keep it tight.
- **Resetting permissions by re-picking the same role.** Choosing a role overwrites permissions even if it's the same role. Read the confirmation copy.
- **Forgetting to remove ex-housemates.** Stale members can still write to your home. Audit periodically.

### Recommended workflows

- **Family setup:** owner → partner as editor → kids/grandparents as viewers.
- **Periodic audit:** quarterly, review the members list, remove anyone no longer involved.

### What to do if something looks wrong

- **Member's permissions don't match what you set:** RLS denied the update. Check your own role.
- **Member can still edit despite being a viewer:** check their per-action overrides — overrides win.

---

## Related reference files

- [Home Management — Overview](./01-home-management-overview.md)
- [Audit Log](./08-audit-log.md)
- [RLS Patterns (cross-cutting)](../99-cross-cutting/19-rls-patterns.md)
- [Data Model — Homes (cross-cutting)](../99-cross-cutting/01-data-model-home.md)

## Code references for ongoing maintenance

- `src/components/HomeManagement.tsx` — members tab + permission editor
- `src/lib/permissions.ts` — Role / PermissionKey / ROLE_DEFAULTS / resolvePermissions
- `src/context/HomePermissionsContext.tsx` — `usePermissions` hook
- `supabase/migrations/*_home_members.sql` — schema + RLS
