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
- `src/components/integrations/SoilBehaviourPanel.tsx` — derived soil indicators (2026-07-22)
- `src/components/integrations/ValveControlPanel.tsx`
- `src/components/integrations/BatteryPip.tsx` — battery health chip on cards + Detail header
- `src/components/integrations/DeviceBatteryPanel.tsx` — sparkline + days-remaining + reset
- `src/components/integrations/WebhookDetailsPanel.tsx` — URL + reveal + regenerate for custom_http
- `src/components/integrations/TestWebhookModal.tsx` — Single + Stream payload simulator

---

## Quick Summary

Hardware integration hub. Two device types currently:

- **Soil sensors** — read moisture, temperature, electrical conductivity per area.
- **Smart valves** — controlled remotely; can be wired into automations.

**Supported providers (2026-06-16):**

| Provider | Devices | EC unit | Connect path |
|---|---|---|---|
| **Ecowitt** | WH51 (soil moisture + temp + raw ADC EC), WH52 (multi-parameter: moisture + temp + calibrated µS/cm EC) | WH51 = raw ADC integer (relative only); WH52 = calibrated µS/cm | Legacy direct edge fn (`integrations-ecowitt-connect`) |
| **eWeLink** | Sonoff / generic Zigbee water valves with on/off control | n/a (valve) | Legacy direct edge fn (`integrations-ewelink-connect`) |
| **Custom (HTTP webhook)** — *added 2026-06-16 Custom integrations Phase 3* | Any DIY device or third-party hub that can POST JSON. Soil sensors emit `{schema_version, device_external_id, soil_moisture, soil_temp?, soil_ec?, ec_source?, recorded_at?}`; valves emit `{schema_version, device_external_id, state: "on"\|"off", recorded_at?}`. | Whatever the device reports — `ec_source` in the payload picks `calibrated_us_cm` vs `raw_adc`. | **`ProviderAdapter` contract** via `integrations-adapter-connect` dispatcher. The first formal adapter — `_shared/integrations/adapters/customHttp.ts`. Webhook auth via path-token, query-token, or `X-Rhozly-Token` header — all three accepted. |

**Live chips + EC graph (Batch C, 2026-06-18):** `DeviceCard` now shows the latest reading inline as chips — moisture % / soil temp / EC (calibrated `µS/cm` vs raw) for soil sensors, Open/Closed for valves — sourced from the `latest_device_readings(home_id)` RPC (a `Map<device_id, latest>` loaded once per page) and formatted by the pure `src/lib/integrations/readingChips.ts`. The detail-modal `HistoryChart` gained a third **EC** series (the readings RPC already returned `soil_ec`), shown only for sensors that report it, with the unit from the device's `ec_source`. The Devices grid + Automations list also gained a **search box** (`SearchInput` + pure `src/lib/textFilter.ts`) once there are more than 4 items.

Adding a device opens the Connect Device Wizard which walks through provider selection, OAuth (eWeLink) or API key entry (Ecowitt), device discovery, and per-device area binding. The Connect wizard auto-detects WH51 vs WH52 at discovery time by inspecting the gateway's real-time payload — channels with calibrated EC or a non-zero soil temperature reading are classified WH52; the rest stay WH51. Once connected, each device's readings stream into `soil_readings` (sensors, with `ec_source` discriminator) or `valve_events` (valves). The Detail modal shows live state + history chart.

**Battery health (2026-06-16):** every supported provider — Ecowitt soil sensors (extracted from `soilbatt{N}`, auto-detects 0-5 level vs 0-100 percent scales), eWeLink Zigbee valves (`params.battery` / `battPercentage` / `batteryPercentage`), and Custom HTTP devices (explicit `battery_percent` in the payload) — lights up an inline pip on `DeviceCard` and in the `DeviceDetailModal` header. Green ≥50, amber 20–49, red <20. The pip is hidden when no battery has ever been reported (most providers don't have a battery signal; the device might even be mains-powered). Detail modal also mounts `DeviceBatteryPanel` — a 30-day sparkline plus an "estimated days remaining" line from a linear regression on the last 14 days of battery readings. The estimate is hidden until there are ≥10 data points + a negative slope, so freshly-connected devices don't show garbage like "9,999 days remaining". A **"Battery changed?"** button under the panel writes a row to `device_battery_resets` so the regression window resets after a manual swap (otherwise the swap looks like a recharge in the trendline).

**Test Webhook simulator (2026-06-16):** `DeviceDetailModal` mounts a "Send a test reading" button for `custom_http` devices (gated by `integrations.manage`). Opens `TestWebhookModal` with two tabs:
- **Single** — pre-filled payload editor, Send → POSTs directly from the browser to the public webhook router via `X-Rhozly-Token`, response panel re-queries `device_readings` for the newest row so you can see your test become real data.
- **Stream** — configurable interval (min 30s) + duration (max 1h, capped at 120 requests). Optional random-walk drift on numeric fields (so history charts wiggle realistically) + optional battery decay (~1% per 5 readings). Pure client-side `setInterval` — closing the tab stops it. Live log shows the most recent 20 requests with status + drifted values.

**Webhook details panel (2026-06-16):** `DeviceSettingsModal` mounts `WebhookDetailsPanel` for `custom_http` integrations. Shows the webhook URL (masked by default, reveal-toggle), copy-to-clipboard, regenerate button (confirmation modal — old secret stops working immediately), and a collapsible "Sample payload" block matching the device family. Solves the "I closed the wizard and lost my URL" problem.

**Area linkage flow (2026-06-16):** every device has an optional `area_id` field. After discovery, open Device Settings on the device card and pick a Location + Area. The linkage drives two surfaces: (1) Location Manager's area-edit modal mounts an [`AreaSensorsPanel`](../03-garden-hub/03-location-manager.md) showing latest readings + history for every sensor linked to the area; (2) future automations (Phase 3) will filter sensor + valve pickers to the chosen area. Multiple sensors can be linked to the same area — the panel shows each individually plus an averaged tile.

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
│   ├── ValveControlPanel (if water_valve — provider-aware: eWeLink live control,
│   │     custom_http control via integrations-adapter-control, or read-only state)
│   ├── SoilReadingsPanel (if soil_sensor)
│   ├── SoilBehaviourPanel (if soil_sensor — 2026-07-22; derived indicators from
│   │     soil_moisture_profiles: drainage class + drydown %/day, mean day peak /
│   │     overnight low / diurnal swing, EC stability + trend with a plain-language
│   │     "likely why". Gated FeatureGate ai_insights (same as the area
│   │     MoistureBehaviourCard); hides when no profile row exists. Refreshed by
│   │     the daily compute-soil-profiles cron, so the indicators update over
│   │     time. testids: soil-behaviour-panel/-drainage/-temp/-ec)
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
  provider: "ewelink" | "ecowitt" | "custom_http",
  metadata: Record<string, unknown>,
  is_active: boolean,
  last_seen_at: string | null,
  battery_percent: number | null,        // 0-100, most recent reported (added 2026-06-16)
  battery_reported_at: string | null,    // when battery_percent was last updated
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
| Connect new device | `integrations-ewelink-connect` (eWeLink) / `integrations-adapter-connect` (custom_http) |
| Rename / re-bind to location/area | `integration_devices.update({...})` |
| Disconnect | `integration_devices.delete().eq("id", id)` |
| Open/close valve (eWeLink) | `integrations-ewelink-control` |
| Open/close valve (custom_http + others) | `integrations-adapter-control` → `adapter.control()` |

**Valve control is provider-aware (2026-06-17).** `ValveControlPanel` picks the path via
`valveControlMode(provider, controllable)` (`src/lib/valveControl.ts`): eWeLink valves use the live
eWeLink state/control functions; **custom_http** valves with a configured control URL POST a templated
request through `integrations-adapter-control`; a custom valve with no control URL (or a user without
`integrations.control`) shows reported state read-only. Custom valve control is set up in the Connect
wizard (control URL + override-able method/headers/body with `{{variable}}` placeholders + a live
preview); the endpoint must be publicly reachable over HTTPS. See
[Integration Contract → Valve control](../99-cross-cutting/37-integration-contract.md).

**Valve state reads target the valve itself (2026-07-16 fix).** `integrations-ewelink-state`
resolves its query id with the same `resolveTargetDeviceId` rule as the control payload
(`_shared/integrations/ewelinkDevice.ts`): sub-device valves (e.g. Sonoff SWV behind a Zigbee
bridge) are queried by their **own** sub-device id, not the parent bridge. Previously the state
query hit the bridge, whose params carry no `switch`, and the parser silently defaulted to
"off" — so the control panel showed **Off while the valve was running**, and (because Turn Off
was gated on `state === "on"`) the only way to close it was turning it on again first. Three
invariants now hold: a payload with **no** switch param parses as `"unknown"` (never a phantom
"off"); an unknown state is **never persisted** to `device_readings`; and the panel's Turn Off
button is disabled only when the valve is confidently **off** — an unknown-state valve can always
be force-closed.

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
