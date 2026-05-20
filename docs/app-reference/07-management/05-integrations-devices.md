# Integrations — Devices Tab

> The Devices sub-tab inside Integrations. Lists every connected hardware device (soil sensor, smart valve) for this home with status pills and quick actions (rename, change location/area, disconnect, view readings/history).

**Route:** `/integrations` (default tab = `devices`)
**Source files:**
- `src/components/integrations/IntegrationsPage.tsx` — page + tab router
- `src/components/integrations/DeviceCard.tsx`
- `src/components/integrations/DeviceDetailModal.tsx`
- `src/components/integrations/DeviceSettingsModal.tsx`
- `src/components/integrations/ConnectDeviceWizard.tsx`
- `src/components/integrations/SoilReadingsPanel.tsx`
- `src/components/integrations/ValveControlPanel.tsx`

---

## Quick Summary

Hardware integration hub. Two device types currently:

- **Soil sensors** — read pH, moisture, temperature, lux per area.
- **Smart valves** — controlled remotely; can be wired into automations.

Adding a device opens the Connect Device Wizard which walks through provider selection (eWeLink today; more planned), OAuth, device discovery, and per-device area binding. Once connected, each device's readings stream into `soil_readings` (sensors) or `valve_events` (valves). The Detail modal shows live state + history chart.

---

## Role 1 — Technical Reference

### Component graph

```
IntegrationsPage
├── Tab bar (Devices / Automations)
├── Devices tab
│   ├── eWeLink OAuth callback handler (useEffect on mount)
│   ├── Connect Device button
│   ├── Loading / error state
│   ├── Device grid → DeviceCard
│   └── Empty state
├── Automations tab → AutomationsSection
├── ConnectDeviceWizard (modal)
├── DeviceDetailModal (modal)
│   ├── ValveControlPanel (if water_valve)
│   ├── SoilReadingsPanel (if soil_sensor)
│   ├── ValveTimeline (if water_valve)
│   └── HistoryChart
└── DeviceSettingsModal (rename, area binding, delete)
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | App.tsx | Scope |

### `Device` shape

```ts
{
  id, integration_id, home_id, location_id, area_id,
  external_device_id, name,
  device_type: "soil_sensor" | "water_valve",
  provider: "ewelink" | ...,
  metadata: Record<string, unknown>,
  is_active: boolean,
  last_seen_at: string | null,
}
```

### Providers supported today

- **eWeLink** (via OAuth) — Sonoff smart valves, supported sensors.

### Data flow — read paths

```ts
supabase.from("integration_devices").select("*").eq("home_id", homeId).order("name");
supabase.from("soil_readings").select("*").eq("device_id", id).order("recorded_at", desc).limit(100);
supabase.from("valve_events").select("*").eq("device_id", id).order("created_at", desc).limit(50);
```

### Data flow — write paths

| Action | DB / Function |
|--------|---------------|
| Connect new device | `integrations-ewelink-connect` edge function (OAuth + discovery) |
| Rename / re-bind to location/area | `integration_devices.update({...})` |
| Disconnect | `integration_devices.delete().eq("id", id)` |
| Open/close valve | `integrations-ewelink-control` edge function |

### OAuth callback (eWeLink)

`IntegrationsPage` watches `window.location.search` on mount for `?code=...&state=...&region=...`. If present:

1. Reads stored state (`localStorage.ewelink_oauth_state`).
2. Verifies state match.
3. Calls `integrations-ewelink-connect` with `{ action: "exchange_code", homeId, code, region }`.
4. Function exchanges code for token, lists devices, returns array.
5. UI advances to "Pick devices to import" step.

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `integrations-ewelink-connect` | OAuth exchange + device discovery |
| `integrations-ewelink-control` | Open/close valve, refresh readings |
| `integrations-ewelink-sync` | Periodic sync from provider |

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `integrations-ewelink-sync` | Periodic refresh of device states + readings |

### Realtime channels

- `useHomeRealtime("integration_devices")` may be wired (varies by implementation).

### Tier gating

None.

### Beta gating

Some integration providers may be beta-gated during rollout.

### Permissions

| Action | Permission |
|--------|-----------|
| View | `integrations.view` |
| Add / edit / delete | `integrations.manage` |
| Control (open/close valves) | `integrations.control` |

### Error states

| State | Result |
|-------|--------|
| OAuth state mismatch | Stored error in LS; UI shows retry |
| Provider unreachable | Toast + retry button |
| Device offline | `last_seen_at` stale → "Offline" pill on card |

### Performance

- Connect Wizard does multi-step OAuth on a popup or full redirect.
- DeviceCard renders lightweight; details lazy on tap.
- HistoryChart limits to last 100 readings.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why connect a device

Manual lux readings (Light Sensor) work but require you to walk around the garden. Smart soil sensors give continuous readings — moisture, temperature, sometimes pH — fed straight into your area's metrics. Smart valves let Rhozly water for you on a schedule or in response to a sensor reading.

### Every flow on this tab

#### 1. Connect a device

- "Connect Device" → wizard.
- Pick provider (eWeLink currently).
- OAuth — log into provider, grant access.
- Provider returns your devices → pick which ones to import.
- For each device, set name + area binding.
- Confirm → device appears on this tab.

#### 2. Tap a device card

- Opens DeviceDetailModal.
- Soil sensor: latest readings + history chart.
- Water valve: open/close control + recent events.

#### 3. Edit device settings

- Open Settings → rename, change area/location binding, delete.

#### 4. Disconnect

- Settings → Delete → confirms.
- Provider link survives; revoking OAuth must be done in the provider's app.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Device name | Free-text (defaults to provider name) |
| Type | Soil sensor or water valve |
| Area binding | Which area its readings/control apply to |
| Last seen | Recency of provider sync |
| Online/offline pill | Whether last sync was recent |

### Tier-by-tier experience

Same for every tier. Hardware costs money — most engaged users are AI-tier already.

### Common mistakes / pitfalls

- **Connecting without binding to an area.** Readings still arrive but aren't surfaced anywhere useful.
- **Renaming in Rhozly assuming it syncs to provider.** It doesn't — provider's name stays.
- **Forgetting OAuth tokens expire.** If the device goes offline, re-run Connect to refresh.
- **Multiple homes, one provider account.** Devices appear in the home you connected from; you can't share across homes today.

### Recommended workflows

- **Buy one sensor first.** Place in your most-uncertain area. Live data quickly shows whether your watering schedule matches reality.
- **Valve automation:** connect a valve → use Automations tab to wire it to a daily schedule or a moisture threshold.

### What to do if something looks wrong

- **OAuth state mismatch error:** retry; usually a stale localStorage value.
- **Device offline:** check the device's power and Wi-Fi. Re-run Connect to refresh tokens.
- **Readings stuck:** provider sync cron may have failed. Trigger a manual refresh from the Detail modal.

---

## Related reference files

- [Integrations — Automations Tab](./06-integrations-automations.md)
- [Integrations — Soil Readings](./07-integrations-readings.md)
- [Members & Permissions](./02-members-permissions.md) — `integrations.*` permissions
- [Data Model — Integrations (cross-cutting)](../99-cross-cutting/09-data-model-integrations.md)
- [Edge Functions Catalogue (cross-cutting)](../99-cross-cutting/10-edge-functions-catalogue.md)

## Code references for ongoing maintenance

- `src/components/integrations/IntegrationsPage.tsx`
- `src/components/integrations/DeviceCard.tsx`
- `src/components/integrations/DeviceDetailModal.tsx`
- `src/components/integrations/DeviceSettingsModal.tsx`
- `src/components/integrations/ConnectDeviceWizard.tsx`
- `src/components/integrations/SoilReadingsPanel.tsx`
- `src/components/integrations/ValveControlPanel.tsx`
- `src/components/integrations/ValveTimeline.tsx`
- `src/components/integrations/HistoryChart.tsx`
- `supabase/functions/integrations-ewelink-connect/index.ts`
- `supabase/functions/integrations-ewelink-control/index.ts`
- `supabase/functions/integrations-ewelink-sync/index.ts`
