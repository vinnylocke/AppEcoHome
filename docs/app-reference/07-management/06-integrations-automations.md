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

"+ New automation" and edit both open **one** `AutomationBuilderModal` — a free **condition tree** (AND/OR groups + per-condition **is/isn't**) of leaves (sensor reading · time/day with per-day slots incl. overnight · task due · weather rain/heat) plus an ordered **actions** list (open/close valve, notify) and a cooldown. It saves `trigger_kind='condition'` + `trigger_logic jsonb`. Components: `AutomationBuilderModal.tsx`, recursive `ConditionNodeEditor.tsx`, pure `src/lib/conditionTree.ts` (`summariseTree`, `newLeaf`/`newGroup`). The two legacy modals (`AutomationModal`, `SensorAutomationModal`) + the mode picker were **removed** (Phase 3); existing automations were auto-converted to trees (incl. inactive ones — the 5-min engine converts all then fires only active) and now open in the unified builder. The card shows a plain-English `summariseTree` of the condition. Runtime is owned by the 5-min unified engine — see [Cron Jobs](../99-cross-cutting/11-cron-jobs.md) + `_shared/conditionTree.ts`.

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
- **Run limit** — `automations.run_limit_count` per `run_limit_window_hours` (NULL = unlimited). Before firing, the engine counts fired runs (`FIRED_STATUSES`) in the rolling window (`_shared/runLimit.ts`); over-limit ticks record a `skipped_rate_limited` run and don't fire. The card shows a "≤ N/Hh" chip.

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
