# Automations — failed valve runs invisible in history + wrong manual valve state

**Date:** 2026-07-16
**Trigger:** User-reported incident, 2026-07-15 ~13:00 UTC. An eWeLink valve automation hit a
communication failure; (1) run history showed the run as **success**, (2) the manual valve modal
showed **Off** while the valve was physically running, forcing an on→off double-toggle to close it.

## Incident reconstruction (prod evidence)

- Run `bd2faa9b` (automation `7f880b3d`, 2026-07-15 13:00:06): `automation_runs.status = "success"`,
  `devices_triggered = { valves_queued: 1, members_alerted: 2 }`.
- Its `automation_valve_queue` `turn_on` row: **`status: "failed", error_message: "ewelink control
  failed"`**, `fired_at: null`. No `turn_on` row exists in `valve_events` for 13:00 (compare the
  healthy 16:00 run and 2026-07-14 14:45, both with on/off pairs).
- The paired `turn_off` still fired at 13:06 into a valve that never opened (harmless but confusing).
- `device_readings` for valve `d44ba301` ("Climbers Left Side Front", Sonoff **SWV-ZNE**,
  `use_sub_device: true`, `sub_device_id: fffffd34…`, `parent_device_id: 10026c962a`) traces the
  manual session exactly: 13:01:04 **off** (modal open → state fetch), 13:01:09 **on** (Turn On),
  13:02:28 **off** (modal re-open → phantom state), 13:02:36 **on** (forced re-on), 13:02:39 **off**
  (real close).

## Root causes

**Bug 1 — run history lies on valve failure.** `evaluate-automations` writes the
`automation_runs` row optimistically (`success`, `valves_queued: N`) when it *queues* the valve.
The actual actuation happens in `_shared/valveQueue.ts` (`drainValveQueue`), which on failure marks
the **queue row** failed and sends the corrective "failed" receipt — but **never updates the parent
`automation_runs` row**. `AutomationRunHistory` reads only `automation_runs` → shows success.

**Bug 2 — state endpoint queries the wrong device.** For sub-device valves,
`integrations-ewelink-state` targets `meta.parent_device_id` (the Zigbee **bridge**), while
`buildControlPayload` (control path) targets `meta.sub_device_id`. The bridge's status has no
`switch` param, and `parseDeviceState` **defaults a missing switch to "off"**. So every state fetch
for a sub-device valve reports "off" regardless of reality — and writes that phantom "off" into
`device_readings`. The modal (`ValveControlPanel`) then **disables the Turn Off button** when state
is off/unknown, forcing the observed on→off workaround.

## App-reference files consulted

- `docs/app-reference/07-management/06-integrations-automations.md` (run pipeline, queue drain, receipts, run history)
- `docs/app-reference/07-management/05-integrations-devices.md` (valve control panel surface)
- `docs/app-reference/99-cross-cutting/09-data-model-integrations.md` (devices/readings/queue/events model)
- `docs/app-reference/99-cross-cutting/11-cron-jobs.md` (drain cadence: inline + every-minute cron)

## Source changes

### Part A — run history reflects valve failures

1. **`supabase/functions/_shared/valveQueue.ts`**
   - New small pure helper `runStatusAfterValveFailure(anySiblingTurnOnFired: boolean): "failed" | "partial"`.
   - At every site that marks a **`turn_on`** queue row `failed` (pre-flight lookups, control
     failure, catch-all drain error), also update the parent `automation_runs` row
     (`entry.automation_run_id`): `status` → `partial` when another `turn_on` for the same run
     already `fired`, else `failed`; merge `{ valve_error: <message> }` into `devices_triggered`
     (object shape only — condition-engine runs; legacy array rows can't reach this path).
   - The **stale-claim sweep** currently dead-letters stuck `turn_on` rows with a bulk update —
     change it to select the stale rows first, then mark each row + its parent run the same way.
   - `turn_off` failures deliberately do **not** downgrade the run (the watering happened; the
     device-side `countdown` sent with turn_on closes the valve regardless). Noted as a conscious
     choice, revisit if a stuck-open incident recurs.
2. **`src/lib/automationRunSummary.ts`** — add `valve_error?: string` to `ObjectShape`; when
   present, emit a `"valve failed"` chip (with the error available for the history drill-down).
3. **`src/components/integrations/AutomationRunHistory.tsx`** — surface the `valve_error` text on
   failed/partial rows (data-testid `run-valve-error`). `failed`/`partial` status pills already
   render (constraint + UI both know them).

### Part B — manual valve state tells the truth

4. **`supabase/functions/_shared/integrations/ewelinkDevice.ts`**
   - New exported `resolveTargetDeviceId(meta, externalDeviceId?)` — the single targeting rule
     (`use_sub_device ? external ?? sub_device_id ?? parent_device_id : direct_device_id`).
     Refactor `buildControlPayload` to use it (no behaviour change on the control path).
   - `parseDeviceState`: return `state: "on" | "off" | "unknown"` — `"unknown"` when `params` has
     neither `switch` nor `switches[0].switch` (today's silent `"off"` default). Update
     `ParsedEwelinkState`.
5. **`supabase/functions/integrations-ewelink-state/index.ts`**
   - Select `external_device_id` and use `resolveTargetDeviceId` — the state query now hits the
     **valve**, not the bridge.
   - When parsed state is `"unknown"`, **skip `insertReading`** (stop poisoning `device_readings`
     with phantom states) and return `{ state: "unknown" }` (the panel already renders "—").
     `ValveReading` type stays `"on" | "off"` — unknown is never persisted.
6. **`src/components/integrations/ValveControlPanel.tsx`** — Turn Off is disabled only when state
   is confidently `"off"` (`disabled={loading !== null || state === "off"}`), so an
   unknown-state valve can always be force-closed. Turn On unchanged.

`parseDeviceState` has no other consumers (only the state endpoint), verified by grep.

## Tests (mandatory tier mapping)

- **Deno** — extend `supabase/tests/valveQueue.test.ts`: failed `turn_on` → parent run `failed` +
  `valve_error` merged; sibling already fired → `partial`; stale-sweep dead-letter marks runs too;
  successful path leaves run untouched. Extend `supabase/tests/ewelinkDevice.test.ts`:
  `resolveTargetDeviceId` matrix (sub-device external/sub/parent fallbacks, direct);
  `parseDeviceState` `"unknown"` on missing params, existing on/off unchanged;
  `buildControlPayload` still targets identically post-refactor.
- **Vitest** — extend `tests/unit/lib/automationRunSummary.test.ts`: `valve_error` chip, absent key
  unchanged.
- **Playwright** — none feasible (real provider I/O); test-plan rows noted as unit-covered.

## Test documentation updates

- `docs/e2e-test-plan/13-management.md` — note the run-history failed/partial + `run-valve-error`
  testid rows (planned, unit-covered) under the Integrations section.
- `TESTING.md § Current Test Inventory` — update the `valveQueue.test.ts`, `ewelinkDevice.test.ts`,
  `automationRunSummary.test.ts` rows + counts.

## App-reference updates (same task)

- `07-management/06-integrations-automations.md` — run pipeline: drain failures now correct the run
  row (`failed`/`partial` + `valve_error`); error-states table row updated (provider failure is no
  longer invisible).
- `07-management/05-integrations-devices.md` — valve panel state semantics: sub-device targeting,
  `"unknown"` state, Turn Off always available unless confidently off.
- `99-cross-cutting/09-data-model-integrations.md` — `devices_triggered.valve_error` key;
  state-endpoint reading semantics (no phantom writes on unknown).

## Risks / edge cases

- **Historical rows are not corrected** — only new failures get the accurate status. The July 15
  run stays "success" in history (noted here as the record).
- Runs that used to read "success" will now show `failed`/`partial` — matches what receipts already
  said, so this aligns surfaces rather than changing policy.
- The parent-run update must not race the run's own insert — it can't: the queue row references
  `automation_run_id`, which exists before any queue row is created.
- eWeLink cloud may legitimately return sparse params on a live sub-device query; `"unknown"` +
  skip-reading degrades gracefully (previous behaviour claimed "off" and recorded it).
- `resolveTargetDeviceId` refactor is behaviour-preserving for control (guarded by existing +
  extended Deno tests).

## Out of scope

- Cancelling the paired `turn_off` when its `turn_on` failed (kept as a harmless safety send).
- Marking runs on `turn_off` failure (see Part A note).
- Backfilling/correcting historical `automation_runs` rows.
- eWeLink webhook/push state (polling stays).

## Implementation notes (2026-07-16)

- **Simplification vs plan:** `automation_runs` already has an `error_message` column that
  `AutomationRunHistory` selects and renders in red — so the failure reason is written there
  instead of merging a `valve_error` key into `devices_triggered`, and `automationRunSummary.ts`
  needed **no change** (the planned "valve failed" chip is redundant next to the Failed/Partial
  status pill + red error line). Only a `run-valve-error` data-testid was added to the existing
  error line.
- The stale-sweep dead-letter uses `update(...).select("id, automation_run_id")` (update-returning)
  rather than select-then-update, so it stays a single UPDATE and the existing sweep test contract
  holds.
- Two pre-existing tests pinned the old "missing switch → off" default; they were updated to the
  new `"unknown"` contract (the behaviour change is the fix). A present-but-unrecognised switch
  value still reads "off".
- No e2e-test-plan file covered Integrations/Automations (pre-existing gap; `automations.spec.ts`
  rows lived only in TESTING.md) — created `docs/e2e-test-plan/31-integrations.md` and registered
  it in the index.

## Code review outcome (2026-07-16)

Fresh `code-reviewer` verdict: **fix first** — one medium-high finding, applied before ship:

- **Manual "Run now" clobbered the downgrade.** `runAutomation` (`run-automations/index.ts`)
  drained inline and then unconditionally wrote `status: "success"`, wiping the `failed`/`partial`
  the drain had just written — reviving the exact incident symptom on the manual path. Fixed with
  `finaliseRunSuccess` (`_shared/valveQueue.ts`): a CAS flip `pending → success` guarded on
  `status = 'pending'`. When the flip loses, the manual response returns the run's real status and
  the "ran" receipt is skipped (the drain already sent the corrective "failed" one — previously
  the user received both). Regression-tested in `valveQueue.test.ts` (the guard filter is asserted).
- **Accepted (low):** with multiple valves in one run, `failed` vs `partial` depends on drain
  processing order (a failing entry checked before its sibling fires reads `failed`). Both label
  the run as problem-bearing; deterministic classification would need a post-drain re-evaluation —
  not worth the complexity now.
- Reviewer verified clean: constraint allows `failed`/`partial`; `resolveTargetDeviceId` is exact
  behaviour parity (incl. legacy sub-devices without `sub_device_id` falling back to the parent);
  no consumer breaks on the `"unknown"` state (never persisted; chips/deriveValveState read
  events/queue, not the endpoint); the panel can't get stuck (both buttons enabled on unknown);
  the dead-letter sweep is idempotent across drains.

## Release notes

Add under next bump: "Automation run history now shows when a valve couldn't be reached (failed /
partial status with the error), and the manual valve control reads the true valve state for
bridge-connected (Zigbee) valves — no more phantom 'Off'."
