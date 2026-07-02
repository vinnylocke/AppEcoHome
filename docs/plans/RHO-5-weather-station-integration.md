# RHO-5 — Support Weather Station Integration

**Ticket:** RHO-5 "Support Weather Station Integration" (Feature)
**Status target:** In Planning (this document is the pre-approval plan — no code written)
**Date:** 2026-07-02

---

## 1. Goal

Extend the hardware-integrations framework (currently soil sensors + water valves via
Ecowitt / eWeLink / custom HTTP webhook) to **weather stations**. A user connects a
weather-station integration, then assigns the station to the **whole home** or to a
**location** (areas are explicitly out of scope).

- **Home-assigned station** — replaces the weather API for *current conditions*; the
  API (Open-Meteo) remains the source for *predictions and alerts*. Automations that
  depend on weather use station data where the station can provide it, with
  **per-datum API fallback** when it can't. The Weather tab keeps its API forecast but
  gains a top panel showing live station weather.
- **Location-assigned station** — the API still drives predictions/events; automations
  whose sensors/scope sit in the **same location** use station data instead of API
  (same per-datum fallback); the Weather tab lets you flick between locations' station
  weather.
- **Automations** gain condition-tree triggers on weather-station readings per sensor
  kind (temperature, humidity, wind, rain, pressure, UV).
- **Investigation item:** how weather-alert-driven automations keep working when the
  source is a station — stations cannot predict, but they give exact history. Explicit
  recommendation in §6.4.

---

## 2. App-reference files consulted

- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` — integrations /
  devices / device_readings / automations graph, `latest_device_readings` RPC, battery
  dual-write, custom_http metadata, condition-tree canonical status.
- `docs/app-reference/99-cross-cutting/27-weather.md` — sync-weather/analyse-weather
  pipeline, `weather_snapshots` shape, weather rules, alert lifecycle,
  `readForecast` / `computeRainWindow` usage by automations.
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` — sync-weather (hourly, 55-min
  guard), analyse-weather, integrations-ecowitt-cron-poll (15 min), the three
  evaluate-automations scopes (5-min time / 15-min all / on-INSERT event trigger),
  prune-app-logs (`device_readings` 30-day retention).
- `docs/app-reference/07-management/05-integrations-devices.md` — Devices tab, Connect
  wizard, provider table, DeviceCard chips, DeviceSettingsModal location/area binding.
- `docs/app-reference/07-management/06-integrations-automations.md` — unified condition
  builder, leaf kinds, repeat-while-true firing, run window, run limits, receipts.
- `docs/app-reference/02-dashboard/04-weather-tab.md` — Weather tab component graph,
  `weather_snapshots` read path, Garden Intelligence client-side rules.
- `docs/app-reference/99-cross-cutting/17-tier-gating.md` (via `src/constants/tierFeatures.ts`)
  — `integrations` feature is available to ALL tiers; weather stations inherit that gate.

Source read end-to-end: `supabase/migrations/20260521000000_integrations.sql`,
`20260723000000_devices_battery_level.sql` (provider CHECK widening precedent),
`supabase/functions/_shared/integrations/{providerTypes,readings,ecowittFields,contract}.ts`,
`integrations-ecowitt-cron-poll/index.ts`, `evaluate-automations/index.ts`,
`_shared/conditionTree.ts`, `_shared/weatherForecast.ts`, `sync-weather/index.ts`,
`src/lib/conditionTree.ts`, `src/components/integrations/{IntegrationsPage,ConditionNodeEditor,DeviceSettingsModal,wizard/Step1DeviceType}.tsx`,
`src/components/WeatherForecast.tsx`.

---

## 3. Data model

### 3.1 New `device_type` value, NOT a new table

**Decision: widen `devices.device_type` CHECK to include `'weather_station'`.**

Justification — everything downstream of `devices` is device-type-agnostic plumbing we
want for free:

- `device_readings` is already a family-discriminated jsonb time-series ("single
  time-series table for both sensor + valve readings, family-discriminated by the
  `data` jsonb shape" — 09-data-model-integrations.md). A third family slots in with
  zero schema change.
- `insertReading()` (`_shared/integrations/readings.ts`) gives us `last_seen_at` +
  battery dual-write (`devices.battery_percent` / `battery_reported_at` + in-reading
  history) — weather stations are battery-reporting outdoor hardware; this matters.
- `latest_device_readings(p_home_id)` RPC already powers per-device "latest reading"
  on the client — the Weather tab station panel reuses it directly.
- RLS ("home members read devices/readings"), the 30-day `device_readings` retention
  prune, the `evaluate_automations_on_reading` INSERT trigger, DeviceCard/DetailModal,
  and the Connect wizard all key off `devices` rows.

A separate `weather_stations` table would duplicate all of the above (RLS, retention,
RPC, trigger, UI plumbing) for no modelling benefit. The precedent is exactly how
`custom_http` widened `integrations_provider_check` in `20260723000000`.

### 3.2 Assignment model — home vs location

`devices` **already has** nullable `location_id` (FK `locations`, `ON DELETE SET NULL`)
and `area_id`. For weather stations:

- **`location_id = NULL` ⇒ assigned to the whole home.**
- **`location_id = <uuid>` ⇒ assigned to that location.**
- **`area_id` is always NULL / ignored** for `device_type = 'weather_station'` — the
  DeviceSettingsModal hides the area picker for this type and the save path forces
  `area_id: null`. (Ticket: "ignore areas".)

No new columns. The semantics match the existing soil-sensor convention where NULL
location simply means "not placed"; for weather stations we give NULL the explicit
meaning "home-wide". This is documented in the settings modal copy ("Whole home" is
the first option in the location select) and in the app-reference update.

Multiple stations are allowed (e.g. home-wide plus one per location). Conflict
resolution lives in the effective-weather resolver (§5): **exact-location match →
home-wide station → API**, and within a scope tier the station with the **freshest
reading** wins (tie-break `created_at`).

### 3.3 Reading payload shape

New interface in `_shared/integrations/providerTypes.ts` (client mirror in
`src/lib/integrations/types.ts`):

```ts
export interface WeatherStationReading {
  temp_c?: number;          // outdoor air temperature, °C
  humidity_pct?: number;    // outdoor relative humidity, %
  wind_kph?: number;        // sustained wind speed, km/h
  wind_gust_kph?: number;   // gust, km/h
  wind_dir_deg?: number;    // 0–360
  rain_rate_mm_h?: number;  // instantaneous rain rate, mm/h
  rain_today_mm?: number;   // accumulated rain since local midnight, mm (gauge-reported)
  pressure_hpa?: number;    // relative barometric pressure, hPa
  uv_index?: number;
  solar_wm2?: number;       // solar radiation, W/m²
  battery_percent?: number; // same convention as SoilReading/ValveReading
}
```

- **Every field optional.** Per-datum fallback is keyed on field presence + freshness —
  a wind-only add-on array simply never writes `rain_*` and the resolver falls back to
  API for rain.
- **Canonical metric units always** (°C, km/h, mm, hPa) — mirrors the existing
  "storage is always Celsius" rule for soil temps. Display conversion (e.g. mph) is a
  client concern (open question §12.6).
- `DeviceReadingData` union gains the new member; add an `isWeatherStationReading`
  guard alongside `isSoilReading`/`isValveReading` in `contract.ts` (presence-based:
  any station field present and no `soil_moisture`/`state`).
- `DeviceType` union → `"soil_sensor" | "water_valve" | "weather_station"`.
- New `EcowittStationMeta` metadata shape: `{ gateway_mac: string; station_model?: string;
  display_temp_unit?: TempDisplayUnit }` (one station device per gateway MAC — Ecowitt
  outdoor arrays report through the gateway as a single logical station).
- `aggregate_device_readings` RPC gains a `weather_station` branch (AVG temp / humidity
  / wind / pressure, MAX gust / uv, MAX rain_today per bucket) so `HistoryChart` works.

---

## 4. Provider work

| Provider | Weather stations? | Work |
|---|---|---|
| **Ecowitt** | **Yes — core product** (WS69/WS90 sensor arrays reporting via the same GW gateways we already poll). The `device/real_time?call_back=all` response we already fetch carries `outdoor` (temp/humidity), `wind`, `rainfall` / `rainfall_piezo`, `pressure`, `solar_and_uvi`, and `battery` blocks alongside the `soil_chN` blocks we parse today. | New parser `_shared/integrations/ecowittWeatherFields.ts` (mirrors `ecowittFields.ts`: permissive field-name candidates, `{value, unit}` wrappers, unit sidecars, F→C / inHg→hPa / mph→kph / in→mm conversion, battery voltage → percent via existing `parseEcowittBatteryDetailed`). Extend `integrations-ecowitt-connect` discovery: if the gateway payload contains any outdoor block, offer one `weather_station` device per gateway MAC (`external_device_id = "<MAC>:station"`). Extend `integrations-ecowitt-poll` + `integrations-ecowitt-cron-poll` to also load `device_type = 'weather_station'` devices and write a `WeatherStationReading` per station — **no extra API calls**: the same per-MAC `call_back=all` fetch already contains the data; we just parse more of it. |
| **eWeLink** | **No.** Sonoff's ecosystem has spot temp/humidity sensors but no weather stations; the existing eWeLink integration is valve-focused. | No changes. `ewelink` never appears as a brand for the weather-station device type in the wizard. |
| **Custom HTTP webhook** (`custom_http` adapter) | **Yes** — it's the generic escape hatch (Home Assistant, WeeWX, DIY). | Extend the adapter's `families` to include `weather_station`; accept webhook payloads `{ schema_version, device_external_id, kind: "weather_station", temp_c?, humidity_pct?, wind_kph?, … , recorded_at? }` in `parseWebhook`; add the sample payload to the post-connect instructions, `WebhookDetailsPanel`, and a station template in `TestWebhookModal`. (Phase 3 — see §10.) |

---

## 5. The resolution layer — "effective weather"

New shared module **`supabase/functions/_shared/effectiveWeather.ts`** — the single
place that answers "what is the weather *right now* for this home/location":

```ts
export type EffectiveWeatherSource = "station" | "api";

export interface EffectiveWeather {
  fields: WeatherStationReading;                       // merged current conditions
  sources: Partial<Record<keyof WeatherStationReading, EffectiveWeatherSource>>;
  station?: { deviceId: string; name: string; locationId: string | null; recordedAt: string };
}

export async function resolveEffectiveWeather(
  db, homeId: string,
  opts?: { locationId?: string | null; now?: Date; freshnessMinutes?: number },
): Promise<EffectiveWeather>
```

Behaviour:

1. **Station selection** — load active `weather_station` devices for the home. Scope
   precedence: station whose `location_id` equals `opts.locationId` (when given) →
   home-wide station (`location_id IS NULL`) → none. Within a tier, freshest
   `last_seen_at` wins; tie-break `created_at`.
2. **Freshness rule** — a station reading counts only if
   `recorded_at >= now − STATION_FRESHNESS_MINUTES` (**default 45 min** = the 15-min
   poll cadence with two missed polls of tolerance; exported constant, open question
   §12.1). A stale station is treated as absent — silent per-datum fall-through to API.
3. **Per-datum merge** — for each field: station value if the fresh reading carries it,
   else the API-derived current value from `weather_snapshots.data` (nearest hourly
   point for temp / wind / humidity / precipitation; `sources` records which side won).
   Pure merge function `mergeEffectiveWeather(stationReading|null, apiCurrent, now)`
   split out for Deno unit tests.
4. **API current-conditions upgrade (small, P1)** — `sync-weather` today fetches only
   `daily` + `hourly`; add `current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_gusts_10m,surface_pressure,weather_code`
   to the Open-Meteo params so the API fallback is a true current block rather than a
   nearest-hour interpolation. Readers tolerate its absence on old snapshots.

**Client mirror** `src/lib/effectiveWeather.ts` — the same pure merge (station reading
from the `latest_device_readings` RPC + the snapshot the Weather tab already holds), so
the panel renders per-datum source badges without an extra edge-function round trip.
Vitest-covered.

Prediction stays untouched: `readForecast` / weather rules / `analyse-weather` continue
to read `weather_snapshots` only.

---

## 6. Automation integration

### 6.1 New condition-tree leaf kind: `station`

Added to `_shared/conditionTree.ts` + the client mirror `src/lib/conditionTree.ts`:

```ts
| { kind: "station"; negate?: boolean;
    metric: StationMetric; comparator: Comparator; value: number; agg: AggMode;
    stationIds?: string[]; locationId?: string | null }

type StationMetric =
  | "air_temp_c" | "humidity_pct" | "wind_kph" | "wind_gust_kph"
  | "rain_rate_mm_h" | "rain_today_mm" | "pressure_hpa" | "uv_index";
```

A **new leaf kind** rather than extending the existing `sensor` leaf, because: the
sensor leaf's loader is hard-filtered to `device_type = 'soil_sensor'` and area-scoped
(`loadObsForSensorLeaf`), its metrics map to soil jsonb keys, and its UI picker lists
soil sensors — overloading it would tangle two different scoping rules (area vs
location) into one leaf. The existing `weather` leaf (rain_forecast / heatwave) is
*forecast* semantics and stays as-is.

`newLeaf("station")` default: `air_temp_c > 30`, `agg: "any"`, no explicit stations
(⇒ scope resolution below). `summariseNode` (both mirrors): e.g.
`"station air temp > 30°C"`, `"station rain today ≥ 5mm"`.

### 6.2 Location-scoping rule (which automations use station data)

Evaluation in `evaluate-automations` (`processOne` → new `loadStationObsForLeaf`):

1. **Explicit `stationIds`** → use those stations' latest readings.
2. Else resolve the leaf's scope location: `leaf.locationId` ??
   automation's location (`automations.location_id`, else `automations.area_id → areas.location_id`).
3. Feed that into `resolveEffectiveWeather(db, homeId, { locationId })` — which encodes
   the ticket rule: *automations with sensors in the same location use that location's
   station; otherwise the home station; per-datum API fallback when the station can't
   provide the metric* (temp/humidity/wind/rain-so-far/pressure all have API
   equivalents; `uv_index` has no API fallback in the current snapshot → leaf is
   `false` when unavailable, mirroring the sensor leaf's "no observations ⇒ false"
   fail-safe).
4. With explicit multi-station selection, `agg` (`any|all|average`) works exactly like
   the sensor leaf via `ruleSatisfiedAcrossSensors`.

Supporting engine changes:

- `_shared/automationCandidates.ts` — `treeAffectedByDevice` must match station leaves
  (explicit id, or scope-resolved station for the reading's device) so the
  `device_readings` INSERT event path evaluates station-triggered automations within
  ~1 s of a new reading. `treeHasTimeTrigger` unchanged (station leaves are
  sensor-class, covered by the event path + 15-min sweep).
- The `evaluate_automations_on_reading` DB trigger is currently **soil-reading-gated**
  — widen its gate to also fire on weather-station-shaped `data` (migration, §8).
- `trigger_reason` / receipts pick the new leaf up automatically via `summariseNode`.

### 6.3 Firing dynamics

No changes to `shouldFire` (repeat-while-true + cooldown), the home default run window,
run limits, or the CAS claim — station leaves are just another boolean input. Worth
stating in the builder helper copy: a "wind > 40 kph" automation will re-fire every
cooldown while the storm lasts, bounded by run limits — identical to soil-moisture
behaviour today.

### 6.4 Weather-alert-driven automations when the source is a station (investigation)

**Today's reality:** no automation consumes `weather_alerts` rows. "Weather-driven"
automations use the `weather` condition leaf (`rain_forecast` / `heatwave`), which
reads the **forecast** in `weather_snapshots` via `readForecast`. `weather_alerts` are
a notification surface only.

**Recommended explicit approach — "stations measure, the API predicts":**

1. **Forecast-semantics leaves (`weather`: rain_forecast, heatwave) always stay
   API-sourced**, even for a home-assigned station. A station physically cannot
   predict; silently swapping in station data would change the leaf's meaning
   (e.g. "rain forecast ≥5mm" becoming "rain falling now") and break existing
   automations. This is also consistent with the ticket ("the weather API remains for
   predictions/alerts").
2. **Actual-conditions triggers are the new `station` leaves** — and because stations
   give *exact history*, `rain_today_mm` and `rain_rate_mm_h` let users express what
   they previously approximated with forecasts: "don't water if ≥5mm actually fell
   today" is `NOT (station rain today ≥ 5mm)` — strictly better than the forecast
   version, using measured truth. The builder's helper copy and the app-reference
   Role 2 sections teach this pattern ("forecast to look ahead, station to confirm").
3. **`analyse-weather` alert generation is untouched** in this feature. A follow-up
   (out of scope, noted as open question §12.4) could station-*confirm* alerts (e.g.
   close a heavy-rain alert early when the gauge shows it under-delivered), but alerts
   remain API-driven.

This keeps every existing automation's behaviour stable while giving station owners a
strictly more precise vocabulary.

---

## 7. Weather tab UI

`src/components/WeatherForecast.tsx` (the `/dashboard?view=weather` body) gains a new
top panel, rendered only when the home has ≥1 active `weather_station`:

**New component `src/components/StationWeatherPanel.tsx`** (`data-testid="station-weather-panel"`):

- **Scope switcher** (chips, `data-testid="station-scope-<home|locationId>"`): "Whole
  home" plus one chip per location that has a station. Home-assigned only ⇒ no chips
  (just the panel). Location-assigned only ⇒ chips per location, defaulting to the
  freshest. (Ticket: home panel in P1; the flick-between-locations switcher is P3.)
- **Current conditions grid** from the client `effectiveWeather` merge: temp, feels/humidity,
  wind + gust + direction, rain rate + rain today, pressure, UV. Each datum shows a
  subtle **source badge** when it came from API fallback (`data-testid="station-datum-<field>"`,
  badge `…-source-api`) so mixed-capability stations are honest about provenance.
- **Freshness line**: station name + "updated N min ago"; whole panel greys and shows
  an "API fallback — station last seen …" note when the reading is older than the
  freshness cutoff (same visual rule as the soil chip's stale state on Home overview).
- Reads: `devices` (already RLS-readable) + `latest_device_readings` RPC + the
  `weather_snapshots` data the tab already has. No new edge function for display.

Everything below the panel (7-day strip, hourly chart, Garden Intelligence, alerts) is
unchanged and stays API-sourced.

Devices-tab UI (same phase as ingest):

- `wizard/Step1DeviceType.tsx` — third card **Weather Station** (`data-testid="device-type-weather_station"`);
  `Step2Brand` filters to Ecowitt (+ Custom in P3).
- `DeviceCard` — station chips (temp / humidity / wind) via `src/lib/integrations/readingChips.ts`.
- `DeviceDetailModal` — new `StationReadingsPanel` (latest reading grid) + `HistoryChart`
  station series (temp / rain / wind) fed by the widened aggregate RPC.
- `DeviceSettingsModal` — for `weather_station`: location select relabelled with a
  "Whole home" first option (maps to `location_id: null`), area picker hidden,
  `area_id` forced null on save.

---

## 8. Cron / polling changes

| Job | Change |
|---|---|
| `integrations-ecowitt-cron-poll` (15 min) | Also select `device_type = 'weather_station'` devices; per-MAC fetch is unchanged (`call_back=all` already returns the outdoor blocks); parse via `ecowittWeatherFields.ts`; `insertReading` one `WeatherStationReading` per station. Battery + `last_seen_at` handled by the shared helper. |
| `integrations-ecowitt-poll` (manual "Sync now") | Same extension — shared parsing path. |
| `sync-weather` (hourly) | Add `current=…` params to the Open-Meteo fetch (§5.4). **No other change** — API snapshots stay per-home and remain the prediction source even for station homes. |
| `analyse-weather` | **No change** (alerts stay API-driven, §6.4). |
| `evaluate_automations_on_reading` DB trigger | Widen the soil-reading gate to also fire for weather-station-shaped readings, so station leaves are event-driven (~1 s latency), not just 15-min-sweep. |
| `prune-app-logs` | No change — station readings ride the existing 30-day `device_readings` retention (fine: automations need only "latest"; charts show ≤30d, same as soil). |

No new cron jobs.

---

## 9. Migrations (with grants)

One new migration, e.g. `supabase/migrations/20260930000000_weather_station_devices.sql`
(timestamp at implementation time; apply locally via `supabase migration up` first,
`supabase db push` only on explicit go-ahead):

1. `ALTER TABLE devices DROP CONSTRAINT devices_device_type_check;` →
   `ADD CONSTRAINT devices_device_type_check CHECK (device_type IN ('water_valve','soil_sensor','weather_station'));`
   (same pattern as the `custom_http` provider widening in `20260723000000`).
2. `CREATE OR REPLACE FUNCTION aggregate_device_readings(...)` — add the
   `weather_station` branch (AVG temp_c / humidity_pct / wind_kph / pressure_hpa,
   MAX wind_gust_kph / uv_index / rain_today_mm per bucket). Return shape gains the
   station columns (NULL for other families) — additive, existing callers unaffected.
3. `CREATE OR REPLACE FUNCTION` for the `evaluate_automations_on_reading` trigger fn —
   widen its family gate to include weather-station readings.

**Grants:** no new tables are created, so no new Data API grants are required (the
existing `devices` / `device_readings` grants/RLS are grandfathered and unchanged). If
review decides any helper becomes a new SQL function callable from the client, it gets
`GRANT EXECUTE … TO authenticated` in the same migration (the aggregate + trigger fns
above are service-side; the aggregate already carries its grant from `20260521000000`).

---

## 10. Phasing — three shippable phases

**Phase 1 — Ingest + display (home scope).** Migration (§9); `providerTypes.ts` +
`ecowittWeatherFields.ts` parser; Ecowitt connect discovery + poll/cron-poll extension;
wizard Weather Station type; DeviceCard/DetailModal/SettingsModal (home/location
assignment stored, area hidden); `_shared/effectiveWeather.ts` + `src/lib/effectiveWeather.ts`;
`sync-weather` `current=` params; **Weather tab StationWeatherPanel (home-assigned
view, per-datum source badges, freshness/stale state)**. Shippable: connect a station,
see live station weather on the Weather tab with API fallback.

**Phase 2 — Automations.** `station` leaf in both conditionTree mirrors +
`ConditionNodeEditor` fields (metric/comparator/value/agg + station picker + location
scope) + `AutomationBuilderModal` ctx (stations list); `evaluate-automations`
`loadStationObsForLeaf` via the resolver; `automationCandidates` station matching;
trigger-fn widening lands with the P1 migration (inert until leaves exist).
Shippable: "notify me when wind > 40 kph", "don't water if ≥5mm actually fell today".

**Phase 3 — Location switching + custom provider.** Weather tab per-location chip
switcher; `custom_http` adapter `weather_station` family (webhook schema,
TestWebhookModal template, WebhookDetailsPanel sample payload); polish (per-device
display-unit prefs if approved, §12.6).

Each phase carries its own tests + doc updates (§11, §12) and deploys independently.

---

## 11. Risks, edge cases, alternatives

- **Unit conversions (highest risk).** Ecowitt cloud returns account-configured units
  (often imperial). Mitigation: request metric via the API's unit params where
  supported, honour `{value, unit}` sidecars (the flattener already preserves them for
  soil temps), convert F→C / inHg→hPa / mph→kph / in→mm in the parser, and value-range
  heuristics as last resort (pattern proven by `ecowittFields.ts` temp handling).
  Dedicated Deno test matrix.
- **Staleness / offline stations.** 45-min freshness cutoff; stale ⇒ per-datum silent
  API fallback in automations, explicit grey + "API fallback" note in UI. An offline
  station therefore degrades to exactly today's behaviour — never to "no weather".
- **Multiple stations in one scope.** Deterministic freshest-wins (§3.2). Alternative
  considered — hard-block a second station per scope at save time — rejected: gateways
  legitimately coexist (e.g. replacing hardware), and freshest-wins self-heals.
- **`rain_today_mm` midnight semantics.** The gauge accumulator resets at the
  *gateway's* local midnight, which may differ from `homes.timezone`. Acceptable for
  v1 (documented in the leaf helper copy); alternative (summing `device_readings`
  deltas over a trailing window) noted as a follow-up if it bites.
- **Event-path load.** Station readings arrive via the 15-min poll (not a webhook
  storm), so the widened INSERT trigger adds ≤4 evals/hour/station; cooldowns + run
  limits bound firing as today.
- **Reading-shape ambiguity.** `isWeatherStationReading` is presence-based like the
  existing guards; a station payload never carries `soil_moisture` or `state`, so the
  three families stay disjoint.
- **No `current` block in old snapshots.** The merge tolerates its absence (falls back
  to nearest-hour interpolation) so nothing breaks between deploy and the next
  sync-weather pass.
- **Alternative considered — new `weather_station_readings` table:** rejected (§3.1).
- **Alternative considered — extend the `sensor` leaf with station metrics:** rejected
  (§6.1) — different device family, different scoping rule (location vs area), and it
  would couple the soil picker UI to station devices.

---

## 12. Open questions for the human (please answer on the ticket)

1. **Freshness cutoff** — is 45 min (poll cadence ×3) the right default for "station
   reading still counts"? Configurable constant either way.
2. **Multiple stations per scope** — confirm freshest-wins (vs blocking a second
   station per home/location at save time).
3. **Forecast leaves stay API-only** — confirm the §6.4 recommendation: `weather`
   (rain_forecast/heatwave) leaves never swap to station data; station "actuals" are
   new leaves. (This is my strong recommendation.)
4. **Station-confirmed alerts** — is enriching `analyse-weather` with station
   confirmation (e.g. closing a rain alert the gauge disproves) wanted as a Phase 4,
   or out of scope entirely?
5. **Dashboard scope** — ticket names the Weather tab only. Confirm the Home dashboard
   header/current-conditions surfaces stay API-driven for now.
6. **Display units** — metric everywhere (matching the app), or per-device display
   prefs like the existing `display_temp_unit` (wind mph, °F)?
7. **Tier gating** — `integrations` is available to ALL tiers today; confirm weather
   stations simply inherit that (no new gate).
8. **Indoor sensors** — Ecowitt gateways also report an `indoor` block; propose we
   ignore it entirely (outdoor-only feature). Confirm.

---

## 13. File-by-file change list

### Migrations
- `supabase/migrations/<ts>_weather_station_devices.sql` — device_type CHECK widening;
  `aggregate_device_readings` station branch; reading-trigger family-gate widening.

### Edge functions / shared (Deno)
- `supabase/functions/_shared/integrations/providerTypes.ts` — `DeviceType` +
  `WeatherStationReading` + `EcowittStationMeta`.
- `supabase/functions/_shared/integrations/contract.ts` — family union pickup,
  `isWeatherStationReading` guard.
- `supabase/functions/_shared/integrations/ecowittWeatherFields.ts` — **new** parser.
- `supabase/functions/_shared/effectiveWeather.ts` — **new** resolver (+ pure merge).
- `supabase/functions/_shared/conditionTree.ts` — `station` leaf kind, summaries,
  `evalStationLeaf`.
- `supabase/functions/_shared/automationCandidates.ts` — station-device matching.
- `supabase/functions/integrations-ecowitt-connect/index.ts` — station discovery.
- `supabase/functions/integrations-ecowitt-poll/index.ts` +
  `integrations-ecowitt-cron-poll/index.ts` — station parse + insert.
- `supabase/functions/evaluate-automations/index.ts` — `loadStationObsForLeaf` +
  leafEval case.
- `supabase/functions/sync-weather/index.ts` — `current=` params.
- (P3) `supabase/functions/_shared/integrations/adapters/customHttp.ts` +
  `integrations-webhook-router` pickup — weather_station family.

### Client (src/)
- `src/lib/integrations/types.ts` (or equivalent) — client reading/device types.
- `src/lib/effectiveWeather.ts` — **new** client merge (pure, Vitest-covered).
- `src/lib/conditionTree.ts` — `station` leaf + `newLeaf` + summaries.
- `src/lib/integrations/readingChips.ts` — station chips.
- `src/components/StationWeatherPanel.tsx` — **new**.
- `src/components/WeatherForecast.tsx` — mount the panel.
- `src/components/integrations/wizard/Step1DeviceType.tsx`, `Step2Brand.tsx`,
  `Step4Discovery.tsx` — Weather Station type + Ecowitt-only brand + discovery rows.
- `src/components/integrations/DeviceCard.tsx`, `DeviceDetailModal.tsx` (+ new
  `StationReadingsPanel.tsx`), `DeviceSettingsModal.tsx`, `HistoryChart.tsx`.
- `src/components/integrations/ConditionNodeEditor.tsx` + `AutomationBuilderModal.tsx`
  — station leaf editor + ctx.stations.
- (P3) `TestWebhookModal.tsx`, `WebhookDetailsPanel.tsx`.

### Tests
- **Deno** (`supabase/tests/`): `ecowittWeatherFields.test.ts` (unit matrix, sidecars,
  missing fields, battery); `effectiveWeather.test.ts` (per-datum merge, freshness,
  scope precedence); extend `conditionTree.test.ts` (station leaf eval/summaries) and
  `automationCandidates.test.ts` (station device matching).
- **Vitest** (`tests/unit/lib/`): client `conditionTree` station summaries;
  `effectiveWeather` merge; `readingChips` station chips.
- **Playwright** (`tests/e2e/specs/` + page objects): wizard offers Weather Station;
  station DeviceCard + settings home/location assignment (area hidden); Weather tab
  station panel renders seeded station data with API-fallback badges + stale state;
  automation builder station leaf round-trips; (P3) location switcher.
- **Seeds:** new `supabase/seeds/13_integrations.sql` — one integration + one
  weather_station device (+ one location-assigned in P3) + fresh `device_readings`
  rows per worker account, `CURRENT_TIMESTAMP`-relative, idempotent; new fixed-UUID
  prefix registered in `docs/e2e-test-plan/01-seeded-fixtures.md` and CLAUDE.md's
  seed table.

### Docs to update (same task as each phase)
- App-reference: `99-cross-cutting/09-data-model-integrations.md`, `27-weather.md`,
  `10-edge-functions-catalogue.md`, `11-cron-jobs.md`,
  `07-management/05-integrations-devices.md`, `06-integrations-automations.md`,
  `02-dashboard/04-weather-tab.md` (both roles each; StationWeatherPanel documented
  inside the Weather Tab file — no new surface file needed unless review prefers one).
- Test docs: relevant `docs/e2e-test-plan/<NN>-*.md` rows, `01-seeded-fixtures.md`,
  `TESTING.md` inventory + counts.
- `release-notes.json` at deploy time per the release-notes workflow.
