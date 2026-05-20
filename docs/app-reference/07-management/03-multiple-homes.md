# Multiple Homes Tab

> The home picker + create/leave/join workflow. Rhozly supports multiple homes per user (e.g. main house + allotment + holiday home). Each home is a separate root with its own locations, plants, tasks, plans, and members.

**Trigger:** `/home-management` — the top of the page lists all homes; switching is per-card.
**Source files:**
- `src/components/HomeManagement.tsx` — header + Join + Create
- `src/App.tsx` — `currentHomeId` state + switch handler

---

## Quick Summary

Multiple homes are a first-class concept. The user can:

- See every home they belong to with their role.
- Switch active home (re-roots the entire app via `onSwitchHome`).
- Join a new home using a UUID join code.
- Create a new home (re-runs HomeSetup wizard).
- Leave a home (remove self from `home_members`).
- Delete a home (if sole owner — cascade deletes everything inside).

The active home is tracked in `localStorage` (`rhozly_active_home`) and reconciled with `home_members` on auth.

---

## Role 1 — Technical Reference

### Multi-home data model

```
auth.users (1) ─┬─ user_profiles (1)
                │
                └─ home_members (N) ──► homes (N)
                                          │
                                          ├─ locations
                                          ├─ areas
                                          ├─ plants / inventory_items
                                          ├─ tasks / task_blueprints
                                          ├─ plans
                                          ├─ garden_layouts / garden_shapes
                                          └─ everything else home-scoped
```

Every home-scoped row has a `home_id` column with RLS gating to membership.

### Active home tracking

- `localStorage["rhozly_active_home"]` — last picked home.
- On boot, App.tsx:
  1. Reads LS value.
  2. Verifies the user is still a member of that home.
  3. If not, falls back to the first home in `home_members`.
- `onSwitchHome(newHomeId)` writes the new LS value + bumps `currentHomeId` state.

### Data flow — write paths

| Action | DB |
|--------|----|
| Create | `create_new_home` RPC (creates `homes` + `home_members` with role=owner) |
| Join | `home_members.insert({ home_id, user_id, role: "viewer" })` |
| Leave | `home_members.delete().eq("home_id", id).eq("user_id", userId)` |
| Delete (sole owner) | `homes.delete().eq("id", id)` (cascades) |
| Switch | App-level state change only |

### Edge functions invoked

None — RPC and direct table operations.

### Cron / scheduled jobs

None.

### Realtime channels

None.

### Tier gating

None — multi-home is available to every tier.

### Beta gating

None.

### Permissions

| Action | Required |
|--------|----------|
| Switch | Membership |
| Join | Anyone with the code |
| Leave | Own membership |
| Delete | Sole owner |

### Error states

| State | Result |
|-------|--------|
| Join with invalid code | Inline error |
| Try to delete a home with co-owners | Toast |
| Try to leave the only home you own | Toast: "Delete first or transfer ownership" |

### Performance

- Switching home doesn't reload the page — App.tsx re-fetches everything based on new `currentHomeId`.
- Most components depend on `homeId` prop and refetch on change.

### Linked storage buckets

None at this level.

---

## Role 2 — Expert Gardener's Guide

### Why have multiple homes

Most users have one home. But:

- **Allotment-holders** track the allotment separately from the back garden.
- **Holiday-homes** keep a separate plant set per location.
- **Hobby growers** running multiple greenhouses or community plots can split each into its own home.
- **Family setups** sometimes split — one home for the shared garden, one for the dedicated kids' patch.

### Every flow on this tab

#### 1. View all homes

- `/home-management` lists every home you belong to with role + active state.

#### 2. Switch active home

- Tap "Switch" on any card → app re-roots.
- Sidebar, dashboard, every page refreshes against the new home.

#### 3. Create a new home

- "Create new home" → re-runs the HomeSetup wizard (postcode, country, timezone).
- Once created, you're auto-switched to it.

#### 4. Join by code

- Someone shares a join code with you (UUID).
- Paste in the Join field → land as a Viewer.
- Owner can promote you to Editor / Owner.

#### 5. Leave

- Card → kebab → Leave → confirm.
- You're removed from `home_members`; home stays for others.

#### 6. Delete (sole owner)

- Card → kebab → Delete → confirm.
- Wipes the home and everything inside. Cannot be undone.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Active chip | Currently active home |
| Role chip | Your role in this home |
| Member count | How many people total |
| Last activity | When something was last changed |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Adding plants while on the wrong home.** Check the active home chip before adding.
- **Co-owning with a partner.** If you both leave, the home becomes orphaned with no owner. Plan transitions carefully.
- **Switching mid-action.** Some pages may not handle a mid-flight home switch gracefully — finish what you're doing first.

### Recommended workflows

- **Hobby grower:** one home per plot. Use sidebar Switch as you walk between them.
- **Allotment + house:** separate homes; share allotment with the committee.
- **Family:** single home with multiple members and roles.

### What to do if something looks wrong

- **Plants missing after switch:** check `home_members.role` — if you're a Viewer, you see the same plants but can't write.
- **Active home reverts on reload:** localStorage may be cleared. Re-switch.
- **Can't leave the only home you own:** delete or transfer ownership first.

---

## Related reference files

- [Home Management — Overview](./01-home-management-overview.md)
- [Members & Permissions](./02-members-permissions.md)
- [Home Setup](../01-onboarding/03-home-setup.md)
- [Data Model — Homes (cross-cutting)](../99-cross-cutting/01-data-model-home.md)

## Code references for ongoing maintenance

- `src/components/HomeManagement.tsx`
- `src/App.tsx` — `currentHomeId` + switch logic
- `localStorage` key `rhozly_active_home`
- `supabase/migrations/*_create_new_home.sql` — RPC
