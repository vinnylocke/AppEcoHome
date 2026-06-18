# Plan — Integrations / Automations feedback batch (10 items)

A triage of the 10 feedback items in the integrations + automations area. Each item
has a root-cause / approach, the files + any migration, and a size (S/M/L). At the end:
a recommended execution order grouped into batches — we implement one batch at a time,
each as its own commit + deploy.

## App-reference consulted

- [`99-cross-cutting/09-data-model-integrations.md`](../app-reference/99-cross-cutting/09-data-model-integrations.md)
- [`07-management/05-integrations-devices.md`](../app-reference/07-management/05-integrations-devices.md)
- [`07-management/06-integrations-automations.md`](../app-reference/07-management/06-integrations-automations.md)
- [`07-management/07-integrations-readings.md`](../app-reference/07-management/07-integrations-readings.md) (area coach)
- [`99-cross-cutting/11-cron-jobs.md`](../app-reference/99-cross-cutting/11-cron-jobs.md)

Engine facts: the **unified condition engine** (`evaluate-automations`, every 5 min)
owns ALL triggers via each automation's `trigger_logic` jsonb tree; `run-automations`
(hourly + every-5-min "drain valve queue") now only drains the valve queue + serves
manual "run now". Actions are an ordered `automation_actions` list
(`notification | valve_open | valve_close`, each with `valve_duration_seconds`). Runs
are audited in `automation_runs`.

---

## The two bugs (clear root cause — do first)

### #4 — Error on automation history drill-down  · **S · bug**
`evaluate-automations` writes `automation_runs.devices_triggered` as an **object**
`{ notifications, valves_queued }` (`evaluate-automations/index.ts:202`), but
`AutomationRunHistory.tsx:65` does `(run.devices_triggered ?? []).filter(...)`,
assuming an **array** (the shape `run-automations` writes). `.filter` on an object
throws → the history view crashes.
**Fix:** make `AutomationRunHistory` tolerant of both shapes (guard with
`Array.isArray`, render a "valves fired / queued + notifications sent" summary for the
object shape) and align the displayed `STATUS_CONFIG` keys with the statuses the engine
actually writes (`ran`, `skipped_rain`, `deferred_weather`, `failed`, …). No migration.
Files: `src/components/integrations/AutomationRunHistory.tsx`. Test: unit render with
both shapes.

### #9 — Valve not turned off after the set time  · **M · bug**
In `evaluate-automations`, a `valve_open` action enqueues a single `turn_on` at
`fire_at = now + stagger` and **reads but never uses `valve_duration_seconds`** to
schedule the close (`evaluate-automations/index.ts:117-125`). The old `run-automations`
path *did* enqueue a paired `turn_off` at `now + duration`
(`run-automations/index.ts:264-272`). So condition-engine valves open and never close.
**Fix:** when enqueuing a `valve_open` that has `valve_duration_seconds`, also enqueue a
paired `turn_off` at `fire_at + valve_duration_seconds` (mirror `fireValves`). The
existing "Drain Valve Queue" 5-min cron then closes it. Files:
`supabase/functions/evaluate-automations/index.ts` (+ shared helper if cleaner). Test:
Deno test asserting a `valve_open` with duration produces both queue rows.
*Note:* drain cadence is every 5 min, so close is accurate to ±5 min — acceptable; if
tighter is wanted that's a separate cron-cadence change.

---

## Automation engine features

### #10 — Task trigger vs. task completion (decouple)  · **M**
Today the `automation_blueprints` "driven" role auto-completes the linked task whenever
the automation runs. Feedback: keep task-as-**trigger** (the `task_due` condition leaf),
but only mark a task **complete** when the user explicitly adds it as an **action**.
**Approach:** add a new action kind `complete_task` (target = blueprint/task) to
`automation_actions`; the builder offers it as an action; `evaluate-automations` handles
it. Stop the implicit "driven" auto-completion (migrate existing "driven" links into an
explicit `complete_task` action so nothing silently changes). Files: migration
(`automation_actions.action_kind` CHECK + optional `target_blueprint_id`),
`evaluate-automations`, `AutomationBuilderModal` + `ConditionNodeEditor`/actions UI,
`conditionTree.ts`/templates, data-model doc. Test: Deno (action fires completion only
when present) + builder unit.

### #5 — History: why it ran / which triggers were satisfied  · **M**
`evaluate-automations` evaluates the condition tree but doesn't persist *which leaves*
were satisfied. **Approach:** capture the matched-condition summary during evaluation
and write it to a new `automation_runs.trigger_reason jsonb` (matched leaves + a
plain-English line via `summariseTree` of the satisfied subset); surface it in
`AutomationRunHistory`. Files: migration (`automation_runs.trigger_reason jsonb`),
`evaluate-automations`, `_shared/conditionTree.ts` (reason builder), history component.
Pairs naturally with #4. Test: Deno (reason captured) + unit (rendered).

### #7 — Max runs per day / per period  · **M**
**Approach:** add `max_runs_per_period int null` + `run_limit_period text` (e.g.
`day|hours_window` with `run_limit_window_hours int`) to `automations`;
`evaluate-automations` counts `automation_runs` in the window before firing and skips
with a new status `skipped_rate_limited`. Builder gets a "Run at most N times per …"
control. Files: migration, `evaluate-automations` (+ `_shared/automationEvaluator.ts`),
builder, data-model doc. Test: Deno (N+1th fire is skipped within window).

### #1 — Link automations to locations & areas  · **S–M**
`automations.area_id` already exists; add `location_id` (FK, nullable) and surface
**both** in the builder (Location → Area pickers, area filters the sensor/valve pickers —
the readings doc already anticipates this). **Approach:** migration adds `location_id`;
builder adds the pickers + filtering; card shows the binding. Files: migration
(`automations.location_id` + grants already present on table), `AutomationBuilderModal`,
`AutomationCard`, data-model + automations docs. Test: builder unit (area filters
device pickers).

---

## Integrations UI

### #6 — Device cards: state + metric chips  · **M**
Show latest **state / moisture / temp / EC** as chips on `DeviceCard` so users don't
open the detail modal to see stats. **Approach:** `DeviceCard` reads the latest
`device_readings` row (or a lightweight latest-reading view) and renders compact chips
(valve → on/off state chip; soil sensor → moisture %, temp °C, EC with the right unit via
`ec_source`). Files: `DeviceCard.tsx`, possibly a small latest-reading fetch in
`IntegrationsPage`/a hook, data unit-formatting from existing `SoilReadingsPanel` logic.
Test: unit render with a sample reading.

### #8 — EC graph on integrations  · **S–M**
`HistoryChart` currently plots temp + moisture only; add an **EC** series (respecting
`ec_source` unit; hide for WH51 raw-ADC or label "relative"). Files:
`src/components/integrations/HistoryChart.tsx` (+ `SoilReadingsPanel` if it hosts the
toggle). No migration (EC already stored). Test: unit (EC series present when data has
`soil_ec`).

### #2 — Search / filter for tasks, sensors, valves, automations  · **M**
Lists will get long. **Approach:** add a search/filter input to the relevant list
surfaces — Devices grid (filter by name/type/area), Automations list (name/status), and
the task lists. Pure client-side filter helpers in `src/lib/` (testable) + a shared
search input. Scope per surface to avoid one mega-change; likely split into its own
sub-batch. Files: `IntegrationsPage`/`AutomationsSection`/task list components + new
`src/lib/filter*` helpers. Test: unit on the filter helpers.

---

## The big one — AI Area Coach metadata

### #3 — Area Coach must compare live data to *saved* plant targets  · **L**
Today the coach (`area-sensor-analysis`) appears to re-derive a plant's ideal
moisture / soil-temp / EC each refresh, so "strawberry requirements keep changing".
**Approach:** persist a **stable per-plant target profile** (ideal/min/max for
soil_moisture, soil_temp_c, soil_ec) — generated once (AI or catalogue), stored against
the plant (e.g. `plants.care_targets jsonb` or a `plant_care_targets` table), and only
re-generated on explicit request. `area-sensor-analysis` then *compares* the area's live
readings against those saved targets (deterministic deviation) and the AI narrates the
comparison rather than re-inventing the numbers each run. Files: migration (targets
store + grants), `area-sensor-analysis/index.ts` + its prompt (`_shared/...`),
possibly a "care targets" surface on the plant, readings/area-coach docs. Test: Deno
(targets stable across runs; comparison uses saved values) + unit on the deviation calc.
*This is the largest item — its own batch, planned in more detail before building.*

---

## Recommended order (batches)

1. **Batch A — bugs:** #4 + #9. Fast, high-value, clear root cause.
2. **Batch B — engine:** #5 + #10 + #7 (+ #1). Related migrations to `automations` /
   `automation_runs` / `automation_actions`; do together to share one migration pass.
3. **Batch C — integrations UI:** #6 + #8 (+ #2 search). Mostly client-side.
4. **Batch D — Area Coach (#3):** its own detailed plan + build (largest).

Each batch = read the touched app-reference, implement, test, update docs + e2e plan,
deploy (`agent-chat`-style targeted function deploys + `deploy-app-only` for client),
commit + push.

## Migrations note

New columns/tables on `automations`, `automation_runs`, `automation_actions`, and the
plant-targets store all need the standard grants
(`GRANT SELECT, INSERT, UPDATE, DELETE … TO authenticated`) and `migration up` locally
before any `db push`.
