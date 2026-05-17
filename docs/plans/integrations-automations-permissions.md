# Plan — Integrations & Automations Permissions

## Problem / Goal

The permissions system already defines `integrations.view`, `integrations.control`, and `integrations.manage` in `permissions.ts` but they are **not enforced anywhere in the UI**. There are also no automation permissions at all. Home owners need to be able to control what other members can do with integrations and automations.

---

## Permission Model

### Integrations (three tiers, already in type — enforcement missing)

| Permission | What it allows |
|---|---|
| `integrations.manage` | Add, edit, and remove integrations (Connect Device wizard, DeviceSettingsModal, disconnect) |
| `integrations.control` | View integrations + turn individual devices on/off (valve toggle, run sensor poll) |
| `integrations.view` | View devices, readings, and history only — no controls |

These three are **mutually exclusive tiers** in practice: `manage` implies `control` which implies `view`. The UI should check the most specific permission that applies to each action.

### Automations (two new keys — missing entirely)

| Permission | What it allows |
|---|---|
| `automations.manage` | Create, edit, delete automations and trigger "Run now" |
| `automations.view` | View automations, their config, and run history — no create/edit/delete/run |

---

## Role Defaults

Current `member` defaults: `integrations.view: true`, no automations keys.  
Current `viewer` defaults: `integrations.view: true`, no automations keys.

New defaults:

| Role | integrations.manage | integrations.control | integrations.view | automations.manage | automations.view |
|---|---|---|---|---|---|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ |
| admin | ✅ | ✅ | ✅ | ✅ | ✅ |
| member | ❌ | ✅ | ✅ | ❌ | ✅ |
| viewer | ❌ | ❌ | ✅ | ❌ | ✅ |

Members can view and control devices by default (emergency shutoff use-case). Management (connecting/removing devices) must be granted explicitly. Viewers are read-only.

---

## Files to Change

### 1. `src/lib/permissions.ts`
- Add `'automations.view' | 'automations.manage'` to `PermissionKey`
- Add both to `ALL_OFF` (false)
- Update `ROLE_DEFAULTS` member and viewer to include `automations.view: true` and `automations.manage: false`

### 2. `src/components/HomeManagement.tsx`
Add two new groups to `PERMISSION_GROUPS` (between Shopping and Audit):

```ts
{ label: "Integrations", keys: [
  { key: "integrations.manage", label: "Add, edit & remove integrations" },
  { key: "integrations.control", label: "Control devices (turn on/off)" },
  { key: "integrations.view", label: "View integrations & history" },
]},
{ label: "Automations", keys: [
  { key: "automations.manage", label: "Add, edit & delete automations" },
  { key: "automations.view", label: "View automations & run history" },
]},
```

### 3. `src/components/integrations/IntegrationsPage.tsx`
- Import `usePermissions`
- Hide the "Connect Device" button when `!can('integrations.manage')`
- Pass `canManage={can('integrations.manage')}` and `canControl={can('integrations.control')}` as props to `AutomationsSection` (for the run-now button)
- Pass `canManage={can('integrations.manage')}` to `DeviceDetailModal` so it can gate settings/disconnect

### 4. `src/components/integrations/AutomationsSection.tsx`
- Accept `canManage: boolean` prop
- Gate the "New automation" button and the `AutomationsEmptyState` CTA on `canManage`
- Pass `canManage` and `canControl` through to each `AutomationCard`

### 5. `src/components/integrations/AutomationCard.tsx`
- Accept `canManage: boolean` and `canControl: boolean` props
- Hide the Settings (edit) and Trash (delete) icon buttons when `!canManage`
- Gate the "Run now" button behind `canManage || canControl` — running an automation is effectively controlling devices, so either permission allows it; pure `view` cannot

### 6. `src/components/integrations/DeviceDetailModal.tsx` (verify scope)
- Read file first; if it contains the valve on/off toggle and/or device settings/disconnect, gate those on `canControl` / `canManage` respectively via the passed prop

---

## What Is NOT Changing
- No DB migrations needed — the `permissions` JSONB column already stores arbitrary keys; new keys are handled automatically
- `integrations.view` already in `ROLE_DEFAULTS` for member/viewer — no regression
- Owner always bypasses permission checks (short-circuit in `resolvePermissions`)
- No changes to edge functions — permission enforcement is frontend-only for now (the edge functions already require auth + home membership; finer-grained server-side enforcement is a future concern)

---

## Risks / Notes
- `integrations.manage` implies device control (you can do everything a controller can). The UI gates each action on the most permissive check needed, so owners who grant `manage` don't also need to grant `control` — but we don't auto-set that; the owner simply sees both toggles independently.
- Need to verify `DeviceDetailModal` scope before editing — it's a referenced but unread file.
