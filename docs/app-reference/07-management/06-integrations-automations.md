# Integrations — Automations Tab

> The Automations sub-tab inside Integrations. Two flavours: **time-scheduled** (fire daily at a clock time, control valves, optionally tied to task blueprints) and **sensor-triggered** (fire when a soil sensor reading crosses a threshold, fan out to notifications + valves). Tapping "+ New automation" opens a mode picker; editing routes to the matching builder.

**Route:** `/integrations?tab=automations`
**Source files:**
- `src/components/integrations/AutomationsSection.tsx` — list + mode picker
- `src/components/integrations/AutomationCard.tsx` — per-automation card
- `src/components/integrations/AutomationModal.tsx` — time-scheduled builder (~700 lines)
- `src/components/integrations/SensorAutomationModal.tsx` — **Phase 3 (2026-06-16)** sensor-triggered builder
- `src/components/integrations/AutomationRunHistory.tsx` — run history
- `supabase/functions/run-automations/index.ts` — time-scheduled cron runner (hourly)
- `supabase/functions/evaluate-automations/index.ts` — the unified 5-min automation engine (formerly `evaluate-sensor-automations`)
- `src/components/integrations/AutomationBuilderModal.tsx` + `ConditionNodeEditor.tsx` — the unified builder
- `src/lib/conditionTree.ts` + `src/lib/automationTemplates.ts` — tree summary + modular templates
- `supabase/functions/_shared/automationEvaluator.ts` — **Phase 3** pure rule + cooldown logic, exercised by `supabase/tests/automationEvaluator.test.ts`

---

## Quick Summary

### Unified condition builder (2026-06-17, Phase 2)

"+ New automation" and edit both open **one** `AutomationBuilderModal` — a free **condition tree** (AND/OR groups + per-condition **is/isn't**) of leaves (sensor reading · time/day with per-day slots incl. overnight · **date range** · task due · weather rain/heat) plus an ordered **actions** list (open/close valve, notify, complete task) and a cooldown.

**Date range leaf (2026-06-18):** a calendar window `{ from, to }` as `"MM-DD"` that **recurs every year** (e.g. *1 Jan → 9 Jan*, or a whole month). `to < from` wraps the year end (e.g. southern-hemisphere summer `12-01 → 02-28`). The builder offers **season preset chips** (Spring/Summer/Autumn/Winter) that fill the dates hemisphere-aware via `getSinglePeriodRange` (`src/lib/seasonal.ts`) — the modal derives hemisphere from the home's latitude/timezone (`hemisphereForHome`). Engine eval: pure `isWithinDateRange(now, from, to, tz)` in `_shared/conditionTree.ts`; helpers in `src/lib/dateRangeLeaf.ts`. It saves `trigger_kind='condition'` + `trigger_logic jsonb`. Components: `AutomationBuilderModal.tsx`, recursive `ConditionNodeEditor.tsx`, pure `src/lib/conditionTree.ts` (`summariseTree`, `newLeaf`/`newGroup`). The two legacy modals (`AutomationModal`, `SensorAutomationModal`) + the mode picker were **removed** (Phase 3); existing automations were auto-converted to trees (incl. inactive ones — the 5-min engine converts all then fires only active) and now open in the unified builder. The card shows a plain-English `summariseTree` of the condition. Runtime is owned by the 5-min unified engine — see [Cron Jobs](../99-cross-cutting/11-cron-jobs.md) + `_shared/conditionTree.ts`.

### Legacy trigger kinds (read-only, pre-Phase-2)

Each legacy automation has a **trigger_kind**:

### Weather handling (`weather_mode`, both kinds, 2026-06-17)

Every automation now picks how it reacts to rain via **`weather_mode`** (supersedes the legacy `skip_if_rained` boolean, which is back-filled to `'skip'`):

- **`off`** — ignore the forecast.
- **`skip`** — hard-skip the run when meaningful rain is forecast (today's behaviour).
- **`defer`** (Smart) — **defer-and-recheck**: hold watering, then re-read the moisture sensor and water only if the rain under-delivered. The moisture sensor is the source of truth; weather can only *defer*, never silently cancel.

Defer config columns: `weather_min_probability`, `weather_defer_window_hours`, `critical_threshold_value` (failsafe floor — waters regardless of forecast), `max_defers`, `defer_skip_in_heat` (heatwave: water anyway vs keep waiting). Single-pending deferral state lives on the row: `defer_until`, `defer_count`, `defer_started_at` (one deferral per automation — five forecast showers collapse to one hold, no per-event conflict). Resolved by the 5-min `evaluate-sensor-automations` loop, which now processes **sensor_threshold rules AND any automation with a pending `defer_until`** (so scheduled valve automations can defer too — they recheck via the area's soil sensors). `run-automations` hands a scheduled `defer` automation to that loop instead of hard-skipping. New `automation_runs` statuses: `deferred_weather`, plus fire reasons `critical_low` / `forecast_underdelivered`. Builder degrades `defer`→`skip` when no moisture sensor is reachable. See [docs/plans/hybrid-weather-sensor-automations.md](../../plans/hybrid-weather-sensor-automations.md), [Weather](../99-cross-cutting/27-weather.md).

### `time_scheduled` (existing)

- Fires daily at a `scheduled_time`.
- Opens one or more valves for `duration_seconds`.
- Optionally fires valves sequentially (one at a time).
- Weather handling via `weather_mode` (off / skip / Smart-defer) — see above.
- Optionally retries on provider failure.
- Optionally ties to one or more `task_blueprints`:
  - **Controlling**: completing this blueprint task triggers the automation immediately.
  - **Driven**: when the automation runs, it auto-completes the linked blueprint task.

### `sensor_threshold` (Phase 3, 2026-06-16)

- Picks an optional **area** — when set, the sensor + valve pickers filter to devices linked to that area.
- Picks **one or more sensors** via the `automation_sensors` join.
- Builds a **rule**: `sensor_metric` ∈ `{soil_moisture, soil_temp_c, soil_ec}` · `sensor_comparator` ∈ `{>, >=, <, <=}` · `sensor_threshold_value` · `sensor_hysteresis` (margin past threshold before firing, default 0) · `sensor_cooldown_minutes` (gap between successive fires, default 60).
- For multi-sensor automations, `sensor_agg_mode` ∈ `{any, all, average}` decides whether the rule needs ANY linked sensor to satisfy, ALL to satisfy, or the AVERAGE across sensors to satisfy.
- **Actions** — an ordered `automation_actions` list. Three kinds:
  - `notification` — push to every `home_member` via the existing `notifications` table (custom title + body or fall back to the automation's name).
  - `valve_open` — enqueues a `turn_on` on `automation_valve_queue`, **and (2026-06-18 fix) when `valve_duration_seconds` is set also enqueues the paired `turn_off` at `fire_at + duration`** so the valve actually closes after its run time. The every-5-min `drainValveQueue` step in `run-automations` cron talks to eWeLink to fire both. Row-building is the pure `_shared/valveQueueRows.ts` (`buildValveQueueRows`, Deno-tested). Previously the engine enqueued only the `turn_on`, so valves stayed open indefinitely.
  - `valve_close` — same pattern with `turn_off` (no paired event).
  - `complete_task` — **(Batch B, 2026-06-18)** marks today's (or overdue) Pending/Postponed task(s) for the linked `target_blueprint_id` Completed (`auto_completed_reason='automation'`). This is the **only** way an automation completes a task now: the implicit "driven" blueprint auto-completion was retired — existing `driven` links were migrated to explicit `complete_task` actions and the `automation_blueprints` driven rows deleted. A task can still **trigger** an automation via the `task_due` condition leaf without being completed.

Each run writes an `automation_runs` row; the card shows the last-run status pill.

### Batch B features (2026-06-18)

- **Location / area scope** — `automations.location_id` + `area_id`. The builder's Scope picker filters the sensor + valve pickers to the chosen area (already-selected devices are always retained, even if out of area — `src/lib/automationDeviceScope.ts`). The card shows a location/area chip.
- **Why it ran** — on fire, `evaluate-automations` writes `automation_runs.trigger_reason = { summary, matched }` (the satisfied condition leaves, via `summariseSatisfied` in `_shared/conditionTree.ts`). `AutomationRunHistory` shows "Fired because: …".
- **Run limit** — `automations.run_limit_count` per `run_limit_window_hours` (NULL = unlimited). Before firing, the engine counts fired runs (`FIRED_STATUSES`) in the rolling window (`_shared/runLimit.ts`); over-limit ticks record a `skipped_rate_limited` run and don't fire. Those skips are **collapsed into one rolling row** rather than flooding (see "Run-status visibility" below). The card shows a "≤ N/Hh" chip. Note this is a rolling-window **cap**, not a scheduler: with repeat-while-true firing an automation fires up to the cap (≈ a cooldown apart) then waits until the earliest of those fires ages out of the window.

### Repeat-while-true firing, default run window + searchable pickers (2026-06-19)

Three changes from watering-automation feedback:

- **Repeat-while-true firing.** `shouldFire` (`_shared/conditionTree.ts`) no longer fires only on the rising edge. While the condition tree stays true (e.g. soil staying below a moisture threshold) it **re-fires every cooldown** (`sensor_cooldown_minutes`, default 60) instead of once — so a "water when dry" rule keeps watering until the soil recovers. The per-window **run-limit** (`run_limit_count` / `run_limit_window_hours`) still bounds the number of fires. `condition_was_true` is still tracked for bookkeeping but no longer gates the decision. **Behaviour change:** continuously-true automations that previously fired once now repeat — review wide-slot time automations + set a run-limit if needed.
- **Home default run window.** New `homes.automation_window_start` / `automation_window_end` / `automation_window_enabled` (migration `20260803000000`, default **08:00–20:00, enabled**). `evaluate-automations` applies it ONLY to automations whose tree has **no** time/`date_range` leaf of its own — those run only inside the window (gating firing, not the `condition_was_true` bookkeeping). Automations with their own time/date condition bypass it; disabling the window restores 24/7. Logic is the pure `_shared/automationWindow.ts` (`treeHasOwnSchedule`, `isWithinWindow`, `defaultWindowOpen`). Edited via the **Automation defaults** card (`AutomationDefaultsCard.tsx`) at the top of the Automations tab (gated by `automations.manage`). **Behaviour change:** existing no-time automations become daytime-only.
- **Searchable pickers.** The `task_due` trigger leaf + sensor leaf (`ConditionNodeEditor.tsx`) and the `complete_task` action's blueprint select (`AutomationBuilderModal.tsx`) gain a search box once the list exceeds 6/8 items, so long task/sensor lists don't clog the builder. An already-selected item is always kept visible when filtered. Pure logic in `src/lib/pickerFilter.ts` (`shouldShowPickerSearch`, `filterPickerItems`).

### Hybrid event-driven engine (2026-06-19)

`evaluate-automations` is now **hybrid** (migration `20260807000000`, design in [docs/plans/hybrid-automation-engine.md](../../plans/hybrid-automation-engine.md)). Same function, three scopes (pure `_shared/automationCandidates.ts`): an **event path** (a `device_readings` INSERT trigger fires it scoped to that device → sensor automations react in ~1 s, not at the next cron tick), a **5-min `{scope:"time"}` cron** (clock-driven automations only — time/date/weather), and a **15-min `{scope:"all"}` safety sweep** (everything; cooldown/run-limit aging + catch-all). Pure-sensor automations (no time/weather leaf) leave the 5-min cron — their re-fire is event-driven + the 15-min sweep (worst-case ~15 min aging latency vs 5 min before). See [Cron Jobs](../99-cross-cutting/11-cron-jobs.md).

### Run-status visibility + complete_task chips (2026-06-19)

- **Rate-limited skips were invisible.** `automation_runs_status_check` only allowed `pending/success/partial/failed/skipped_weather/skipped_no_tasks`, but the engine writes `skipped_rate_limited` (run-limit gate) and `deferred_weather`. Those INSERTs silently violated the constraint, so a correctly rate-limited automation showed **no** run-history entry and looked broken. Migration `20260806000000` widens the constraint to every status the code writes; `evaluate-automations` now logs the insert error if one ever fails again. `AutomationRunHistory` already renders `skipped_rate_limited` as a **"Rate limited"** chip, so the reason is now visible.
- **Rate-limited skips no longer flood the history (2026-06-19 follow-up).** Because `shouldFire` is now repeat-while-true (it ignores `condition_was_true`) AND the engine is event-driven (~1 s per reading), a rate-limited automation was logging a *fresh* `skipped_rate_limited` row on every tick while its condition stayed true — burying the real runs (the UI shows only the last 10). The engine now **collapses** consecutive rate-limited skips into a single rolling row: if the latest run is already `skipped_rate_limited` it **updates** that row (refreshing `triggered_at`/`completed_at` + bumping `trigger_reason.attempts`) instead of inserting; a real fire breaks the chain, so there's at most one skip row between fires. `AutomationRunHistory` renders it as "Run limit reached · retried N×". Pure decision helpers in `_shared/runLimit.ts` (`shouldCollapseRateLimitSkip`, `nextSkipAttempts`, Deno-tested). The pre-existing backlog was cleared by migration `20260809000000` (keeps the newest skip per automation; never deletes real runs). The dead `condition_was_true = true` write on the skip path (a no-op since repeat-while-true landed) was removed.
- **`complete_task` action picker** is now task_due-style **toggle chips + search** (`BlueprintActionSelect` in `AutomationBuilderModal.tsx`) instead of a dropdown, using the shared `pickerFilter`.

### AI Area Coach linkage (2026-06-18 fix)

The Area Coach (`area-sensor-analysis`) lists an area's automations found via `automations.area_id` **and** via device links to the area's devices. Device links are collected from **both** `automation_devices` (legacy) **and** `automation_actions.target_device_id` (unified condition builder — `_shared/automationAreaLinks.ts` `uniqueAutomationIds`). Previously only `automation_devices` was checked, so condition automations with a valve in the area but no `area_id` were missed.

---

## Role 1 — Technical Reference

### Component graph

```
AutomationsSection
├── New Automation button
├── List of AutomationCard
│   ├── Header (name, active toggle, last-run pill)
│   ├── Devices summary
│   ├── Schedule + duration
│   ├── Blueprint links (controlling / driven)
│   ├── Edit button
│   └── Delete button
└── AutomationModal (builder)
    ├── Name input
    ├── Devices selector (valves from this home)
    ├── Schedule time picker
    ├── Duration input
    ├── Sequential fire toggle
    ├── Skip if rained + threshold
    ├── Retry on failure toggle
    ├── Blueprint links section
    └── Run history (AutomationRunHistory)
```

### `AutomationFull` shape

```ts
{
  id, home_id, name, is_active,
  scheduled_time, duration_seconds,
  fire_valves_sequentially, skip_if_rained, rain_threshold_mm, retry_on_failure,
  last_run_date,
  devices: [{ device_id, device_name }],
  blueprints: [{ blueprint_id, blueprint_title, role: "controlling" | "driven" }],
  lastRun: { id, status, triggered_at, triggered_by } | null,
}
```

### Props

| Prop | Type | Source | Purpose |
|------|------|--------|---------|
| `homeId` | `string` | IntegrationsPage | Scope |
| `canManage` | `boolean` | IntegrationsPage | Gates create/edit/delete |
| `canRun` | `boolean` | IntegrationsPage | Gates manual "Run now" |

### Data flow — read paths

```ts
supabase.from("automations")
  .select(`
    *,
    automation_devices(device_id, devices(id, name)),
    automation_blueprints(blueprint_id, role, task_blueprints(title))
  `)
  .eq("home_id", homeId)
  .order("created_at");

supabase.from("automation_runs")
  .select("id, automation_id, status, triggered_at, triggered_by")
  .in("automation_id", ids)
  .order("triggered_at", { ascending: false });
```

### Data flow — write paths

| Action | DB / function |
|--------|--------------|
| Create | `automations.insert(...)` + `automation_devices.insert(...)` + `automation_blueprints.insert(...)` |
| Edit | `automations.update(...)` + diff-update of join tables |
| Toggle active | `automations.update({ is_active })` |
| Delete | `automations.delete()` (cascades join tables) |
| Manual run | `run-automations` edge fn invoked with `automationId` |

### Edge functions invoked

| Function | Purpose |
|----------|---------|
| `run-automations` | Fires due automations; called both by cron and on manual run |

### Cron / scheduled jobs

| Cron | Effect |
|------|--------|
| `run-automations` | Every 1 minute — checks for due automations |
| `analyse-weather` | Sets rain totals consumed by skip-if-rained |

### Realtime channels

None.

### Tier gating

None.

### Beta gating

None.

### Permissions

- `automations.manage` — create/edit/delete.
- `automations.view` — read.

### Error states

| State | Result |
|-------|--------|
| Provider failure | `automation_runs.status = "failed"`; retry if enabled |
| No devices selected | Builder validation error |
| Skip-if-rained triggered | `automation_runs.status = "skipped"`; no provider call |

### Performance

- Cron runs every minute but only fires due automations.
- Sequential fire serialises valve open commands; parallel fires them concurrently.

### Linked storage buckets

None.

---

## Role 2 — Expert Gardener's Guide

### Why use automations

If you've installed smart valves, automations are the difference between "I have to remember" and "Rhozly does it". Set up once: water bed 1 for 5 minutes at 6:30 AM, skip if rain forecast >5mm, retry once if my Wi-Fi flakes.

### Every flow on this tab

#### 1. New automation

- Name + pick valves.
- Schedule time + duration.
- Sequential vs parallel firing.
- Skip-if-rained threshold (e.g. 5mm).
- Retry-on-failure toggle.
- (Optional) link to task blueprints:
  - **Controlling**: tick the watering task → automation runs immediately.
  - **Driven**: automation runs → auto-tick the watering task.

#### 2. Edit / delete

- Pencil → modal.
- Trash → confirm.

#### 3. Toggle active

- Switch per card. Off = won't run.

#### 4. Last run

- Card shows last run status: ran / skipped (rain) / failed / never.

#### 5. Run history

- Inside the edit modal — full audit trail (`AutomationRunHistory`). It summarises each run via the pure `src/lib/automationRunSummary.ts` (`summariseAutomationRun`), which tolerates **both** `automation_runs.devices_triggered` shapes — the condition engine's object `{ notifications, valves_queued }` and the legacy runner's per-device array. (2026-06-18 fix: the view used to call `.filter()` assuming the array shape and crashed on the object.) Unknown statuses render a neutral chip instead of a spinner.

### Information on display — what every field means

| Field | Meaning |
|-------|---------|
| Schedule time | When it fires (in home timezone) |
| Duration | Seconds the valve stays open |
| Sequential | Valves open one at a time (water pressure) vs all at once |
| Skip if rained | Don't fire if recent rain exceeds threshold |
| Retry | One additional attempt on provider failure |
| Last run pill | Status badge: ran / skipped / failed |

### Tier-by-tier experience

Same for every tier.

### Common mistakes / pitfalls

- **Setting duration too long.** Watering for 20 minutes daily floods the bed. Start with 3–5 minutes and adjust.
- **Skip-if-rained too low.** 1mm threshold means almost every drizzle skips. 5mm is a sensible default.
- **Parallel firing on weak water pressure.** Multiple valves open at once may underflow. Use sequential.
- **Forgetting to enable.** New automations default off — toggle on.

### Recommended workflows

- **Set up:** create one automation per bed → start with conservative durations → adjust weekly.
- **Mid-season:** review run history for failures — provider sync issues usually surface here.
- **End of season:** disable rather than delete; re-enable in spring.

### What to do if something looks wrong

- **Automation didn't run:** check `automation_runs` for that date. If "skipped", check rain threshold. If "failed", check valve provider connection.
- **Valves opened but no water:** Wi-Fi reached the valve but valve itself jammed. Manual check needed.
- **Repeated failures:** OAuth token may have expired. Re-run Connect from the Devices tab.

---

## Related reference files

- [Integrations — Devices Tab](./05-integrations-devices.md)
- [Integrations — Soil Readings](./07-integrations-readings.md)
- [Blueprint Manager](../04-planner/07-blueprint-manager.md)
- [Cron Jobs (cross-cutting)](../99-cross-cutting/11-cron-jobs.md)
- [Data Model — Integrations (cross-cutting)](../99-cross-cutting/09-data-model-integrations.md)

## Code references for ongoing maintenance

- `src/components/integrations/AutomationsSection.tsx` — list
- `src/components/integrations/AutomationCard.tsx`
- `src/components/integrations/AutomationModal.tsx` — builder
- `src/components/integrations/AutomationRunHistory.tsx`
- `supabase/functions/run-automations/index.ts` — runner cron
- `supabase/migrations/*_automations.sql` — schema
