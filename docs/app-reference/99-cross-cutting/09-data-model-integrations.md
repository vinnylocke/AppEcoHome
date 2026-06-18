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

### Device battery state (added 2026-06-16)

Two complementary stores for "what's the battery doing":

| Where | Column / field | Why |
|---|---|---|
| `devices.battery_percent` (SMALLINT, 0–100, NULL) | Fast "latest known" — powers the `BatteryPip` on `DeviceCard` without a per-card history query. |
| `devices.battery_reported_at` (TIMESTAMPTZ, NULL) | When `battery_percent` was last updated. Used by the pip's hover tooltip + freshness logic. |
| `device_readings.data.battery_percent` (jsonb integer) | Per-reading battery, lives inside the existing family-typed `data` jsonb so no new column is required on the time-series table. Powers `DeviceBatteryPanel`'s sparkline + the days-remaining regression in [`src/lib/batteryEstimate.ts`](../../../src/lib/batteryEstimate.ts). |
| `device_battery_resets` (one row per manual battery swap) | Bounds the regression window so a battery change does NOT look like a recharge. `device_id`, `home_id`, `occurred_at`, `recorded_by`. RLS: home members can read; only the recorder can insert. |

The `integrations-webhook-router` updates the two `devices.battery_*` columns AND writes battery into `device_readings.data` in the same webhook handler. Adapters only need to extract + validate the value; the router does the dual-write.

### Custom integrations (added 2026-06-16)

`integrations.provider` now accepts `'custom_http'` (constraint widened in [`20260723000000_devices_battery_level.sql`](../../../supabase/migrations/20260723000000_devices_battery_level.sql)). The `integrations.metadata` jsonb (added Phase 3) stores `{ webhook_secret, family, friendly_name, external_device_id }` for these integrations. The expression index `idx_integrations_webhook_secret` makes the router's secret-match lookup O(log N).

**Note on column drift in this doc:** entries above mention `integration_devices` and `soil_readings` — those names are historical. The actual tables are `devices` and `device_readings` (single time-series table for both sensor + valve readings, family-discriminated by the `data` jsonb shape). Flagging here rather than rewriting the whole doc in this task; cleanup is a follow-up.

### Automations join tables

```
automation_devices ─ device_id, automation_id
automation_blueprints ─ blueprint_id, automation_id, role: "controlling" | "driven"
```

- **Controlling**: completing the linked blueprint task triggers the automation.
- **Driven**: the automation auto-completes the blueprint task when it runs.

### `automation_runs`

Audit trail of every fire. `status`: `ran` / `skipped_rain` / `failed` / `retried` / `skipped_rate_limited` (Batch B). `trigger_reason jsonb` (Batch B) records `{ summary, matched }` — the satisfied condition leaves ("why it ran").

### Batch B automation columns (2026-06-18, migration `20260801000000`)

- `automations.location_id` (FK `locations`, nullable) — joins `area_id` for the builder's Scope picker.
- `automations.run_limit_count` (int, NULL = unlimited) + `run_limit_window_hours` (int, default 24) — per-window fire cap enforced by `evaluate-automations`.
- `automation_actions.action_kind` gains `'complete_task'`; new `target_blueprint_id` (FK `task_blueprints`). The migration converts existing `automation_blueprints` **driven** links into `complete_task` actions and **deletes** the driven rows (implicit auto-completion retired — completion is now an explicit action handled by `evaluate-automations`). `controlling` links are untouched.

### Unified condition tree on `automations` (added 2026-06-17, Phase 1)

`automations.trigger_logic jsonb` holds a **free boolean condition tree** (leaves: sensor / time / task_due / weather, combined with AND/OR groups + per-node `negate`). It is the **canonical** trigger definition. Rising-edge bookkeeping: `condition_was_true boolean`, `last_fired_at timestamptz`. **Phase 3 (2026-06-18):** the 21 legacy trigger/weather columns (`scheduled_time`, `sensor_*`, `skip_if_rained`, `rain_threshold_mm`, `trigger_if_hot`, `heat_threshold_c`, `weather_mode`, `weather_*`, `critical_threshold_value`, `max_defers`, `defer_*`, `last_run_date`) were **dropped** (`20260728000000`) once backfill completed. Kept: `area_id`, `duration_seconds`, `retry_on_failure`, `fire_valves_sequentially`, `sensor_cooldown_minutes`, `tier`, `trigger_kind` (now `'condition'`). The 5-min `evaluate-automations` loop reads `trigger_logic` and evaluates the tree. See [docs/plans/unified-condition-automations.md], [Cron Jobs](./11-cron-jobs.md), `_shared/conditionTree.ts`.

### Weather-defer columns on `automations` (added 2026-06-17)

`automations` gains a per-row weather-handling selector + single-pending deferral state (hybrid weather + sensor watering): `weather_mode text default 'off'` (CHECK `off|skip|defer`, back-filled from `skip_if_rained`), `weather_min_probability`, `weather_defer_window_hours`, `critical_threshold_value`, `max_defers`, `defer_skip_in_heat`, and the deferral state `defer_until` / `defer_count` / `defer_started_at` (indexed where `defer_until IS NOT NULL`). The 5-min `evaluate-sensor-automations` loop reads these to defer-and-recheck; `run-automations` honours `weather_mode` on scheduled runs. See [Edge Functions Catalogue](./10-edge-functions-catalogue.md), [Weather](./27-weather.md).

### `area_ai_insights` (AI Area Coach cache, added 2026-06-17)

One row per area (`area_id` PK, `home_id` FK), home-scoped RLS SELECT, service-role writes only. Caches the AI Area Coach analysis as `insight` jsonb. `based_on_reading_at` records the latest `device_reading.recorded_at` the insight reflects — the `area-sensor-analysis` fn regenerates only when a newer reading (live or manual) arrives. Also stores `persona`, `model`, `generated_at`. See [Edge Functions Catalogue](./10-edge-functions-catalogue.md) and [Caching](./14-caching.md).

### `latest_device_readings(p_home_id)` RPC (Batch C, 2026-06-18, migration `20260802000000`)

`SECURITY INVOKER` SQL function returning the newest `device_readings` row per device for a home (`DISTINCT ON (device_id) … ORDER BY device_id, recorded_at DESC`). Existing `device_readings` RLS ("home members read readings") gates the rows. Powers the live moisture/temp/EC/valve-state chips on `DeviceCard` (`src/lib/integrations/readingChips.ts`) without a per-card query. `GRANT EXECUTE … TO authenticated`.

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
