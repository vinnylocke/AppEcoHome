# Data Model — Integrations, Devices, Readings, Automations

> Hardware integration tables: provider connections, devices, per-device readings (soil sensors), events (valves), automations + their linkages to devices + blueprints.

---

## Quick Summary

```
integrations (provider-level connection)
├── home_id, provider ("ewelink", ...)
├── access_token (encrypted)
├── refresh_token, expires_at
└── ──► integration_devices

integration_devices
├── integration_id, home_id, area_id?, location_id?
├── external_device_id, provider, name
├── device_type: "soil_sensor" | "water_valve"
├── metadata: jsonb
└── ──► soil_readings / valve_events

soil_readings
├── device_id, recorded_at
├── soil_temp, soil_moisture, soil_ec
├── ec_source: "calibrated_us_cm" | "raw_adc"  (2026-06-16 — WH52 vs WH51)
└── raw_payload: jsonb

valve_events
├── device_id, action: "open" | "close"
├── triggered_by, triggered_at
└── automation_run_id?

automations
├── home_id, name, is_active
├── scheduled_time, duration_seconds
├── fire_valves_sequentially, skip_if_rained, rain_threshold_mm, retry_on_failure
├── last_run_date
└── ──► automation_devices, automation_blueprints, automation_runs

automation_runs
├── automation_id, status, triggered_at, triggered_by
└── error?
```

---

## Role 1 — Technical Reference

### Provider integration

`integrations` row holds the OAuth tokens (encrypted via Supabase Vault or env-keyed encryption). Each home can have multiple provider connections.

### Device discovery

`ConnectDeviceWizard` walks: OAuth → list devices from provider → user picks → `integration_devices.insert(...)` per pick.

### Soil readings

Populated by the Ecowitt webhook (`integrations-ecowitt-webhook`) and the on-demand poll (`integrations-ecowitt-poll`). Each row stores normalised values + the raw provider payload for debugging.

**EC calibration (2026-06-16, Phase 1 of integration framework, see [plan](../../plans/soil-sensor-integration-2026-06-16.md)):** `soil_ec` is a single number column but its meaning depends on the sensor model. The new `ec_source` discriminator records which interpretation applies:

| Value | Meaning | Sensor | Unit |
|---|---|---|---|
| `calibrated_us_cm` | Calibrated electrical conductivity | WH52 multi-parameter | µS/cm |
| `raw_adc` | Raw ADC integer from the EC pin | WH51 moisture-only | unitless (relative indicator only) |

Old rows written before the discriminator landed are treated as `raw_adc` for back-compat (the WH51 was the only Ecowitt sensor supported at the time). UI surfaces (`SoilReadingsPanel`) render the right unit + tooltip based on this flag. Field-name detection logic lives in [`_shared/integrations/ecowittFields.ts`](../../../supabase/functions/_shared/integrations/ecowittFields.ts) — adding a new EC field-name spelling is a one-line append to `CALIBRATED_EC_FIELDS`.

### Valve events

Open/close events with `triggered_by` indicating user, automation, or external.

### Automations join tables

```
automation_devices ─ device_id, automation_id
automation_blueprints ─ blueprint_id, automation_id, role: "controlling" | "driven"
```

- **Controlling**: completing the linked blueprint task triggers the automation.
- **Driven**: the automation auto-completes the blueprint task when it runs.

### `automation_runs`

Audit trail of every fire. `status`: `ran` / `skipped_rain` / `failed` / `retried`.

### Cron

| Cron | Cadence | Effect |
|------|---------|--------|
| `run-automations` | every 1 minute | Fires due automations |
| `integrations-ewelink-sync` | periodic | Refreshes readings + device states |

---

## Role 2 — Expert Gardener's Guide

### Why this matters

Once you connect hardware, the data graph is what powers automated watering. Soil moisture readings feed area metrics; valve commands respect rain forecasts; automation runs produce an auditable history.

### Implications

- Disconnecting a device cleanly removes `integration_devices` rows but historical readings persist.
- OAuth tokens expire — re-run Connect when devices go offline.

---

## Related reference files

- [Integrations — Devices Tab](../07-management/05-integrations-devices.md)
- [Integrations — Automations Tab](../07-management/06-integrations-automations.md)
- [Integrations — Soil Readings](../07-management/07-integrations-readings.md)

## Code references for ongoing maintenance

- `supabase/migrations/*_integrations.sql`, `*_integration_devices.sql`, `*_soil_readings.sql`, `*_valve_events.sql`, `*_automations.sql`, `*_automation_*.sql`
- `supabase/functions/integrations-ewelink-*` family
- `supabase/functions/run-automations/index.ts`
