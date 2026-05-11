# Integrations Feature — Build Plan

## Overview

A new **Integrations** tab (after Tools in the sidebar, route `/integrations`) lets users connect physical garden devices to Rhozly — starting with:

- **Ecowitt soil sensors** (soil temp, moisture, EC) via the Ecowitt v3 API + webhooks
- **SONOFF Zigbee Valve** via eWeLink cloud API (Zigbee Bridge Pro as coordinator)

The architecture is modular: adding a third provider means a new edge function folder + one UI branch in the wizard, nothing else changes.

---

## Device Control Model

### eWeLink / SONOFF Zigbee

Communication path:
```
Rhozly → eWeLink Cloud API → SONOFF Zigbee Bridge Pro (Wi-Fi) → Zigbee → Valve
```

The Zigbee Bridge Pro exposes paired Zigbee sub-devices via eWeLink's API. The valve appears as either:
- A **direct device** (own `deviceid`) — `use_sub_device: false` in metadata
- A **sub-device** under the bridge — `use_sub_device: true`, command goes to `parent_device_id` with `sub_device_id` in payload

The `use_sub_device` flag on `devices.metadata` handles both patterns. It will be confirmed and set correctly once hardware arrives.

### Dead-Man's Switch

eWeLink devices support a built-in `countdown` parameter on the ON command (seconds until auto-off). Rhozly:
1. Sends `{ switch: "on", countdown: N }` — the device itself enforces the timer
2. Stores `auto_off_at = now() + N` in `device_commands`
3. A pg_cron job (every 60 s) fires a turn_off for any overdue commands as a belt-and-braces safety net
4. "Extend / Restart timer" = user sends a fresh ON + countdown — the device resets its own timer

Duration is user-configurable per device in `DeviceSettingsModal`.

### Ecowitt / Soil Sensors

Ecowitt pushes readings to Rhozly's webhook endpoint every ~16 minutes (configurable). No polling required. `integrations-ecowitt-poll` exists as a manual/fallback path.

---

## Database Schema

```sql
-- Provider integrations (one per home per provider)
CREATE TABLE integrations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id               uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('ecowitt', 'ewelink')),
  credentials_encrypted text NOT NULL,         -- AES-256-GCM blob
  region                text NOT NULL DEFAULT 'eu',
  sync_interval_minutes int  NOT NULL DEFAULT 16,
  status                text NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active','error','disconnected')),
  last_synced_at        timestamptz,
  error_message         text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (home_id, provider)
);

-- Physical devices
CREATE TABLE devices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id      uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  home_id             uuid NOT NULL REFERENCES homes(id) ON DELETE CASCADE,
  location_id         uuid REFERENCES locations(id) ON DELETE SET NULL,
  area_id             uuid REFERENCES areas(id)     ON DELETE SET NULL,
  external_device_id  text NOT NULL,
  name                text NOT NULL,
  device_type         text NOT NULL CHECK (device_type IN ('water_valve','soil_sensor')),
  provider            text NOT NULL,
  -- ewelink valve:  { "model": "ZBMINIV2", "use_sub_device": true,
  --                   "parent_device_id": "abc", "sub_device_id": "def" }
  -- ecowitt sensor: { "model": "WH51", "channel": 1, "gateway_mac": "AA:BB:..." }
  metadata            jsonb NOT NULL DEFAULT '{}',
  is_active           boolean NOT NULL DEFAULT true,
  last_seen_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_device_id)
);

-- Time-series readings
CREATE TABLE device_readings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   uuid        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  home_id     uuid        NOT NULL REFERENCES homes(id)   ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  -- soil_sensor: { "soil_temp": 18.5, "soil_moisture": 65.2, "soil_ec": 1.2 }
  -- water_valve: { "state": "on" | "off" }
  data        jsonb       NOT NULL
);

CREATE INDEX idx_device_readings_device_time ON device_readings (device_id, recorded_at DESC);
CREATE INDEX idx_device_readings_home_time   ON device_readings (home_id,   recorded_at DESC);

-- Control commands + audit log
CREATE TABLE device_commands (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       uuid        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  home_id         uuid        NOT NULL REFERENCES homes(id)   ON DELETE CASCADE,
  issued_by       uuid        REFERENCES auth.users(id),
  command         text        NOT NULL CHECK (command IN ('turn_on','turn_off')),
  parameters      jsonb       NOT NULL DEFAULT '{}',  -- { "duration_seconds": 1800 }
  auto_off_at     timestamptz,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','success','failed')),
  error_message   text,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz
);

CREATE INDEX idx_device_commands_device ON device_commands (device_id, issued_at DESC);
```

---

## Permissions

Three new keys added to `src/lib/permissions.ts`:

| Key | Default: owner | Default: admin | Default: member | Default: viewer |
|---|---|---|---|---|
| `integrations.manage` | ✅ | ✅ | ❌ | ❌ |
| `integrations.control` | ✅ | ✅ | ❌ (owner grants) | ❌ |
| `integrations.view` | ✅ | ✅ | ✅ | ✅ |

---

## Edge Functions

All live under `supabase/functions/`. All API calls to external providers happen here — never from the browser.

| Function | Trigger | Purpose |
|---|---|---|
| `integrations-ecowitt-connect` | User action | Save credentials, register webhook, discover sensors |
| `integrations-ecowitt-webhook` | Ecowitt push (public URL) | Receive readings, verify passphrase, store |
| `integrations-ecowitt-poll` | User action / fallback | Fetch current readings on demand |
| `integrations-ewelink-connect` | User action | Authenticate user, discover devices |
| `integrations-ewelink-control` | User action | Turn valve on/off with countdown |
| `integrations-ewelink-state` | User action | Get current valve state |
| `integrations-readings-query` | User action | Serve historical data with aggregation |
| `integrations-dead-mans-switch` | pg_cron every 60 s | Auto-off any overdue valve timers |

Shared helpers in `supabase/functions/_shared/integrations/`:
- `encrypt.ts` — AES-256-GCM encrypt/decrypt (key from `INTEGRATION_ENCRYPTION_KEY` env var)
- `providerTypes.ts` — TypeScript interfaces
- `readings.ts` — insert reading + update `last_seen_at`

---

## Frontend Structure

```
src/components/integrations/
  IntegrationsPage.tsx          — device grid + "Connect Device" entry
  DeviceCard.tsx                — compact card: name, last reading/state, last seen
  DeviceDetailModal.tsx         — current readings + history chart + controls
  ConnectDeviceWizard.tsx       — step controller (5 steps)
  wizard/
    Step1DeviceType.tsx         — Soil Sensor / Water Valve
    Step2Brand.tsx              — Ecowitt / SONOFF eWeLink
    Step3Credentials.tsx        — API key form or email+password
    Step4Discovery.tsx          — discovered device list with checkboxes
    Step5Confirm.tsx            — name + optional location/area
  SoilReadingsPanel.tsx         — temp / moisture / EC tiles with trend arrows
  ValveControlPanel.tsx         — ON/OFF toggle, countdown, extend button
  HistoryChart.tsx              — recharts line chart, period tabs (24h/7d/30d/12m)
  DeviceSettingsModal.tsx       — rename, area assignment, intervals, dead-man's, remove
```

---

## App.tsx Changes

**Lazy import:**
```tsx
const IntegrationsPage = lazy(() => import("./components/integrations/IntegrationsPage"));
```

**Nav link** (after `tools` entry in `navLinks` array):
```tsx
{ id: "integrations", icon: <Plug />, label: "Integrations", matchPaths: ["/integrations"] }
```

**Route** (after `/tools` route):
```tsx
<Route path="/integrations" element={
  profile?.home_id ? (
    <div className="h-full overflow-auto animate-in fade-in duration-500">
      <IntegrationsPage homeId={profile.home_id} />
    </div>
  ) : null
} />
```

---

## Environment Variables

| Variable | Where set | Notes |
|---|---|---|
| `INTEGRATION_ENCRYPTION_KEY` | Supabase Edge Function secrets | 32 random bytes, base64 |
| `EWELINK_APP_ID` | Supabase Edge Function secrets | From eWeLink developer portal (pending) |
| `EWELINK_APP_SECRET` | Supabase Edge Function secrets | From eWeLink developer portal (pending) |
| `ECOWITT_WEBHOOK_SECRET` | Supabase Edge Function secrets | Any strong passphrase |

---

## Implementation Order

- [x] Plan saved
- [x] 1. Migration: `20260521000000_integrations.sql`
- [x] 2. `src/lib/permissions.ts` — add 3 new keys
- [x] 3. `_shared/integrations/encrypt.ts`
- [x] 4. `_shared/integrations/providerTypes.ts`
- [x] 5. `_shared/integrations/readings.ts`
- [x] 6. `integrations-readings-query` edge function
- [x] 7. Ecowitt: `integrations-ecowitt-connect`
- [x] 8. Ecowitt: `integrations-ecowitt-webhook`
- [x] 9. Ecowitt: `integrations-ecowitt-poll`
- [x] 10. Frontend: `IntegrationsPage` + `DeviceCard` + empty/loading states
- [x] 11. Frontend: `ConnectDeviceWizard` (all 5 steps — Ecowitt + eWeLink flows)
- [x] 12. Frontend: `SoilReadingsPanel` + `HistoryChart` + `DeviceDetailModal`
- [x] 13. Frontend: `DeviceSettingsModal`
- [x] 14. `App.tsx` — nav item + route (Plug icon import)
- [x] 15. eWeLink: `integrations-ewelink-connect` (scaffolded; activate on approval)
- [x] 16. eWeLink: `integrations-ewelink-control` + `integrations-ewelink-state`
- [x] 17. Frontend: `ValveControlPanel`
- [x] 18. `integrations-dead-mans-switch` cron
- [ ] 19. Location Manager — "device assigned here" read-only indicator

---

## Future Phases

- **Location/Area automation**: trigger valve based on soil moisture reading falling below threshold + weather forecast
- **Additional providers**: Shelly, Tasmota, Home Assistant local API, Govee
- **Push notifications**: alert when soil moisture drops below configured threshold
- **Dashboard widget**: mini device status panel on the Dashboard Locations view
