# Sensor automations — re-fire while true + home default run window

**Feedback:** *"My only automation looks at two sensors and runs when one is below 30, but it hasn't run today. I set no start/end time so I'd expect it to have run. Is there a built-in start/end time? Would a default be useful, editable? Can you see why it hasn't fired?"*

## Diagnosis — why it hasn't fired

There is **no built-in start/end time**. A sensor-only automation has no `time` leaf, so it is evaluated 24/7 every 5 minutes by `evaluate-automations`. The non-firing is the **rising-edge** rule in [`shouldFire`](../../supabase/functions/_shared/conditionTree.ts#L236-L248):

```ts
if (!nowTrue) return false;
const cooledDown = lastFiredAt === null || (now - lastFiredAt) >= cooldownMinutes*60_000;
if (!wasTrue) return cooledDown;   // rising edge
return false;                      // already true and holding → NEVER re-fires
```

An automation fires only on the **false→true transition**. Once `condition_was_true` is set, it holds and never re-fires while the condition stays true — the cooldown is ignored in that branch. So "any sensor < 30" fires **once** when moisture first drops below 30, then goes silent until moisture climbs back above 30 and drops again. With a notify-only action, or a valve that never lifts moisture over 30, it fires exactly once, ever — which reads as "it hasn't run today".

Secondary suspects to rule out for this specific automation: (a) the two linked sensors have no recent `device_readings` (empty obs ⇒ `evalSensorLeaf` returns false), (b) the automation is toggled inactive (`is_active = false`). The "any sensor below 30" intent itself is built correctly — the sensor-leaf default agg mode is `any` ([conditionTree.ts:36](../../src/lib/conditionTree.ts#L36)).

## Decisions (confirmed with user)

1. **Re-fire model:** repeat while the condition stays true, gated by the existing **cooldown** *and* the existing **run-limit** (`run_limit_count` / `run_limit_window_hours`).
2. **Default run window:** a **home-level** default active window, **pre-populated 08:00–20:00**, that applies only when an automation's condition tree has **no** time/date condition of its own. Editable from a settings/Integrations surface. Prevents surprise overnight watering.

## App-reference consulted

- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — builder, trigger kinds, weather/defer, run-limit, cooldown.
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — `automations` columns, condition tree, run-limit, `automation_runs` statuses.
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `evaluate-automations` (5-min) + `run-automations` (valve drain) ownership.
- [99-cross-cutting/01-data-model-home.md](../app-reference/99-cross-cutting/01-data-model-home.md) — `homes` columns (new default-window columns land here).

---

## Part A — Re-fire while condition holds

### `shouldFire` change ([_shared/conditionTree.ts](../../supabase/functions/_shared/conditionTree.ts))

```ts
if (!nowTrue) return false;
const cooledDown = lastFiredAt === null || (now - lastFiredAt) >= cooldownMinutes*60_000;
return cooledDown;   // fire on rising edge OR when cooldown has elapsed while still true
```

The `wasTrue` parameter is now only used by the caller for `condition_was_true` bookkeeping; the firing decision collapses to "true now AND cooled down". The run-limit gate already runs **after** `shouldFire` in [evaluate-automations:224-245](../../supabase/functions/evaluate-automations/index.ts#L224-L245), so the per-window cap is automatically respected — no engine change needed there beyond confirming order.

**Cooldown source:** `automations.sensor_cooldown_minutes` (default 60) bounds re-fire frequency. The plan keeps that default.

### Behaviour-change risk (must flag)

This is a **global** change to `shouldFire`, so it also affects time-scheduled automations (a `time` leaf is true for its whole slot). With a wide slot + no run-limit, such an automation would re-fire every cooldown during the window. Mitigations:
- The cooldown default (60 min) bounds it.
- Time-scheduled automations converted from the legacy model use narrow slots, so most fire once.
- **Recommendation:** keep the change global (matches the user's mental model of "keep acting while the condition is true") and lean on cooldown + run-limit. Note this explicitly in the app-reference + release notes so existing wide-slot automations are reviewed.

(Alternative considered: a per-automation `fire_mode` toggle. Rejected — the user chose "repeat while true", not a per-automation choice, and run-limit already provides the safety bound.)

## Part B — Home default run window

### Schema (migration)

Add to `homes`:

```sql
ALTER TABLE public.homes
  ADD COLUMN IF NOT EXISTS automation_window_start time NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS automation_window_end   time NOT NULL DEFAULT '20:00',
  ADD COLUMN IF NOT EXISTS automation_window_enabled boolean NOT NULL DEFAULT true;
```

`homes` predates the Data-API grant deadline (grandfathered) — no new grants required. Apply locally first (`supabase migration up`); push only on explicit go-ahead.

### Engine gate ([evaluate-automations/processOne](../../supabase/functions/evaluate-automations/index.ts#L166))

After building `leaves`, detect whether the tree contains **any** `time` or `date_range` leaf:

- **Has one** → the automation defines its own schedule; the default window does **not** apply (today's behaviour).
- **Has none** AND `automation_window_enabled` → wrap the fire decision in a window check: fire only when the home's local time is within `[automation_window_start, automation_window_end]`. Reuse the existing `isWithinSchedule`/`localParts` tz logic (home timezone already loaded into `tzByHome`). An overnight window (`end <= start`) wraps midnight, consistent with `isWithinSchedule`.

The window gates **firing**, not evaluation — `condition_was_true` bookkeeping still updates so the rising edge isn't lost across the window boundary.

### Behaviour-change risk (must flag)

Existing sensor-only automations that previously ran 24/7 will, after this lands, only act inside 08:00–20:00. This is the **intended** safety default per the user ("so users don't get surprise times"). Flag in release notes; the window is editable/disable-able so anyone wanting 24/7 can widen or turn it off.

### Settings UI

Add an **"Automation defaults"** card to the Integrations → Automations tab (top of [AutomationsSection.tsx](../../src/components/integrations/AutomationsSection.tsx), gated by `automations.manage`): two `<input type="time">` fields (start/end) + an enable toggle, pre-filled from `homes`. `data-testid`s: `automation-window-start`, `automation-window-end`, `automation-window-enabled`, `automation-window-save`. A one-line helper: *"Automations without their own time condition only act inside these hours."*

Read/write via a small service or inline `supabase.from("homes")` update scoped to `homeId`.

## Files changing

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_automation_default_window.sql` | New: 3 columns on `homes`. |
| [supabase/functions/_shared/conditionTree.ts](../../supabase/functions/_shared/conditionTree.ts) | `shouldFire` re-fire-while-true. |
| [supabase/functions/evaluate-automations/index.ts](../../supabase/functions/evaluate-automations/index.ts) | Load home window; apply window gate when tree has no time/date leaf. |
| [src/components/integrations/AutomationsSection.tsx](../../src/components/integrations/AutomationsSection.tsx) | "Automation defaults" settings card. |
| (maybe) `src/lib/automationWindow.ts` | Pure helper: "tree has a time/date leaf?" + window-membership, for unit + Deno test reuse. |

## Tests

- **Deno** ([supabase/tests/](../../supabase/tests/)) — extend `conditionTree`/`automationEvaluator` tests: `shouldFire` re-fires after cooldown while true; respects cooldown; window gate fires inside / skips outside the window; tree-with-time-leaf bypasses the window.
- **Vitest** — if `automationWindow.ts` lands, unit-test the "has time/date leaf" + window-membership helpers.
- **Playwright** — settings card saves start/end + toggle; values persist on reopen. New Page Object selectors.

## App-reference to update

- [07-management/06-integrations-automations.md](../app-reference/07-management/06-integrations-automations.md) — re-fire-while-true semantics; the new Automation defaults card + window-fallback rule.
- [99-cross-cutting/09-data-model-integrations.md](../app-reference/99-cross-cutting/09-data-model-integrations.md) — note the firing-model change.
- [99-cross-cutting/11-cron-jobs.md](../app-reference/99-cross-cutting/11-cron-jobs.md) — `evaluate-automations` firing model + window gate.
- [99-cross-cutting/01-data-model-home.md](../app-reference/99-cross-cutting/01-data-model-home.md) — new `homes` columns.

## Release notes

Two user-visible entries: (1) sensor automations now keep acting while the condition holds (cooldown + run-limit bounded); (2) new default run window (08:00–20:00) for automations without their own time condition, editable in Integrations.
