# Unified condition-based automations

Replace the two automation *types* (time_scheduled, sensor_threshold) and their
bolted-on modifiers (skip_if_rained, trigger_if_hot, weather-defer) with **one
automation = a free boolean tree of conditions + actions**, evaluated by a
single polling loop and fired on the **rising edge** with a cooldown.

**Decisions (confirmed):** full unified engine · **free boolean tree** (nestable
AND/OR/NOT to any depth) · **auto-convert** existing automations.

## Why this is the right shape

A condition tree subsumes everything we have as composable leaves:
- *"moisture < 30% **AND NOT** rain-soon"* replaces the bespoke **weather-defer**
  engine — the "recheck" is just the next poll: once the forecast window passes
  and soil is still dry, the tree turns true and it waters.
- The two-tier failsafe = *"(moisture < 30 AND NOT rain-soon) **OR** moisture < 18"*.
- *"... AND time inside an enabled slot"* delivers per-day time windows (incl.
  overnight) — points 1 & 2.
- Heat override = *"... OR (moisture < 30 AND heatwave)"*.

Fewer special cases, far more power.

## App-reference consulted

- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md)
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md)
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md)
- [99-cross-cutting/27-weather.md](../app-reference/99-cross-cutting/27-weather.md), `homes.timezone` (IANA, verified live)

## Model

### Condition tree (stored as `automations.trigger_logic jsonb`)

```ts
type ConditionNode =
  | { kind: "group"; op: "and" | "or"; negate?: boolean; children: ConditionNode[] }
  | { kind: "sensor"; negate?: boolean; metric: "soil_moisture"|"soil_temp_c"|"soil_ec";
      comparator: "<"|"<="|">"|">="; value: number; agg: "any"|"all"|"average";
      sensorIds?: string[]; areaId?: string | null }
  | { kind: "time"; negate?: boolean; schedule: WeeklySchedule }
  | { kind: "task_due"; negate?: boolean; blueprintIds: string[] }
  | { kind: "weather"; negate?: boolean; type: "rain_forecast"|"heatwave";
      thresholdMm?: number; minProbability?: number; windowHours?: number; thresholdC?: number };

type WeeklySchedule = { mon: Slot[]; tue: Slot[]; wed: Slot[]; thu: Slot[]; fri: Slot[]; sat: Slot[]; sun: Slot[] };
type Slot = { start: string /* "HH:MM" local */; end: string /* "HH:MM"; end<start ⇒ overnight wrap */ };
```

`negate` is the **is / isn't** flag. Groups give **AND/OR** and nest to any depth.

### Evaluation semantics

- A single **5-min loop** evaluates every active automation's tree.
- Fire actions on the **rising edge** (false→true) gated by a **cooldown** floor,
  so a 12-hour-true time window fires once at its start, and a sustained-dry
  sensor fires once (not every tick). State: `condition_was_true boolean`,
  `last_fired_at timestamptz` (generalise `sensor_last_fired_at`),
  `cooldown_minutes`.
- Pure split: `evaluateTree(node, leafEval)` does only boolean
  composition + negation; `leafEval(leaf)` returns a boolean from already-fetched
  context (sensor readings, local now, due-blueprint set, forecast). All leaf
  logic reuses existing pure helpers (`satisfiesRule`, a new
  `isWithinSchedule`, `readForecast`).

### Context (gathered per automation by the function)

- **sensor** → latest `device_readings` for the leaf's sensor set (explicit
  `sensorIds` or the `areaId`'s soil sensors), aggregated per `agg`.
- **time** → `now` + `homes.timezone` → local weekday/HH:mm vs the schedule.
- **task_due** → set of blueprint ids with a Pending/Postponed task due today.
- **weather** → `readForecast(...)` (rain window / heatwave) from `_shared/weatherForecast.ts`.

## Engine + function

- **`_shared/conditionTree.ts`** (new, pure): types + `evaluateTree` + leaf
  evaluators (`evalSensorLeaf`, `evalWeatherLeaf`, and `isWithinSchedule` for time).
- **`evaluate-automations`** (rename/extend `evaluate-sensor-automations`): every
  5 min, for each `is_active` automation with `trigger_logic`: build context →
  `evaluateTree` → on rising edge + cooldown, fan out actions (existing
  `automation_actions` → notifications + `automation_valve_queue`), write an
  `automation_runs` row, stamp `last_fired_at` + `condition_was_true`. Per-automation
  try/catch. The valve-queue **drain** stays in `run-automations` (unchanged).
- **`run-automations`** scheduled-firing path is **retired** (time becomes a
  condition); it keeps only the valve-queue drain + manual "run now". Manual run
  bypasses the tree (fires actions directly), as today.

This means the old `evaluateAutomation` / `evaluateHybrid` paths are no longer
called; keep the files during transition, remove in the cleanup phase.

## Auto-convert migration (existing → trees)

A one-time backfill (PL/pgSQL function or a TS backfill run once) writes
`trigger_logic` for every existing automation, preserving behaviour:

- **sensor_threshold** → `sensor` leaf; if `weather_mode='skip'` →
  `AND NOT weather(rain_forecast)`; if `'defer'` →
  `(sensor AND NOT rain_forecast) OR sensor(<critical)`.
- **time_scheduled** → `AND` of: a `time` leaf with a slot
  `[scheduled_time, scheduled_time+5m]` (so the 5-min tick catches the edge) on
  all/active days; a `task_due` leaf when controlling blueprints exist;
  `AND NOT rain_forecast` when `skip_if_rained`; `OR heatwave` when
  `trigger_if_hot`.

Legacy columns (`trigger_kind`, `weather_mode`, `defer_*`, `sensor_*`,
`scheduled_time`, …) are **kept read-only** through the transition and dropped in
the cleanup phase once nothing reads them.

## UI — unified condition-tree builder (free tree)

One `AutomationBuilderModal` replacing both existing modals:
- **Recursive tree editor**: root group with an AND/OR switch; each row is a leaf
  or a nested group; "+ condition" / "+ group" / delete; an **is/isn't** toggle
  per row.
- **Leaf editors** by kind: sensor (metric · comparator · value · sensors/area ·
  agg), time (per-day **slot** editor — chips per weekday, each with add/remove
  `HH:MM–HH:MM` ranges, overnight allowed), task_due (blueprint picker), weather
  (rain forecast mm/%/window · heatwave °C).
- **Actions** section unchanged (notification / valve open / close, ordered).
- **Cooldown** + active toggle.
- Guard-rails: empty groups invalid; a tree with no edge-capable leaf warns;
  plain-English live summary ("Waters 30s when moisture < 30% AND it isn't going
  to rain — weekdays 08:00–20:00").
- `data-testid` throughout.

Card shows a generated plain-English summary + the "Waiting…"/last-run state.

## Phasing (each phase ships independently, behaviour-preserving)

- **Phase 1 — Engine + schema + auto-convert (backend only).** Add
  `trigger_logic` + edge-state columns; build `_shared/conditionTree.ts`; the
  `evaluate-automations` loop; retire scheduled firing in `run-automations`;
  backfill existing automations. Old modals keep writing old fields **and** a
  regenerated `trigger_logic` so nothing breaks. App behaviour unchanged.
- **Phase 2 — Unified builder UI.** Ship the tree builder; route new + edit
  through it; deprecate the two old modals.
- **Phase 3 — Cleanup.** Drop legacy columns/code (`evaluateHybrid`, defer_*,
  trigger_kind, scheduled_time, etc.), update Area Coach to read the tree.

## Files (Phase 1)

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_condition_tree.sql` (new) | `trigger_logic jsonb`, `condition_was_true`, generalise `last_fired_at`; backfill fn |
| `supabase/functions/_shared/conditionTree.ts` (new) | pure types + `evaluateTree` + leaf evaluators + `isWithinSchedule` |
| `supabase/functions/evaluate-automations/index.ts` (rename of evaluate-sensor-automations) | gather context + evaluate tree + edge fire |
| `supabase/functions/run-automations/index.ts` | retire scheduled firing; keep valve drain + manual run |
| `supabase/config.toml` + cron migration | point the 5-min cron at `evaluate-automations` |

## Tests (mandatory)

- **Deno** `conditionTree.test.ts` — `evaluateTree` (AND/OR/NOT, nesting, empty
  group), each leaf evaluator, `isWithinSchedule` (weekday match, overnight wrap,
  timezone day-boundary, empty = off vs all-day), rising-edge helper.
- **Deno** `conditionConvert.test.ts` — auto-convert each legacy shape →
  equivalent tree.
- **Vitest** (Phase 2) — tree builder add/remove/negate, leaf editors, summary
  generator.
- e2e-test-plan + TESTING counts updated each phase.

## Risks / edge cases

- **Timezone + overnight slots** — pure `isWithinSchedule(now, schedule, tz)` with
  explicit day-boundary + wrap tests.
- **Rising-edge correctness** — store `condition_was_true`; cooldown as floor;
  test "stays true → fires once".
- **Migration fidelity** — `conditionConvert` unit-tested against every legacy shape.
- **Manual run** — bypasses the tree (fires actions now), preserved.
- **Valve-queue drain** stays put; only the *trigger* side moves.

## Out of scope (later)

- Time-of-day as a precise *trigger moment* beyond 5-min granularity.
- Conditions beyond sensor/time/task/weather (e.g. device state, sun position).
- Cross-automation dependencies.
