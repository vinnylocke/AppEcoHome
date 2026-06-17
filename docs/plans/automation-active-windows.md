# Automation active windows + scope Smart weather to sensor automations

Two related changes to automations:

1. **Remove Smart (defer) weather handling from `time_scheduled` automations.** Scheduled automations keep only **Off / Skip**. Smart (defer-and-recheck) stays on **sensor_threshold** automations, where a moisture sensor naturally closes the loop.
2. **Add "active windows"** — let the user choose *when an automation is allowed to run*: which days of the week, an optional time-of-day window, and an optional date range. E.g. "weekdays, 08:00–20:00" or "only Jun–Aug".

## App-reference consulted

- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — both builders, trigger kinds, weather handling.
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `automations` columns.
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `run-automations` (hourly) + `evaluate-sensor-automations` (5 min).
- [99-cross-cutting/29-seasonality.md] / `homes.timezone` — local-time evaluation.

## ⚠️ Verified against production

`homes.timezone` is an IANA zone (e.g. `Europe/London`). `automations.scheduled_time` is a `time` stored/compared in **UTC** (the card labels it "UTC"). Active-window times will be authored + evaluated in the **home's local timezone** (what the user means by "8am"), converted with `Intl.DateTimeFormat`. Re-introspect `automations` before the migration (schema has drifted before).

---

## Part 1 — Scope Smart to sensor automations

### Changes
- **`WeatherHandlingSection.tsx`** — add `allowDefer?: boolean` (default `true`). When `false`, render only **Off / Skip** (no Smart button, no defer dials, no moisture-target).
- **`AutomationModal.tsx`** (scheduled) — pass `allowDefer={false}`; remove the Smart wiring added last change: `moistureTarget` state, `areasWithSensor` load, `canDefer`, and the `smartRule` payload block. Payload writes only `weather_mode ∈ {off, skip}` + `skip_if_rained` + `rain_threshold_mm` + `weather_min_probability`.
- **`SensorAutomationModal.tsx`** — unchanged (keeps all three modes).
- **Back-compat:** any existing scheduled automation already on `weather_mode='defer'` (only possible from the last release) — a one-line migration `UPDATE automations SET weather_mode='skip' WHERE trigger_kind='time_scheduled' AND weather_mode='defer'` so none are stranded. The defer columns stay on the table (sensor automations use them); no column drops.

No engine change needed — `run-automations` already only *hands off* defer when `weather_mode='defer'`; once scheduled automations can't be set to defer, that path is simply never taken for them.

---

## Part 2 — Active windows

### Data model (migration, additive)

New nullable columns on `automations` (all default to "always active"):

| Column | Purpose |
|--------|---------|
| `active_days smallint[]` | Days the automation may run; ISO `1`=Mon … `7`=Sun. `NULL`/empty = every day. |
| `active_start_time time` | Daily window start (local). `NULL` = from 00:00. |
| `active_end_time time` | Daily window end (local). `NULL` = to 24:00. |
| `active_start_date date` | Seasonal start (local). `NULL` = no lower bound. |
| `active_end_date date` | Seasonal end (local). `NULL` = no upper bound. |

Grandfathered table → no new grants. All NULL/empty means today's behaviour (unchanged).

### Pure gate (`_shared/automationSchedule.ts`, new + unit-tested)

```ts
isWithinActiveWindow(now: Date, cfg: ActiveWindow, timezone: string): boolean
```

- Convert `now` → the home's local **weekday / HH:mm / date** via `Intl.DateTimeFormat(timezone, …)` (deterministic, testable).
- `active_days` set and weekday ∉ it → false.
- time-of-day outside `[active_start_time, active_end_time]` → false (handles `NULL` bounds; if `start <= end` it's a same-day window; document that overnight windows are out of scope for v1 — the UI enforces start < end).
- date outside `[active_start_date, active_end_date]` → false.
- otherwise true.

### Wiring the gate

- **`evaluate-sensor-automations`** — after loading the automation, **before** the rule/weather evaluation, skip (decision `outside_active_window`) when `!isWithinActiveWindow(...)`. Needs the home's `timezone` (join/load per home, cached in the batch). A pending `defer_until` that comes due outside the window simply holds (no water) until back inside.
- **`run-automations`** — gate scheduled fires the same way (a scheduled automation only fires when today's weekday/date is in-window; its `scheduled_time` should sit inside the time-of-day window — the builder validates this).
- Both read `homes.timezone`; fall back to `UTC` when null.

### UI — "When is this active?" section (BOTH builders)

A shared **`ActiveWindowSection.tsx`** (mirrors `WeatherHandlingSection` style), rendered in both modals:
- **Day toggles** — S M T W T F S chips (default all on). "Weekdays" / "Every day" quick-set buttons.
- **Time window** — an "All day" toggle; when off, two time inputs (from / to). For scheduled automations, validate that `scheduled_time` falls within the window.
- **Date range (optional)** — an "All year" toggle; when off, start/end date pickers (seasonal).
- Persona note: rookie sees the simple day chips + All-day toggle; the date range sits under a small "Seasonal (optional)" disclosure.
- `data-testid` on the section, day chips, and time/date inputs.

Card (`AutomationCard.tsx`) shows a compact summary chip when not always-on (e.g. "Mon–Fri · 08:00–20:00").

### Service / load
`AutomationsSection.tsx` selects the new columns into `AutomationFull` + the edit-load select; both builders read/write them. New `ActiveWindow` shape + `activeWindowFromRow()` helper alongside the section component.

---

## Files

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_automation_active_windows.sql` (new) | active-window columns; back-fill scheduled defer→skip |
| `supabase/functions/_shared/automationSchedule.ts` (new) | pure `isWithinActiveWindow` + types |
| `supabase/functions/evaluate-sensor-automations/index.ts` | gate on active window (+ load home timezone) |
| `supabase/functions/run-automations/index.ts` | gate scheduled fires on active window |
| `src/components/integrations/WeatherHandlingSection.tsx` | `allowDefer` prop |
| `src/components/integrations/ActiveWindowSection.tsx` (new) | day/time/date controls + `activeWindowFromRow` |
| `src/components/integrations/AutomationModal.tsx` | drop Smart wiring; add active-window section |
| `src/components/integrations/SensorAutomationModal.tsx` | add active-window section |
| `src/components/integrations/AutomationsSection.tsx` | select + carry new columns; summary on card |
| `src/components/integrations/AutomationCard.tsx` | active-window summary chip |

## Tests (mandatory)

- **Deno** `automationSchedule.test.ts` — `isWithinActiveWindow`: weekday in/out, time-window in/out + NULL bounds, date range in/out, timezone conversion (e.g. 23:30 UTC = next-day local), all-NULL = always true.
- **Deno** `evaluate-sensor-automations` path stays green; add a case that an out-of-window automation skips.
- **Vitest** — `activeWindowFromRow` defaults/round-trip; `WeatherHandlingSection` hides Smart when `allowDefer={false}`.
- e2e-test-plan + TESTING counts updated.

## Docs

- `06-integrations-automations.md` — active windows + scheduled = Off/Skip only.
- `09-data-model-integrations.md` — new columns.
- `11-cron-jobs.md` — both runners gate on the active window.

## Decisions / open questions

- **Overnight time windows** (e.g. 20:00–06:00) are **out of scope for v1** — UI enforces start < end. Flag if you want them.
- **Day numbering:** ISO Mon=1…Sun=7 (stored), rendered as S–S chips.
- Active window gates **all** firing including deferral rechecks (a deferred watering won't fire outside the window — it waits).

## Risks / edge cases

- Timezone correctness is the main risk → the gate is a pure, timezone-parameterised function with explicit tests (incl. a UTC↔local day-boundary case).
- A misconfigured scheduled automation whose `scheduled_time` is outside its time window would never fire → the builder validates and warns.
