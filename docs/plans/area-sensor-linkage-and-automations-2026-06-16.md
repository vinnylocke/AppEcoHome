# Area ↔ Sensor linkage, manual area metrics, and sensor-driven automations

> Three intertwined features that together turn raw sensor data into actionable garden intelligence. Sensor → Area → AI / Care guides / Automations.

## Goals (as stated)

1. **Link one or more sensors to an area.** When a sensor reports a reading, the area inherits it. Areas without sensors stay manual-only.
2. **Manual area metric entry with timestamps.** A user without a sensor (or with a sensor down) can type in soil moisture / temp / EC values and we treat them as a reading just like the sensor would.
3. **Area metric history charts.** Click an area → see graphs of moisture / temp / EC over time, with per-sensor lines + an aggregate average when multiple sensors are linked.
4. **Sensor-driven automations.** Build automations off sensor thresholds:
   - "Greenhouse soil temp ≥ 30°C → push notification 'open window'"
   - "Greenhouse soil temp ≤ 8°C → push notification 'close window'"
   - "Bed A moisture ≤ 20% → open valve V1 for 30 min"
5. **Area-scoped automation builder.** Pick an area first; the sensor + valve pickers filter to what's actually in that area.

## Pre-flight — what already exists

Don't rebuild what's there. Discovery:

| Piece | State | Used for |
|---|---|---|
| `devices.area_id` | **Exists** (nullable FK to `areas`) | Sensor↔area linkage at the data model. Just needs UI surfacing |
| `devices.location_id` | **Exists** (nullable FK) | Same — location-level linkage already wired |
| `DeviceSettingsModal` location/area pickers | **Exist** | User can already assign a sensor to an area via Device Settings. Just hasn't been documented as "the way to link" |
| `area_lux_readings` table | **Exists** (Wave 11, 2026-05-04) | Time-series for lux with `source IN ('sensor', 'manual', 'plant')`. **Perfect precedent for the new moisture/temp/EC tables — same shape, same RLS pattern, same denormalised-latest pattern on `areas`** |
| `device_readings` table | **Exists** | Raw sensor readings keyed by `device_id`. Already populated by the Ecowitt webhook + poll + cron. |
| `automation_sensors` table | **Exists but unfinished** | Has `automation_id`, `sensor_device_id`, `plant_id`, `moisture_threshold_pct`. **Hardcoded to moisture and a single comparator; needs schema work to support temp/EC/general thresholds** |
| `AutomationModal` (UI) | **Exists** | Currently builds time-scheduled valve automations. Has no sensor-trigger UI |
| `run-automations` cron | **Exists, hourly** | Fires due time-scheduled automations. Doesn't yet evaluate sensor thresholds |

Strong precedent + nullable FK = the foundation is already mostly in place. The work is UI + schema extensions + threshold engine.

---

## Phase plan

Splitting into three phases that ship independently. Each phase is a real PR with tests + docs.

### Phase 1 — Sensor↔Area surfacing + Area metric viewer (M, ~2-3 days)

**What ships:**
- "Linked sensors" section on the existing AreaMetricsModal — one tile per linked sensor showing latest reading + a "View history" affordance.
- An aggregated **Area metrics** view: latest moisture / temp / EC (averaged across linked sensors when there are multiple), with a small history chart per metric.
- "Link a sensor" CTA on areas with zero sensors — opens DeviceSettingsModal for sensors in this home that don't yet have an area.

**Schema:** Mostly none — `devices.area_id` already exists. The aggregation reads `device_readings` filtered by `device_id IN (SELECT id FROM devices WHERE area_id = ?)`.

**New files:**
- `src/components/area/AreaSensorsPanel.tsx` — tile grid + latest readings + history chart
- Light extensions to `AreaMetricsModal` to mount the new panel
- New service: `src/services/areaSensorsService.ts` — aggregation queries

**Tests:**
- Vitest unit test for the aggregation math (single-sensor → just the value; multi-sensor → average; nullable handling).
- E2E: assign a sensor to an area → metric panel updates.

**App-reference updates:**
- `docs/app-reference/04-planner/02-area-metrics-modal.md` (or wherever it lives)
- `docs/app-reference/07-management/05-integrations-devices.md` — note the area linkage flow
- New surface ref for AreaSensorsPanel

---

### Phase 2 — Manual area metric entry (M, ~2 days)

**What ships:**
- New tables `area_moisture_readings`, `area_temp_readings`, `area_ec_readings` mirroring the proven `area_lux_readings` pattern (uuid PK, home_id, area_id, value + unit, recorded_at, source ∈ {sensor, manual, plant}). RLS + grants identical to lux.
- Denormalised "latest" columns on `areas` (`latest_soil_moisture_pct`, `latest_soil_temp_c`, `latest_soil_ec_us_cm`, `latest_*_recorded_at`) so AI prompts + Care guide queries can read the current state without a join.
- Manual-entry UI on AreaMetricsModal: pick metric → enter value → optional timestamp → submit. Same UI shape as the existing lux manual entry.
- Sensor readings auto-mirror into these tables: on `device_readings` insert, a trigger or app-level write fan-outs to the right area metric table when the device has `area_id`. Decision in the plan body below.

**Decision in the plan: trigger vs app-level fan-out.**
- **Trigger** (Postgres): airtight — every reading mirrors, even from future ingest paths we haven't written yet. Slightly harder to debug; adds write amplification.
- **App-level** (inside `insertReading` helper): simpler; tied to the reading-insert pathway; risk of new code forgetting to call it.
- **Recommendation: trigger.** Mirrors the lux pattern's audit trail and survives anything we bolt on later.

**New files:**
- Migration `20260720000000_area_soil_readings.sql` (3 tables + trigger + denormalised columns)
- `src/services/areaReadingsService.ts` — manual entry CRUD
- Extension to AreaMetricsModal for the manual-entry form
- Server-side trigger lives in the migration

**Tests:**
- Deno test for the trigger (insert a device_readings row → row in the right area metric table).
- Vitest unit test for the manual-entry validation.
- E2E for the manual-entry happy path.

---

### Phase 3 — Sensor-driven automations (L, ~3-4 days)

**What ships:**
- Schema extensions to `automations` + `automation_sensors`:
  - `automations.trigger_kind` (text enum) — `time_scheduled` (existing) | `sensor_threshold` (new).
  - `automations.area_id` (nullable FK) — when set, the automation is scoped to an area (sensor + valve pickers filter to it).
  - `automation_sensors` extended: add `metric` (text: `soil_moisture` / `soil_temp_c` / `soil_ec_us_cm`), `comparator` (text: `>=` / `>` / `<=` / `<`), `threshold_value` (numeric), `hysteresis` (numeric, default 2 — see below), `cooldown_minutes` (default 60). The existing `moisture_threshold_pct` column stays but is deprecated (migration backfills from it).
  - New `automation_actions` table — replaces the implicit single-action assumption with a typed action list:
    - `action_kind` ∈ {`notification`, `valve_open`, `valve_close`}
    - `target_device_id?` — for valve actions
    - `notification_title?`, `notification_body?` — for notification actions
  - New `automation_trigger_log` table — every threshold evaluation that fired or skipped (for cool-down evaluation + user-visible audit).

**Threshold engine (`evaluate-sensor-automations` cron, every 5 min):**
- For each `is_active = true AND trigger_kind = 'sensor_threshold'` automation:
  - For each linked sensor, read the latest reading.
  - Evaluate each `(metric, comparator, threshold)` rule. **Hysteresis: the rule is "armed" while the value is at least `hysteresis` away from the threshold on the safe side, and fires when it crosses.** Prevents oscillation spam.
  - Honour `cooldown_minutes` — don't fire again until cool-down elapses.
  - Fire the linked `automation_actions`: notification via the existing push pipeline, valve open/close via `integrations-ewelink-control`.

**UI extensions:**
- New AutomationModal mode: "Triggered by sensor". The user:
  1. Picks an area (optional but recommended) — filters sensor + valve pickers below.
  2. Picks one or more sensors.
  3. Builds a rule: metric → comparator → value.
  4. Picks one or more actions: notification (with custom title/body), valve open (pick valves + duration), valve close.
  5. Sets cool-down + hysteresis (with sensible defaults — most users won't touch).
- Automations list grows a "Trigger" column distinguishing time vs sensor.

**New files:**
- Migration `20260721000000_automation_triggers_and_actions.sql`
- Edge function `evaluate-sensor-automations/index.ts`
- Cron registration migration `20260721000100_sensor_automations_cron.sql`
- `src/components/integrations/AutomationModal.tsx` extensions (probably new sub-components: `SensorTriggerBuilder.tsx`, `ActionList.tsx`)
- `src/services/sensorAutomationsService.ts`

**Tests:**
- Deno tests for the threshold engine: arm/fire transitions, hysteresis edge cases, cool-down, multi-sensor automations.
- E2E: build a sensor-triggered automation, manually insert a device_reading that crosses the threshold, expect `automation_runs` row with status `ran` + notification queued.

---

## Recommendation on shape

**Ship Phase 1 first.** It's pure visibility — no new tables, no engine, low risk, immediate value. The user can verify sensor→area linkage works and the area metrics view is useful before we invest in tables + engines.

Phase 2 and 3 can ship together OR Phase 2 first then 3 — they don't strictly depend on each other (Phase 3's threshold engine reads from `device_readings` directly, not from `area_*_readings`).

## Risks

- **Notification spam.** Without hysteresis + cool-down, sensor oscillating around a threshold = dozens of pushes per hour. Phase 3 has explicit hysteresis + cool-down with sane defaults.
- **Multi-sensor averaging confuses thresholds.** If three sensors in one area read 28°C, 30°C, 32°C, which one drives the rule? Decision: per-sensor rules by default (each sensor evaluated independently). When users want an "average" rule we can add it later as a `agg_mode` field on `automation_sensors`.
- **Valve safety.** Sensor-triggered valve actions need the existing dead-man's switch protection (already in `integrations-dead-mans-switch` cron). Confirm the integration before Phase 3 ships.
- **Schema migration on `automation_sensors`.** Backfilling `metric=soil_moisture, comparator=<=` from the existing `moisture_threshold_pct` is straightforward but the column itself needs to keep working until everyone has migrated. Recommendation: keep the column, populate the new fields on next save, drop the old column in a follow-up after a few weeks.

## Open questions for you

1. **Slicing.** Phase 1 alone first, or Phase 1 + 2 + 3 in sequence? My recommendation is Phase 1 first as its own PR.
2. **Multi-sensor rule semantics.** When you say "when greenhouse temp is X" with multiple sensors in the greenhouse — do you want it to fire when *any* sensor crosses, *all* sensors cross, or the *average* crosses? My default is "per-sensor" (each sensor is its own rule) since that's least surprising, with a future "average" toggle.
3. **Manual entry urgency.** Phase 2 is useful but optional — would you ever realistically type in moisture / temp / EC readings by hand, or is this only meaningful for users without sensors? If the latter, we can defer Phase 2 indefinitely and ship Phase 1 + 3 first.
