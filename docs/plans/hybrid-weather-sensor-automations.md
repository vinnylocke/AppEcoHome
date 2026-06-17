# Hybrid weather + sensor watering automations

## Problem

Today an automation is either:
- **time_scheduled** with an optional **hard skip** if forecast rain ≥ `rain_threshold_mm` (`run-automations` → `checkRain`), or
- **sensor_threshold** that waters when a soil reading crosses a threshold (`evaluate-sensor-automations` → pure `automationEvaluator.ts`).

The user wants a **hybrid**: water when soil moisture is low, *but* be aware of the rain forecast. Two failure modes the current "hard skip" can't handle:

1. **Moisture is low and rain is forecast today** — we'd water (sensor) or we'd skip blindly (scheduled). We actually want to *wait* for the rain.
2. **We skipped for forecast rain, but the rain under-delivered** — soil is still dry and nothing waters it until the next scheduled run. The plant suffers because we trusted a forecast.

Plus the user's sharp follow-up: **if the forecast shows 5 showers across the day and we defer the first, do we conflict with the 2nd–5th?**

## Guiding principle

**The soil moisture sensor is the source of truth; the forecast may only ever *defer* watering, never *cancel* it.** A deferral always ends in a **re-read of the sensor**, so an under-delivered forecast self-corrects. We never compare "forecast mm vs actual mm" — the moisture reading after the rain window already encodes the real outcome.

## Answer to the multi-shower question (drives the design)

**No conflict — because we never create a deferral *per rain event*.** There is exactly **one pending deferral per automation**, stored on the automation row, reasoning over a **time horizon** (the next `defer_window_hours`), not over discrete showers. Five forecast showers collapse into a single fact: "meaningful rain expected in the horizon → defer one recheck to the end of that horizon." The evaluator re-derives the decision from live state every 5 minutes, so the state is **convergent and idempotent**: it can't accumulate five competing deferrals. When the horizon's recheck fires, we look at the soil; if more rain is still forecast beyond it and we're under the `max_defers` cap, we extend the single deferral — we don't stack a new one.

## App-reference consulted

- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — automation model, both trigger kinds, builders, valve queue.
- [07-management/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — automation tables.
- [99-cross-cutting/27-weather.md](../app-reference/99-cross-cutting/27-weather.md) — `weather_snapshots` shape, `fetch`/`sync-weather`.
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `evaluate-sensor-automations` (5 min), `run-automations` drain.
- [99-cross-cutting/13-ai-gemini.md](../app-reference/99-cross-cutting/13-ai-gemini.md) + `area-sensor-analysis` — AI Area Coach recommendations.

## ⚠️ Schema-drift caveat (verified against production)

The migrations folder has drifted from the live DB (we hit this repeatedly building the Area Coach). Live `automations` columns confirmed by introspection:
`id, home_id, name, is_active, tier, scheduled_time, duration_seconds, fire_valves_sequentially, skip_if_rained, rain_threshold_mm, retry_on_failure, last_run_date, created_at, updated_at, trigger_if_hot, heat_threshold_c, trigger_kind, area_id, sensor_metric, sensor_comparator, sensor_threshold_value, sensor_hysteresis, sensor_cooldown_minutes, sensor_agg_mode, sensor_last_fired_at`.
Weather snapshot (`sync-weather`) carries **daily**: `precipitation_sum`, `precipitation_probability_max`, temps, wind; **hourly**: `precipitation_probability`, temp, humidity, wind, code. **No hourly mm.** Before implementing, re-introspect to confirm no new columns collide.

## Design

### 1. A per-automation "weather mode" (applies to BOTH trigger kinds)

Every automation — time_scheduled **and** sensor_threshold — picks how weather interacts, via a single selector:

| `weather_mode` | Meaning |
|----------------|---------|
| `off` | Ignore the forecast entirely. |
| `skip` | **Skip the whole run** when meaningful rain is forecast (today's hard-skip; generalises `skip_if_rained`). No recheck. |
| `defer` | **Hybrid defer-and-recheck** — hold watering, then re-read the moisture sensor and water if the rain under-delivered. |

`defer` requires a moisture sensor the automation can re-read. A sensor_threshold automation already has one; a time_scheduled valve automation can use a soil sensor **in the same area** (the user's planter has both a valve and sensors). If `defer` is chosen but no sensor is reachable, the builder degrades it to `skip` and tells the user why.

New per-automation config columns (used by `skip` + `defer`):

| Column | Purpose |
|--------|---------|
| `weather_mode text default 'off'` | `off` / `skip` / `defer` (CHECK constraint). **Back-fill:** existing `skip_if_rained=true` → `'skip'`. |
| `weather_min_probability int default 60` | Only act if forecast rain confidence ≥ this (`precipitation_probability_max` / hourly probability). |
| `weather_defer_window_hours int default 12` | (defer) look-ahead horizon + how far out the recheck is scheduled. |
| `critical_threshold_value numeric` | (defer) **failsafe floor** — water regardless of forecast below this. Defaults a margin below `sensor_threshold_value`. |
| `max_defers int default 2` | (defer) cap on consecutive deferrals per dry episode. |
| `defer_skip_in_heat boolean default true` | (defer) **user's choice** — when a heatwave is forecast, `true` = stop deferring and water anyway; `false` = keep waiting for rain. |

Reuse existing **`rain_threshold_mm`** ("how much rain counts": daily `precipitation_sum ≥ this"). The legacy `skip_if_rained` boolean is superseded by `weather_mode='skip'` (kept and back-filled for compatibility).

### 2. Single deferral state (one pending per automation)

Stored on the automation row (guarantees no per-event conflict):

| Column | Purpose |
|--------|---------|
| `defer_until timestamptz` | When to re-read the sensor. NULL = not currently deferred. |
| `defer_count int default 0` | Deferrals in the current dry episode; reset to 0 on water or on recovery. |
| `defer_started_at timestamptz` | Start of the current deferral episode (for "max defer duration" + audit). |

### 3. Two-tier thresholds = the failsafe

- **Comfortable-low** = `sensor_threshold_value` (e.g. moisture < 30%): deferrable — ok to wait for rain.
- **Critical-low** = `critical_threshold_value` (e.g. < 18%): water **now**, ignore forecast.

So a plant only ever *waits* on rain while it still has buffer; once genuinely thirsty, weather is overruled.

### 4. Evaluator decision logic (pure, in `automationEvaluator.ts`)

Add `evaluateHybrid(...)` (or extend `evaluateAutomation`) taking the existing rule + `criticalThreshold`, a `WeatherDeferInputs` (`{ rainMm, rainProbabilityMax, deferWindowEnd }`), and the current `{ deferUntil, deferCount }`. New outcomes:
`defer(until, reason)` and `fire(reason: "critical_low" | "forecast_underdelivered" | "rule_satisfied")`.

Per 5-min tick:
1. **Cooldown gate** (unchanged).
2. **Not rule-satisfied** (moisture recovered to ≥ comfortable) → `skip: rule_not_satisfied`; **clear defer state**.
3. **Rule satisfied** (moisture low) — branch on `weather_mode`:
   - a. `off` → `fire: rule_satisfied` (today's behaviour).
   - b. `skip` → meaningful rain forecast (`rainMm ≥ rain_threshold_mm` & `probability ≥ weather_min_probability`)? yes → `skip: weather_skip` (no recheck); no → `fire: rule_satisfied`.
   - c. `defer`:
     - value ≤ **critical** → `fire: critical_low`; clear defer.
     - heatwave forecast **and** `defer_skip_in_heat` → `fire: rule_satisfied` (water through heat); clear defer.
     - currently deferred & `now < deferUntil` → `skip: still_deferred` (hold).
     - currently deferred & `now ≥ deferUntil` (recheck due, still low) → rain still expected in a fresh horizon **and** `deferCount < max_defers` → `defer` again (extend, `deferCount++`); else → `fire: forecast_underdelivered`; clear defer.
     - not deferred: meaningful rain forecast in window **and** `deferCount < max_defers` → `defer(until = deferWindowEnd)`, `deferCount++`, stamp `defer_started_at`; else → `fire: rule_satisfied`.

The caller stamps `sensor_last_fired_at` on fire, writes/clears `defer_until/defer_count/defer_started_at`, enqueues valve commands + notifications, and writes an `automation_runs` row with new statuses (`weather_skip`, `deferred_weather`, `watered_failsafe`, `watered_forecast_missed`).

**Unified deferral processor.** A `defer`-mode **time_scheduled** automation still triggers on its schedule, but its recheck needs the 5-min loop. So `evaluate-sensor-automations` is generalised to process **(a)** every `sensor_threshold` rule and **(b)** any automation (incl. time_scheduled) that has a pending `defer_until`. That keeps a single place that owns deferral state.

### 5. The recheck window (`deferWindowEnd`) from the data we have

Pure helper `computeRainWindow(snapshot, now, windowHours, minProbability)`:
- Walk **hourly** `precipitation_probability` for the next `windowHours`. The window end = the **last hour with probability ≥ minProbability**, **+ an infiltration buffer** (default +2h, since rain takes time to reach the root zone).
- If no qualifying hour (or hourly missing) → fall back to `now + windowHours` (or end of local day).
- "Is rain meaningful?" uses **daily** `precipitation_sum ≥ rain_threshold_mm` AND `precipitation_probability_max ≥ minProbability`.

**Optional enhancement (recommended):** add hourly `precipitation` to the `sync-weather` Open-Meteo request so we can sum **expected mm inside the window** instead of leaning on the daily total. Small, isolated change to `sync-weather` + `weather_snapshots` consumers.

### 6. Heat interaction — the user's choice

A per-automation toggle `defer_skip_in_heat` decides what happens to **deferral** when a heatwave is forecast (today's max-temp ≥ `heat_threshold_c`):
- `true` (default) — **stop deferring and water anyway** (hot soil dries faster than light rain replenishes).
- `false` — **keep waiting for rain** even in heat.

Only affects `weather_mode='defer'`; `skip` and `off` are unchanged. Surfaced in the builder as *"During heatwaves: water anyway / keep waiting for rain."*

### 7. Task-blueprint linkage

If a hybrid automation drives `task_blueprints` (like the user's "Strawberry watering" → 4 tasks): a **fire** auto-completes/advances the linked watering task (existing driven behaviour); a **defer** should **postpone** the task's due indicator (not mark it skipped), so the agenda reflects "waiting on rain" rather than "done". Reconcile on the eventual fire.

### 8. UX — persona-aware (BOTH builders)

A "Weather handling" section in **both** `AutomationModal.tsx` (scheduled) and `SensorAutomationModal.tsx` (sensor):
- **Method selector:** Off / Skip if rain / Smart (defer & recheck). `Smart` is disabled with a hint when no moisture sensor is reachable by that automation.
- **Rookie:** the three methods in plain words; choosing Smart applies safe defaults (window 12h, min prob 60%, critical = threshold − 10pts, max 2 defers, "water anyway in heat" on).
- **Expert:** reveal the dials — rain mm, min confidence %, look-ahead hours, critical-low value, max defers, and the heatwave choice (*water anyway* / *keep waiting*).
- Card (`AutomationCard.tsx`) shows the active method + a "🌧️ waiting for rain until HH:MM" pill when `defer_until` is set.

### 9. AI Area Coach integration

`area-sensor-analysis` already reads the area's automations. Extend its prompt so the coach **recommends hybrid settings** ("strawberries in fast-draining mineral soil → critical-low 20%, defer window 12h") and **flags mismatches** ("skip-if-rained at 5mm, but this bed barely responded to last week's 6mm — switch to defer-and-recheck"). The Coach becomes the place that explains and tunes this.

## Files

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_hybrid_weather_defer.sql` (new) | Add `weather_mode` + config + deferral-state columns to `automations`; back-fill `skip_if_rained`→`'skip'`; grants. |
| `supabase/functions/_shared/automationEvaluator.ts` | Add `evaluateHybrid` + `computeRainWindow` (pure). |
| `supabase/functions/evaluate-sensor-automations/index.ts` | Generalise to process sensor rules **and** pending `defer_until` rows; call evaluator; persist defer state; new run statuses. |
| `supabase/functions/run-automations/index.ts` | Scheduled runner honours `weather_mode` (`skip` = today's behaviour; `defer` = hand off to the deferral processor instead of hard-skip). |
| `supabase/functions/sync-weather/index.ts` (optional) | Add hourly `precipitation` to the fetch. |
| `supabase/functions/area-sensor-analysis/index.ts` + `_shared/areaAnalysisPrompt.ts` | Coach recommends/flags weather-mode settings. |
| `src/components/integrations/AutomationModal.tsx` | "Weather handling" selector (scheduled builder). |
| `src/components/integrations/SensorAutomationModal.tsx` | "Weather handling" selector (sensor builder). |
| `src/components/integrations/AutomationCard.tsx` | Active method + "waiting for rain" pill. |
| `src/services/...automations` | Persist new fields. |

## Tests (mandatory)

- **Deno** `automationEvaluator.test.ts` — extend per `weather_mode`: `off` = today's behaviour; `skip` = skips on forecast rain, fires otherwise; `defer` = defers when rain forecast + moisture low, fires on critical-low ignoring forecast, recheck fires `forecast_underdelivered` when still low, recovery clears defer, `max_defers` cap, **five-shower horizon collapses to one deferral** (the user's case); `defer_skip_in_heat` true vs false.
- **Deno** — `computeRainWindow` (last qualifying hour + buffer; fallback when hourly missing; probability gate).
- **Vitest** — `AutomationModal` + `SensorAutomationModal` method selector (Off/Skip/Smart; Smart disabled when no sensor) and rookie-default vs expert-reveal; card method + "waiting for rain" pill from `defer_until`.
- e2e-test-plan + TESTING counts updated.

## App-reference / docs to update

- `07-management/06-integrations-automations.md` — hybrid trigger, defer state machine, new statuses.
- `99-cross-cutting/09-data-model-integrations.md` — new `automations` columns.
- `99-cross-cutting/27-weather.md` — hourly precip (if added) + how defer reads the snapshot.
- `99-cross-cutting/11-cron-jobs.md` — note `evaluate-sensor-automations` now handles deferral (no new cron).
- Area Coach refs (`03-location-manager.md`, `13-ai-gemini.md`) — new recommendations.

## Risks / edge cases

- **Stale forecast:** if `weather_snapshots` is old, treat "no confident rain" → water on comfortable-low (fail safe toward watering, never toward drought).
- **Max defer duration:** cap not just count but elapsed (`defer_started_at` + N hours) so a perpetually-"tomorrow" forecast eventually waters.
- **Cooldown vs defer:** keep cooldown as the outermost gate so a defer→fire can't double-fire within the cooldown.
- **Multi-sensor `agg_mode`:** critical-low check uses the same aggregation as the comfortable threshold.
- **Timezone:** windows computed in the home's tz (snapshot times are ISO; `homes.timezone`).

## Out of scope (follow-ups)

- Using the ecowitt station's own rain gauge (if present) as a second actual-rain signal.
- Per-area "forecast reliability" learning loop that auto-tunes `rain_threshold_mm`.
- `defer` mode for a time_scheduled automation **with no reachable moisture sensor** (nothing to recheck) — the builder degrades it to `skip`; full support would need a virtual/area-fallback sensor.
