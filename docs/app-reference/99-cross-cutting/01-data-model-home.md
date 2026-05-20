# Data Model — Homes, Members, Permissions

> The root of the Rhozly data graph. Every other entity (location, plant, task, plan, layout, integration) cascades from a `homes` row. Users belong to homes via `home_members` with a role + per-action permission overrides.

---

## Quick Summary

```
homes
├── home_members (N) ─► auth.users
│   ├── role: "owner" | "editor" | "viewer"
│   └── permissions: jsonb (overrides ROLE_DEFAULTS)
├── home_climate (0..1) ─ frost dates (AI-cached, 6mo TTL) + rain-advice thresholds (user-editable)
└── (cascades to)
    ├── locations / areas
    ├── plants / inventory_items
    ├── plans / task_blueprints / tasks
    ├── garden_layouts / garden_shapes
    ├── ailments / plant_instance_ailments
    ├── community_guides (separate)
    └── integration_devices / automations
```

A single user can belong to multiple homes (allotment + house). The "active home" is tracked client-side (`localStorage.rhozly_active_home`) and verified on boot against `home_members`.

---

## Role 1 — Technical Reference

### `homes` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `name` | text | Display |
| `address` | text | Free text |
| `country` | text | ISO code or name |
| `timezone` | text | IANA TZ |
| `lat`, `lng` | float8 | Geocoded |
| `hardiness_zone` | text | USDA zone (auto from lat/lng) |
| `climate_zone` | text | Köppen (research-grade) |
| `north_offset_deg` | float8 | For sun analysis |
| `layout_id` | uuid? | Primary layout (Garden Layout) |
| `created_at`, `updated_at` | timestamptz | |

### `home_members` columns

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `home_id` | uuid | FK |
| `user_id` | uuid | FK to auth.users |
| `role` | text | owner / editor / viewer |
| `permissions` | jsonb | Overrides per-action |
| `joined_at` | timestamptz | |

### `Role` and `PermissionKey`

Defined in `src/lib/permissions.ts`:

```ts
type Role = "owner" | "editor" | "viewer";

type PermissionKey =
  | "shed.add" | "shed.edit" | "shed.delete"
  | "areas.create" | "areas.edit" | "areas.delete"
  | "locations.create" | "locations.edit" | "locations.delete"
  | "tasks.create_home" | "tasks.create_personal"
  | "tasks.edit_own" | "tasks.edit_any"
  | "tasks.delete_own" | "tasks.delete_any"
  | "tasks.view_home" | "tasks.view_members"
  | "ailments.add" | "ailments.edit" | "ailments.delete"
  | "plans.create" | "plans.edit" | "plans.delete"
  | "layout.edit"
  | "shopping.create_list" | "shopping.add_items"
  | "shopping.edit_items" | "shopping.delete_items" | "shopping.delete_list"
  | "integrations.manage" | "integrations.control" | "integrations.view"
  | "automations.manage" | "automations.view"
  | "audit.view_all";
```

### `ROLE_DEFAULTS`

Each role defaults to a permission set; per-member `permissions` jsonb merges overrides on top:

```ts
resolvePermissions(role, overrides) → Record<PermissionKey, boolean>
```

Consumed via `HomePermissionsContext` → `usePermissions().can("shed.add")`.

### RLS patterns

Every home-scoped table has an RLS policy roughly like:

```sql
USING (
  home_id IN (
    SELECT home_id FROM home_members WHERE user_id = auth.uid()
  )
)
```

Some tables (especially writes) further narrow via the `permissions` jsonb — see [RLS Patterns](./19-rls-patterns.md).

### `create_new_home` RPC

Atomic: creates `homes` + `home_members` (current user as owner) + initial locations / areas if applicable.

### Active home tracking

- `localStorage.rhozly_active_home` — last picked home id.
- Boot reconciliation in `src/App.tsx` verifies membership; falls back to first home if invalid.

---

## Role 2 — Expert Gardener's Guide

### Why understand the data model

Every plant, task, plan, photo, journal entry is scoped to one home. Once you understand that, multi-home behaviour stops being confusing — switching home re-roots everything.

### Implications for users

- Plants you add are *home-scoped*, not user-scoped. Family members in the same home see them.
- Tasks can be scoped to the home (everyone sees) or personal (only you).
- Permissions let an owner give a viewer just "see my plants" or grant editors "everything except delete the home".

### Recommended workflows

- **Family setup:** one home, owner + editor.
- **Allotment:** separate home, easy to switch.
- **Audit:** Members tab to verify roles + permissions match reality.

---

## Related reference files

- [Members & Permissions Tab](../07-management/02-members-permissions.md)
- [Multiple Homes Tab](../07-management/03-multiple-homes.md)
- [RLS Patterns](./19-rls-patterns.md)

## Code references for ongoing maintenance

- `src/lib/permissions.ts`
- `src/context/HomePermissionsContext.tsx`
- `supabase/migrations/*_homes.sql`, `*_home_members.sql`
- `supabase/migrations/*_create_new_home.sql`
